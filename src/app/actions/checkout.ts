"use server";

import { redirect } from "next/navigation";
import { transaction, getDb } from "@/lib/db";
import { priceCart } from "@/lib/catalog";
import { createOrder, confirmPayment, getAvailablePoints, OrderError } from "@/lib/orders";
import { getCurrentUser } from "@/lib/session";
import { isZeroValueOrder, ZERO_PAYMENT_REF_PREFIX } from "@/lib/payments/provider";

export interface CartLineInput {
  slug: string;
  qty: number;
  scent?: string;
  nameMessage?: string;
}

/**
 * Re-price a client-held cart against the database. The browser's copy is a
 * convenience; this is what the customer is actually charged.
 */
export async function quoteCart(lines: CartLineInput[]) {
  const user = await getCurrentUser();
  const priced = await priceCart(lines.map((l) => ({ slug: l.slug, qty: l.qty })));
  const availablePoints = user
    ? await getAvailablePoints(await getDb(), user.userId)
    : 0;

  return {
    items: priced.items.map((i) => ({
      slug: i.slug,
      name: i.name,
      qty: i.qty,
      unitPriceInr: i.priceInr,
      lineTotalInr: i.lineTotalInr,
      available: i.available,
      stockQty: i.stockQty,
    })),
    subtotalInr: priced.subtotalInr,
    hasProblems: priced.hasProblems,
    signedIn: !!user,
    availablePointsInr: availablePoints,
  };
}

export interface PlaceOrderInput {
  lines: CartLineInput[];
  pointsToUse: number;
  address: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pin: string;
    phone: string;
  };
}

export type PlaceOrderResult =
  | { ok: true; orderId: string; cashDueInr: number; settledInternally: boolean }
  | { ok: false; error: string };

const REQUIRED_ADDRESS: (keyof PlaceOrderInput["address"])[] =
  ["name", "line1", "city", "state", "pin", "phone"];

/**
 * Create the order. Payment is deliberately NOT taken here.
 *
 * With a real provider, this returns an order in `created` state and the client
 * opens checkout; the order only becomes `paid` when the signed webhook arrives
 * (spec §10, webhook-authoritative). The one exception is a fully-points order,
 * which has no external money movement and is settled server-side.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in to place your order." };

  if (!input.lines?.length) return { ok: false, error: "Your cart is empty." };

  for (const field of REQUIRED_ADDRESS) {
    if (!String(input.address?.[field] ?? "").trim()) {
      return { ok: false, error: `Please fill in your ${field === "line1" ? "address" : field}.` };
    }
  }
  if (!/^\d{6}$/.test(input.address.pin.trim())) {
    return { ok: false, error: "Please enter a valid 6-digit PIN code." };
  }
  if (!/^(?:\+?91|0)?[6-9]\d{9}$/.test(input.address.phone.replace(/[\s\-()]/g, ""))) {
    return { ok: false, error: "Please enter a valid Indian mobile number." };
  }

  try {
    return await transaction(async (tx) => {
      const order = await createOrder(tx, {
        userId: user.userId,
        items: input.lines.map((l) => ({
          slug: l.slug,
          qty: l.qty,
          scent: l.scent ?? null,
          nameMessage: l.nameMessage ?? null,
        })),
        requestedPointsInr: Math.max(0, input.pointsToUse || 0),
        shippingAddress: input.address,
      });

      // Points covered everything. No provider can take a ₹0 payment, so this
      // settles internally — safe because no external money is involved and the
      // ledger's idempotency guard still applies.
      if (isZeroValueOrder(order.cashDueInr)) {
        await confirmPayment(tx, {
          orderId: order.orderId,
          provider: "internal",
          paymentRef: `${ZERO_PAYMENT_REF_PREFIX}${order.orderId}`,
          amountInr: 0,
        });
        return {
          ok: true as const,
          orderId: order.orderId,
          cashDueInr: 0,
          settledInternally: true,
        };
      }

      return {
        ok: true as const,
        orderId: order.orderId,
        cashDueInr: order.cashDueInr,
        settledInternally: false,
      };
    });
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.message };
    console.error("[placeOrder]", e);
    return { ok: false, error: "Something went wrong placing your order. Please try again." };
  }
}

/**
 * DEV ONLY — settle an order without a payment provider, so the full flow is
 * walkable before Razorpay is wired in. Refuses to run in production.
 */
export async function devSettleOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "Not available." };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };

  try {
    await transaction(async (tx) => {
      const { rows } = await tx.query<{ user_id: string; gross_total_inr: string; points_redeemed_inr: string }>(
        `select user_id, gross_total_inr, points_redeemed_inr from orders where id = $1`,
        [orderId],
      );
      const o = rows[0];
      if (!o) throw new Error("No such order.");
      if (o.user_id !== user.userId) throw new Error("Not your order.");

      const cashDue =
        Math.round((Number(o.gross_total_inr) - Number(o.points_redeemed_inr)) * 100) / 100;

      await confirmPayment(tx, {
        orderId,
        provider: "dev",
        paymentRef: `dev_${orderId}`,
        amountInr: cashDue,
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function goToOrder(orderId: string): Promise<never> {
  redirect(`/order/${orderId}`);
}
