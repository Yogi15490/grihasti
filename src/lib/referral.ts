/**
 * Grihasti — Referral & Points core (pure logic)
 * Source of truth: docs/GRIHASTI_BUILD_SPEC.md §3.
 * These functions are deliberately pure and side-effect free so they can be
 * unit-tested in isolation and reused by API routes / DB triggers.
 */

// ── Constants (spec §3.1) ─────────────────────────────────────────────
export const INVITE_GATE = 5;          // invites per member (tree branching factor)
export const UPLINE_LEVELS = 3;        // pay buyer + 3 ancestors = 4 tiers
export const BUYER_CASHBACK = 0.05;    // 5% to the buyer
export const DECAY = 0.5;              // each upline level = half the one below
export const ACCRUE_ON_CASH_ONLY = true;
export const POINT_VALUE_INR = 1;      // 1 point = ₹1

/** Per-level cashback rates: index 0 = buyer, 1..UPLINE_LEVELS = ancestors. */
export const RATES: number[] = (() => {
  const r = [BUYER_CASHBACK];
  for (let l = 1; l <= UPLINE_LEVELS; l++) r.push(BUYER_CASHBACK * Math.pow(DECAY, l));
  return r;
})(); // => [0.05, 0.025, 0.0125, 0.00625]

export type LedgerType =
  | "EARN_SELF"
  | "EARN_REFERRAL"
  | "REDEEM"
  | "CLAWBACK"
  | "ADJUST";

export interface LedgerEntry {
  userId: string;
  orderId: string | null;
  type: LedgerType;
  level: number | null; // 0 buyer, 1..3 upline, null for redeem/adjust
  amountInr: number;    // +earn / -redeem / -clawback
}

export interface PayoutInput {
  buyerId: string;
  orderId: string;
  grossTotalInr: number;
  cashPaidInr: number;
  /** Ancestors of the buyer, nearest first, already resolved (max UPLINE_LEVELS). */
  upline: string[];
}

/**
 * Round money to 4 dp (sub-paise). Cashback at level 3 is fractional paise
 * (e.g. ₹5.625), so the ledger stores 4-dp precision — numeric(12,4). Rounding
 * only to 2 dp would corrupt the spec figures and let totals drift.
 * Also normalises -0 to 0.
 */
export function toPaise(n: number): number {
  const r = Math.round(n * 1e4) / 1e4;
  return r === 0 ? 0 : r;
}

/**
 * Compute the cashback ledger entries for a confirmed, paid order. (spec §3.4)
 * Base = cash-paid portion when ACCRUE_ON_CASH_ONLY (prevents points printing points).
 */
export function computePayout(input: PayoutInput): LedgerEntry[] {
  const base = ACCRUE_ON_CASH_ONLY ? input.cashPaidInr : input.grossTotalInr;
  const entries: LedgerEntry[] = [];

  // Buyer (level 0)
  entries.push({
    userId: input.buyerId,
    orderId: input.orderId,
    type: "EARN_SELF",
    level: 0,
    amountInr: toPaise(base * RATES[0]),
  });

  // Upline, halving each level, capped at UPLINE_LEVELS or chain end
  for (let i = 0; i < input.upline.length && i < UPLINE_LEVELS; i++) {
    const level = i + 1;
    entries.push({
      userId: input.upline[i],
      orderId: input.orderId,
      type: "EARN_REFERRAL",
      level,
      amountInr: toPaise(base * RATES[level]),
    });
  }
  return entries;
}

/**
 * Reverse an order's earnings + return redeemed points. (spec §3.5 refund)
 * `orderEarnEntries` = the EARN_* rows previously written for this order.
 * `pointsRedeemedInr` = points the buyer spent on the order (returned to them).
 */
export function computeClawback(
  buyerId: string,
  orderId: string,
  orderEarnEntries: LedgerEntry[],
  pointsRedeemedInr: number,
): LedgerEntry[] {
  const out: LedgerEntry[] = orderEarnEntries
    .filter((e) => e.type === "EARN_SELF" || e.type === "EARN_REFERRAL")
    .map((e) => ({
      userId: e.userId,
      orderId,
      type: "CLAWBACK" as LedgerType,
      level: e.level,
      amountInr: toPaise(-e.amountInr),
    }));

  if (pointsRedeemedInr > 0) {
    out.push({
      userId: buyerId,
      orderId,
      type: "CLAWBACK",
      level: null,
      amountInr: toPaise(pointsRedeemedInr), // give the points back
    });
  }
  return out;
}

/** Balance = SUM(ledger). Always derived, never stored mutably. (spec §3.5) */
export function balance(entries: LedgerEntry[]): number {
  return toPaise(entries.reduce((s, e) => s + e.amountInr, 0));
}

/** Points a buyer may redeem on an order: min(requested, balance), no cap. (spec §3.1) */
export function redeemable(requestedInr: number, currentBalanceInr: number): number {
  return Math.max(0, Math.min(requestedInr, currentBalanceInr));
}
