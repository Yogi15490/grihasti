/**
 * Grihasti — Cart & pricing (pure logic). Money math for checkout.
 *
 * PRICING MODEL (confirmed): listed prices are GST-INCLUSIVE MRP. ₹900 is what
 * the customer pays; tax is backed out for the invoice. Cashback accrues on the
 * cash-paid portion only (see referral.ts).
 */

/**
 * GST rate. Spec §3.1 says 0.12 with "confirm current" — but the 12% slab was
 * collapsed in the Sept 2025 GST restructure, so 0.12 is very likely no longer
 * a valid rate for candles (HSN 3406). Default is therefore 18%, overridable
 * by env, and MUST be confirmed with a CA before go-live.
 *
 * This is config, never a literal at a call site: changing the rate is an env
 * edit and a redeploy, not a code change.
 */
export const GST_RATE = Number(process.env.GST_RATE ?? 0.18);

if (!Number.isFinite(GST_RATE) || GST_RATE < 0 || GST_RATE > 0.5) {
  throw new Error(`GST_RATE is invalid: ${process.env.GST_RATE}`);
}

export interface CartLine {
  slug: string;
  name: string;
  unitPriceInr: number; // MRP, GST-inclusive
  qty: number;
  scent?: string;
  nameMessage?: string;
}

export function money(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

export function lineTotal(line: CartLine): number {
  return money(line.unitPriceInr * line.qty);
}

export function subtotal(lines: CartLine[]): number {
  return money(lines.reduce((s, l) => s + lineTotal(l), 0));
}

/**
 * Apply points to an order. Points are 1:1 with ₹, no program cap — capped only
 * by the user's balance and the order subtotal. (spec §3.1)
 */
export function applyPoints(
  subtotalInr: number,
  requestedPointsInr: number,
  balanceInr: number,
): { pointsRedeemed: number; cashDue: number } {
  const pointsRedeemed = money(
    Math.max(0, Math.min(requestedPointsInr, balanceInr, subtotalInr)),
  );
  return { pointsRedeemed, cashDue: money(subtotalInr - pointsRedeemed) };
}

/** Split a GST-inclusive amount into net + tax, for the invoice. */
export function gstSplit(
  inclusiveInr: number,
  rate: number = GST_RATE,
): { net: number; gst: number } {
  const net = money(inclusiveInr / (1 + rate));
  return { net, gst: money(inclusiveInr - net) };
}

/** Full order summary used by checkout. */
export function orderSummary(
  lines: CartLine[],
  requestedPointsInr: number,
  balanceInr: number,
) {
  const sub = subtotal(lines);
  const { pointsRedeemed, cashDue } = applyPoints(sub, requestedPointsInr, balanceInr);
  const tax = gstSplit(sub);
  return {
    subtotalInr: sub,
    pointsRedeemed,
    cashDueInr: cashDue,
    netInr: tax.net,
    gstInr: tax.gst,
  };
}
