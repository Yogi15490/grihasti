/**
 * Grihasti — admin operations (spec §9).
 *
 * Two rules hold throughout:
 *  1. Every mutating call takes an `adminId` and writes an `admin_actions` row.
 *     An append-only ledger proves nothing if anyone can write ADJUST rows
 *     with no record of who did it or why.
 *  2. Balances are NEVER edited. Corrections are new ADJUST rows (spec §3.5).
 */

import type { Queryable } from "./db.ts";

const num = (v: unknown): number => Number(v ?? 0);

export class AdminError extends Error {
  code: "not_admin" | "not_found" | "bad_status" | "bad_input";

  constructor(message: string, code: AdminError["code"]) {
    super(message);
    this.name = "AdminError";
    this.code = code;
  }
}

/** Throws unless the user is an admin. Call at the top of every admin path. */
export async function assertAdmin(db: Queryable, userId: string): Promise<void> {
  const { rows } = await db.query<{ is_admin: boolean }>(
    `select is_admin from users where id = $1`,
    [userId],
  );
  if (!rows[0]?.is_admin) {
    throw new AdminError("Not authorised.", "not_admin");
  }
}

async function audit(
  db: Queryable,
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `insert into admin_actions (admin_id, action, target_type, target_id, detail)
     values ($1,$2,$3,$4,$5)`,
    [adminId, action, targetType, targetId, JSON.stringify(detail)],
  );
}

// ── Orders ───────────────────────────────────────────────────────────────

export interface OrderListFilters {
  status?: string;
  /** Orders flagged for refund after an oversell. Surfaces first by default. */
  heldOnly?: boolean;
  limit?: number;
}

export async function listOrders(
  db: Queryable,
  adminId: string,
  filters: OrderListFilters = {},
) {
  await assertAdmin(db, adminId);

  const { rows } = await db.query<{
    id: string;
    status: string;
    gross_total_inr: string;
    cash_paid_inr: string;
    points_redeemed_inr: string;
    gst_invoice_no: string | null;
    awb_tracking: string | null;
    fulfilment_hold: boolean;
    hold_reason: string | null;
    created_at: Date;
    email: string | null;
    item_count: string;
  }>(
    `select o.id, o.status, o.gross_total_inr, o.cash_paid_inr, o.points_redeemed_inr,
            o.gst_invoice_no, o.awb_tracking, o.fulfilment_hold, o.hold_reason,
            o.created_at, u.email,
            (select count(*) from order_items oi where oi.order_id = o.id)::text as item_count
       from orders o
       join users u on u.id = o.user_id
      where ($1::text is null or o.status = $1)
        and ($2::boolean is not true or o.fulfilment_hold)
      -- Held orders first: someone paid for stock we don't have and is waiting.
      order by o.fulfilment_hold desc, o.created_at desc
      limit $3`,
    [filters.status ?? null, filters.heldOnly ?? false, Math.min(filters.limit ?? 100, 500)],
  );

  return rows.map((r) => ({
    orderId: r.id,
    status: r.status,
    grossTotalInr: num(r.gross_total_inr),
    cashPaidInr: num(r.cash_paid_inr),
    pointsRedeemedInr: num(r.points_redeemed_inr),
    invoiceNo: r.gst_invoice_no,
    tracking: r.awb_tracking,
    fulfilmentHold: r.fulfilment_hold,
    holdReason: r.hold_reason,
    customerEmail: r.email,
    itemCount: num(r.item_count),
    createdAt: r.created_at,
  }));
}

/** Full order view: items, personalisation, address, and the ledger it moved. */
export async function getOrderDetail(db: Queryable, adminId: string, orderId: string) {
  await assertAdmin(db, adminId);

  const { rows: orderRows } = await db.query<Record<string, unknown>>(
    `select o.*, u.email, u.invite_code
       from orders o join users u on u.id = o.user_id
      where o.id = $1`,
    [orderId],
  );
  const order = orderRows[0];
  if (!order) throw new AdminError(`No such order: ${orderId}`, "not_found");

  const { rows: items } = await db.query<{
    slug: string;
    name: string;
    qty: number;
    unit_price_inr: string;
    scent: string | null;
    name_message: string | null;
  }>(
    `select p.slug, p.name, oi.qty, oi.unit_price_inr, oi.scent, oi.name_message
       from order_items oi join products p on p.id = oi.product_id
      where oi.order_id = $1`,
    [orderId],
  );

  const { rows: ledger } = await db.query<{
    user_id: string;
    email: string | null;
    type: string;
    level: number | null;
    amount_inr: string;
  }>(
    `select pl.user_id, u.email, pl.type, pl.level, pl.amount_inr
       from points_ledger pl join users u on u.id = pl.user_id
      where pl.order_id = $1
      order by pl.created_at, pl.level nulls first`,
    [orderId],
  );

  return {
    order,
    items: items.map((i) => ({
      slug: i.slug,
      name: i.name,
      qty: i.qty,
      unitPriceInr: num(i.unit_price_inr),
      scent: i.scent,
      nameMessage: i.name_message,
    })),
    ledger: ledger.map((l) => ({
      userId: l.user_id,
      email: l.email,
      type: l.type,
      level: l.level,
      amountInr: num(l.amount_inr),
    })),
  };
}

