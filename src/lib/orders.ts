/**
 * Grihasti — order lifecycle. The risky core (spec §3.4, §3.5, §8).
 *
 * Every function here takes a `Queryable` and MUST be called inside a
 * transaction (see db.ts `transaction()`). Half-applied payment confirmation —
 * stock decremented but no ledger rows, or earns written without the matching
 * redeem — is the one failure mode that silently corrupts the money.
 *
 * Provider-agnostic on purpose: nothing below knows Razorpay exists.
 */

import type { Queryable } from "./db.ts";
import {
  computeClawback,
  computePayout,
  toPaise as round4,
  type LedgerEntry,
} from "./referral.ts";
import { GST_RATE, money } from "./cart.ts";

const num = (v: unknown): number => Number(v ?? 0);

export interface OrderItemInput {
  slug: string;
  qty: number;
  scent?: string | null;
  nameMessage?: string | null;
}

export interface CreateOrderInput {
  userId: string;
  items: OrderItemInput[];
  requestedPointsInr?: number;
  shippingAddress?: Record<string, unknown> | null;
}

export interface CreatedOrder {
  orderId: string;
  grossTotalInr: number;
  pointsRedeemedInr: number;
  cashDueInr: number;
  /** True when points cover the whole order — must not go to a payment provider. */
  isZeroValue: boolean;
}

export type OrderErrorCode =
  | "empty_cart"
  | "unknown_product"
  | "inactive_product"
  | "insufficient_stock"
  | "bad_quantity"
  | "not_found"
  | "bad_amount"
  | "bad_status";

export class OrderError extends Error {
  // Declared as a field rather than a constructor parameter property:
  // Node's --experimental-strip-types erases types without transforming, so
  // parameter properties are a syntax error under it.
  code: OrderErrorCode;

  constructor(message: string, code: OrderErrorCode) {
    super(message);
    this.name = "OrderError";
    this.code = code;
  }
}

/**
 * Create an order in `created` state. Reserves nothing in the ledger — points
 * are only debited on payment (spec §3.5) — but the committed amount is netted
 * off `available_points` so the same balance cannot fund two open orders.
 *
 * Stock is checked but NOT decremented here, per spec §8. See confirmPayment
 * for the oversell window that follows from that.
 */
export async function createOrder(
  db: Queryable,
  input: CreateOrderInput,
): Promise<CreatedOrder> {
  if (!input.items?.length) {
    throw new OrderError("Cart is empty.", "empty_cart");
  }

  // Collapse duplicate slugs so someone adding the same design twice can't
  // slip past the per-line stock check with two lines of qty 1.
  const merged = new Map<string, OrderItemInput>();
  for (const it of input.items) {
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 50) {
      throw new OrderError(`Invalid quantity for ${it.slug}.`, "bad_quantity");
    }
    const prev = merged.get(it.slug);
    merged.set(
      it.slug,
      prev ? { ...prev, qty: prev.qty + it.qty } : { ...it },
    );
  }
  const items = [...merged.values()];

  const { rows: products } = await db.query<{
    id: string;
    slug: string;
    price_inr: string;
    stock_qty: number;
    is_active: boolean;
  }>(
    `select id, slug, price_inr, stock_qty, is_active
       from products where slug = any($1::text[])`,
    [items.map((i) => i.slug)],
  );

  const bySlug = new Map(products.map((p) => [p.slug, p]));
  let gross = 0;

  for (const it of items) {
    const p = bySlug.get(it.slug);
    if (!p) throw new OrderError(`Unknown design: ${it.slug}`, "unknown_product");
    if (!p.is_active) throw new OrderError(`${it.slug} is not on sale.`, "inactive_product");
    if (p.stock_qty < it.qty) {
      throw new OrderError(
        `Only ${p.stock_qty} left of ${it.slug}.`,
        "insufficient_stock",
      );
    }
    gross = money(gross + num(p.price_inr) * it.qty);
  }

  // Points: capped by what's actually spendable and by the order value.
  const available = num(
    await db
      .query<{ available_points: string }>(`select available_points($1)`, [input.userId])
      .then((r) => r.rows[0]?.available_points),
  );
  const requested = Math.max(0, input.requestedPointsInr ?? 0);
  const pointsRedeemed = money(Math.min(requested, Math.max(0, available), gross));
  const cashDue = money(gross - pointsRedeemed);

  const { rows: created } = await db.query<{ id: string }>(
    `insert into orders (user_id, status, gross_total_inr, points_redeemed_inr,
                         cash_paid_inr, shipping_address, gst_rate)
     values ($1, 'created', $2, $3, 0, $4, $5)
     returning id`,
    [
      input.userId,
      gross,
      pointsRedeemed,
      input.shippingAddress ? JSON.stringify(input.shippingAddress) : null,
      GST_RATE,
    ],
  );
  const orderId = created[0].id;

  for (const it of items) {
    const p = bySlug.get(it.slug)!;
    await db.query(
      `insert into order_items (order_id, product_id, qty, unit_price_inr, scent, name_message)
       values ($1,$2,$3,$4,$5,$6)`,
      [orderId, p.id, it.qty, num(p.price_inr), it.scent ?? null, it.nameMessage ?? null],
    );
  }

  return {
    orderId,
    grossTotalInr: gross,
    pointsRedeemedInr: pointsRedeemed,
    cashDueInr: cashDue,
    isZeroValue: Math.round(cashDue * 100) === 0,
  };
}