// ── Stock ────────────────────────────────────────────────────────────────

export const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD ?? 5);

export async function listStock(db: Queryable, adminId: string) {
  await assertAdmin(db, adminId);

  const { rows } = await db.query<{
    id: string;
    slug: string;
    name: string;
    stock_qty: number;
    price_inr: string;
    is_active: boolean;
    sold: string;
  }>(
    `select p.id, p.slug, p.name, p.stock_qty, p.price_inr, p.is_active,
            coalesce((
              select sum(oi.qty) from order_items oi
                join orders o on o.id = oi.order_id
               where oi.product_id = p.id
                 and o.status in ('paid','dispatched','delivered')
            ), 0)::text as sold
       from products p
      order by p.stock_qty asc, p.name`,
  );

  return rows.map((r) => ({
    productId: r.id,
    slug: r.slug,
    name: r.name,
    stockQty: r.stock_qty,
    priceInr: num(r.price_inr),
    isActive: r.is_active,
    sold: num(r.sold),
    isLow: r.stock_qty > 0 && r.stock_qty <= LOW_STOCK_THRESHOLD,
    isSoldOut: r.stock_qty === 0,
  }));
}

/**
 * Set absolute stock for a design. Absolute, not delta, because this reflects a
 * physical recount — and the delta would race with concurrent purchases.
 */
export async function setStock(
  db: Queryable,
  adminId: string,
  productId: string,
  newQty: number,
  reason: string,
) {
  await assertAdmin(db, adminId);
  if (!Number.isInteger(newQty) || newQty < 0) {
    throw new AdminError("Stock must be a non-negative integer.", "bad_input");
  }

  const { rows } = await db.query<{ stock_qty: number; slug: string }>(
    `select stock_qty, slug from products where id = $1 for update`,
    [productId],
  );
  if (!rows[0]) throw new AdminError(`No such product: ${productId}`, "not_found");

  await db.query(`update products set stock_qty = $2 where id = $1`, [productId, newQty]);
  await audit(db, adminId, "set_stock", "product", productId, {
    slug: rows[0].slug,
    from: rows[0].stock_qty,
    to: newQty,
    reason,
  });

  return { slug: rows[0].slug, from: rows[0].stock_qty, to: newQty };
}

export async function setProductActive(
  db: Queryable,
  adminId: string,
  productId: string,
  isActive: boolean,
) {
  await assertAdmin(db, adminId);
  await db.query(`update products set is_active = $2 where id = $1`, [productId, isActive]);
  await audit(db, adminId, "set_active", "product", productId, { isActive });
}

// ── Dispatch (spec §11 step 7) ───────────────────────────────────────────

export interface DispatchInput {
  orderId: string;
  awb: string;
  courierName: string;
  shiprocketOrderId?: string | null;
  labelUrl?: string | null;
}

/**
 * Record a dispatch. Deliberately separate from the Shiprocket API client: the
 * client fetches an AWB, this records it. That split means dispatch can be done
 * by hand if Shiprocket is down mid-season, and it makes §11 step 7 testable
 * without live credentials.
 */
export async function markDispatched(
  db: Queryable,
  adminId: string,
  input: DispatchInput,
) {
  await assertAdmin(db, adminId);

  const { rows } = await db.query<{ status: string; fulfilment_hold: boolean }>(
    `select status, fulfilment_hold from orders where id = $1 for update`,
    [input.orderId],
  );
  const order = rows[0];
  if (!order) throw new AdminError(`No such order: ${input.orderId}`, "not_found");

  if (order.status !== "paid") {
    throw new AdminError(
      `Cannot dispatch an order in status '${order.status}'.`,
      "bad_status",
    );
  }
  if (order.fulfilment_hold) {
    throw new AdminError(
      "Order is on fulfilment hold (oversold) — refund it instead of dispatching.",
      "bad_status",
    );
  }
  if (!input.awb?.trim()) {
    throw new AdminError("AWB tracking number is required.", "bad_input");
  }

  await db.query(
    `update orders
        set status = 'dispatched',
            awb_tracking = $2,
            courier_name = $3,
            shiprocket_order_id = $4,
            label_url = $5,
            dispatched_at = now()
      where id = $1`,
    [
      input.orderId,
      input.awb.trim(),
      input.courierName,
      input.shiprocketOrderId ?? null,
      input.labelUrl ?? null,
    ],
  );

  await audit(db, adminId, "dispatch", "order", input.orderId, {
    awb: input.awb,
    courier: input.courierName,
  });

  return { orderId: input.orderId, awb: input.awb.trim(), courier: input.courierName };
}