export interface ConfirmPaymentInput {
  orderId: string;
  provider: string;
  paymentRef: string;
  amountInr: number;
}

export interface ConfirmPaymentResult {
  /** True when this event was a replay — nothing was written. */
  alreadyProcessed: boolean;
  invoiceNo?: string;
  ledgerEntries: LedgerEntry[];
  fulfilmentHold: boolean;
  holdReason?: string;
}

/**
 * Confirm a verified payment. Idempotent: a replayed webhook returns
 * `alreadyProcessed` and writes nothing (spec §11 step 8).
 *
 * Order of operations matters. Stock is decremented BEFORE the order is marked
 * paid so an oversell is detected while we can still flag it — but note the
 * money has already moved by the time we get here. If stock is gone, we do NOT
 * refuse the payment (that would leave us holding funds against no order);
 * the order is recorded as paid and flagged `fulfilment_hold` for admin refund.
 */
export async function confirmPayment(
  db: Queryable,
  input: ConfirmPaymentInput,
): Promise<ConfirmPaymentResult> {
  const { rows: found } = await db.query<{
    id: string;
    user_id: string;
    status: string;
    gross_total_inr: string;
    points_redeemed_inr: string;
    payment_ref: string | null;
    gst_invoice_no: string | null;
  }>(
    `select id, user_id, status, gross_total_inr, points_redeemed_inr,
            payment_ref, gst_invoice_no
       from orders where id = $1 for update`,
    [input.orderId],
  );

  const order = found[0];
  if (!order) throw new OrderError(`No such order: ${input.orderId}`, "not_found");

  // Replay, or an event for an order that already moved on. Not an error —
  // providers retry, and a 500 here would make them retry harder.
  if (order.status !== "created") {
    return {
      alreadyProcessed: true,
      invoiceNo: order.gst_invoice_no ?? undefined,
      ledgerEntries: [],
      fulfilmentHold: false,
    };
  }

  const gross = num(order.gross_total_inr);
  const pointsRedeemed = num(order.points_redeemed_inr);
  const expectedCash = money(gross - pointsRedeemed);

  // Never trust the amount on the wire. A mismatch means either a tampered
  // webhook or a bug — both warrant refusing to write ledger rows.
  if (Math.round(input.amountInr * 100) !== Math.round(expectedCash * 100)) {
    throw new OrderError(
      `Payment amount ₹${input.amountInr} does not match amount due ₹${expectedCash}.`,
      "bad_amount",
    );
  }

  // ── Stock (spec §8, atomic conditional UPDATE) ────────────────────────
  const { rows: lineItems } = await db.query<{ product_id: string; qty: number }>(
    `select product_id, qty from order_items where order_id = $1`,
    [input.orderId],
  );

  const oversold: string[] = [];
  for (const li of lineItems) {
    const ok = await db
      .query<{ decrement_stock: boolean }>(`select decrement_stock($1,$2)`, [
        li.product_id,
        li.qty,
      ])
      .then((r) => r.rows[0]?.decrement_stock === true);
    if (!ok) oversold.push(li.product_id);
  }

  const fulfilmentHold = oversold.length > 0;
  const holdReason = fulfilmentHold
    ? `Oversold: insufficient stock for product(s) ${oversold.join(", ")} at payment time. Refund required.`
    : undefined;

  // ── Mark paid + issue invoice ─────────────────────────────────────────
  const invoiceNo = await db
    .query<{ next_invoice_no: string }>(`select next_invoice_no()`)
    .then((r) => r.rows[0].next_invoice_no);

  await db.query(
    `update orders
        set status = 'paid',
            cash_paid_inr = $2,
            paid_at = now(),
            payment_provider = $3,
            payment_ref = $4,
            gst_invoice_no = $5,
            fulfilment_hold = $6,
            hold_reason = $7,
            razorpay_payment_id = case when $3 = 'razorpay' then $4 else razorpay_payment_id end
      where id = $1`,
    [
      input.orderId,
      input.amountInr,
      input.provider,
      input.paymentRef,
      invoiceNo,
      fulfilmentHold,
      holdReason ?? null,
    ],
  );

  // ── Ledger: redeem, then earn (spec §3.4, §3.5) ───────────────────────
  const entries: LedgerEntry[] = [];

  if (pointsRedeemed > 0) {
    const e: LedgerEntry = {
      userId: order.user_id,
      orderId: input.orderId,
      type: "REDEEM",
      level: null,
      amountInr: round4(-pointsRedeemed),
    };
    if (await insertLedger(db, e)) entries.push(e);
  }

  // Cashback accrues on the CASH portion only — points must not print points.
  const { rows: upline } = await db.query<{ level: number; user_id: string }>(
    `select level, user_id from get_upline($1, 3) order by level`,
    [order.user_id],
  );

  const payout = computePayout({
    buyerId: order.user_id,
    orderId: input.orderId,
    grossTotalInr: gross,
    cashPaidInr: input.amountInr,
    upline: upline.map((u) => u.user_id),
  });

  for (const e of payout) {
    if (await insertLedger(db, e)) entries.push(e);
  }

  return { alreadyProcessed: false, invoiceNo, ledgerEntries: entries, fulfilmentHold, holdReason };
}

/**
 * Refund: reverse every earn for the order, return redeemed points, restock
 * (spec §8). Balance may go negative — that is intended, and recovered from
 * future earnings (§3.5).
 */
export async function refundOrder(
  db: Queryable,
  orderId: string,
): Promise<{ alreadyRefunded: boolean; entries: LedgerEntry[] }> {
  const { rows: found } = await db.query<{
    id: string;
    user_id: string;
    status: string;
    points_redeemed_inr: string;
  }>(
    `select id, user_id, status, points_redeemed_inr
       from orders where id = $1 for update`,
    [orderId],
  );

  const order = found[0];
  if (!order) throw new OrderError(`No such order: ${orderId}`, "not_found");
  if (order.status === "refunded") return { alreadyRefunded: true, entries: [] };
  if (!["paid", "dispatched", "delivered"].includes(order.status)) {
    throw new OrderError(
      `Cannot refund an order in status '${order.status}'.`,
      "bad_status",
    );
  }

  const { rows: earns } = await db.query<{
    user_id: string;
    type: string;
    level: number | null;
    amount_inr: string;
  }>(
    `select user_id, type, level, amount_inr
       from points_ledger
      where order_id = $1 and type in ('EARN_SELF','EARN_REFERRAL')`,
    [orderId],
  );

  const clawbacks = computeClawback(
    order.user_id,
    orderId,
    earns.map((e) => ({
      userId: e.user_id,
      orderId,
      type: e.type as LedgerEntry["type"],
      level: e.level,
      amountInr: num(e.amount_inr),
    })),
    num(order.points_redeemed_inr),
  );

  const written: LedgerEntry[] = [];
  for (const e of clawbacks) {
    if (await insertLedger(db, e)) written.push(e);
  }

  const { rows: lineItems } = await db.query<{ product_id: string; qty: number }>(
    `select product_id, qty from order_items where order_id = $1`,
    [orderId],
  );
  for (const li of lineItems) {
    await db.query(`select restock($1,$2)`, [li.product_id, li.qty]);
  }

  await db.query(
    `update orders set status = 'refunded', refunded_at = now() where id = $1`,
    [orderId],
  );

  return { alreadyRefunded: false, entries: written };
}

/**
 * Append a ledger row, relying on the DB idempotency guard. Returns false if
 * the row already existed — which is how a replayed webhook becomes a no-op.
 *
 * The `where order_id is not null` is not decoration: `idx_ledger_idempotent`
 * is a PARTIAL index (see migration 0004), and Postgres will only infer a
 * partial index when the ON CONFLICT clause repeats its predicate. Without it
 * this fails at runtime with 42P10 rather than silently degrading — but it
 * would fail inside the payment webhook, so it is worth being explicit.
 */
async function insertLedger(db: Queryable, e: LedgerEntry): Promise<boolean> {
  if (!e.orderId) {
    throw new Error(
      "insertLedger is for order-scoped rows only; off-order ADJUST rows are " +
        "written by admin tooling and are deliberately outside the guard.",
    );
  }
  const { rows } = await db.query<{ id: string }>(
    `insert into points_ledger (user_id, order_id, type, level, amount_inr)
     values ($1,$2,$3,$4,$5)
     on conflict (order_id, user_id, type, level) where order_id is not null
       do nothing
     returning id`,
    [e.userId, e.orderId, e.type, e.level, e.amountInr],
  );
  return rows.length > 0;
}

/** Points balance from the ledger — always derived, never cached (spec §3.5). */
export async function getBalance(db: Queryable, userId: string): Promise<number> {
  const { rows } = await db.query<{ points_balance: string }>(
    `select points_balance($1)`,
    [userId],
  );
  return num(rows[0]?.points_balance);
}

export async function getAvailablePoints(db: Queryable, userId: string): Promise<number> {
  const { rows } = await db.query<{ available_points: string }>(
    `select available_points($1)`,
    [userId],
  );
  return num(rows[0]?.available_points);
}