export async function markDelivered(db: Queryable, adminId: string, orderId: string) {
  await assertAdmin(db, adminId);
  const { rows } = await db.query<{ status: string }>(
    `select status from orders where id = $1`, [orderId],
  );
  if (!rows[0]) throw new AdminError(`No such order: ${orderId}`, "not_found");
  if (rows[0].status !== "dispatched") {
    throw new AdminError(`Cannot deliver from '${rows[0].status}'.`, "bad_status");
  }
  await db.query(`update orders set status = 'delivered' where id = $1`, [orderId]);
  await audit(db, adminId, "deliver", "order", orderId, {});
}

// ── Support: ledger + downline viewer ────────────────────────────────────

export async function getUserForSupport(db: Queryable, adminId: string, userId: string) {
  await assertAdmin(db, adminId);

  const { rows: userRows } = await db.query<{
    id: string;
    email: string | null;
    phone: string | null;
    invite_code: string;
    invites_remaining: number;
    inviter_id: string | null;
    inviter_email: string | null;
    created_at: Date;
  }>(
    `select u.id, u.email, u.phone, u.invite_code, u.invites_remaining,
            u.inviter_id, iv.email as inviter_email, u.created_at
       from users u
       left join users iv on iv.id = u.inviter_id
      where u.id = $1`,
    [userId],
  );
  const user = userRows[0];
  if (!user) throw new AdminError(`No such user: ${userId}`, "not_found");

  const [{ rows: bal }, { rows: ledger }, { rows: downline }] = await Promise.all([
    db.query<{ points_balance: string }>(`select points_balance($1)`, [userId]),
    db.query<{
      type: string; level: number | null; amount_inr: string;
      order_id: string | null; created_at: Date;
    }>(
      `select type, level, amount_inr, order_id, created_at
         from points_ledger where user_id = $1
        order by created_at desc limit 200`,
      [userId],
    ),
    db.query<{ level: number; email: string; orders_paid: string }>(
      `select level, email, orders_paid from get_downline($1, 3)`,
      [userId],
    ),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      inviteCode: user.invite_code,
      invitesRemaining: user.invites_remaining,
      inviterEmail: user.inviter_email,
      createdAt: user.created_at,
    },
    balanceInr: num(bal[0]?.points_balance),
    ledger: ledger.map((l) => ({
      type: l.type,
      level: l.level,
      amountInr: num(l.amount_inr),
      orderId: l.order_id,
      createdAt: l.created_at,
    })),
    downline: downline.map((d) => ({
      level: d.level,
      email: d.email,
      ordersPaid: num(d.orders_paid),
    })),
  };
}

/**
 * Correct a balance by hand. Writes an ADJUST row — never edits history.
 * A reason is mandatory; an unexplained balance change is indistinguishable
 * from fraud when someone audits this later.
 */
export async function adjustBalance(
  db: Queryable,
  adminId: string,
  userId: string,
  amountInr: number,
  reason: string,
) {
  await assertAdmin(db, adminId);
  if (!Number.isFinite(amountInr) || amountInr === 0) {
    throw new AdminError("Adjustment must be a non-zero amount.", "bad_input");
  }
  if (!reason?.trim()) {
    throw new AdminError("A reason is required for every adjustment.", "bad_input");
  }

  await db.query(
    `insert into points_ledger (user_id, order_id, type, level, amount_inr)
     values ($1, null, 'ADJUST', null, $2)`,
    [userId, amountInr],
  );
  await audit(db, adminId, "adjust_balance", "user", userId, { amountInr, reason });

  const { rows } = await db.query<{ points_balance: string }>(
    `select points_balance($1)`, [userId],
  );
  return { newBalanceInr: num(rows[0]?.points_balance) };
}

/** Dashboard counters for the admin home screen. */
export async function getAdminSummary(db: Queryable, adminId: string) {
  await assertAdmin(db, adminId);

  const { rows } = await db.query<Record<string, string>>(
    `select
       (select count(*) from orders where status = 'paid')::text            as awaiting_dispatch,
       (select count(*) from orders where fulfilment_hold
          and status not in ('refunded','cancelled'))::text                 as on_hold,
       (select count(*) from orders where status = 'dispatched')::text      as in_transit,
       (select coalesce(sum(cash_paid_inr),0) from orders
         where status in ('paid','dispatched','delivered'))::text           as revenue_inr,
       (select coalesce(sum(amount_inr),0) from points_ledger)::text        as outstanding_points_inr,
       (select count(*) from products where stock_qty = 0)::text            as sold_out_designs,
       (select count(*) from users)::text                                   as members,
       (select count(*) from waitlist)::text                                as waitlist_size`,
  );

  const r = rows[0];
  return {
    awaitingDispatch: num(r.awaiting_dispatch),
    onHold: num(r.on_hold),
    inTransit: num(r.in_transit),
    revenueInr: num(r.revenue_inr),
    /** Total unredeemed points across all users — a real liability. */
    outstandingPointsInr: num(r.outstanding_points_inr),
    soldOutDesigns: num(r.sold_out_designs),
    members: num(r.members),
    waitlistSize: num(r.waitlist_size),
  };
}
