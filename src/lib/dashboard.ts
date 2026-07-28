/**
 * Grihasti — referral dashboard (spec §7.7).
 *
 * This screen is the growth engine's user interface. K = invites x activation
 * (§14), and activation depends entirely on people finding, understanding and
 * sharing their link. Numbers here must reconcile exactly with the ledger —
 * a customer who thinks they earned ₹45 and sees ₹44 stops trusting the
 * programme, and a referral programme runs on trust.
 */

import type { Queryable } from "./db.ts";
import { INVITE_GATE, RATES, UPLINE_LEVELS } from "./referral.ts";

const num = (v: unknown): number => Number(v ?? 0);

export interface DownlineMember {
  level: number;
  userId: string;
  /** Masked — the dashboard shows who joined, not their contact details. */
  maskedEmail: string;
  joinedAt: Date;
  ordersPaid: number;
  /** Net earned by the viewer from this member's orders (clawbacks included). */
  earnedFromInr: number;
}

export interface EarningsBreakdown {
  /** Cashback on the viewer's own purchases. */
  ownPurchasesInr: number;
  /** Referral cashback, indexed by level 1..3. */
  byLevelInr: Record<number, number>;
  totalEarnedInr: number;
  redeemedInr: number;
  clawedBackInr: number;
  adjustmentsInr: number;
}

export interface ReferralDashboard {
  inviteCode: string;
  shareUrl: string;
  invitesRemaining: number;
  invitesUsed: number;
  circleIsFull: boolean;
  /** Ledger balance. */
  balanceInr: number;
  /** Balance minus points committed to unpaid orders — what's spendable now. */
  availableInr: number;
  earnings: EarningsBreakdown;
  downline: DownlineMember[];
  downlineCountByLevel: Record<number, number>;
  /** Cashback rates, so the UI never hardcodes them. */
  rates: { level: number; rate: number }[];
}

/** `ravi.sharma@gmail.com` -> `ra…a@gmail.com`. Enough to recognise, not to spam. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "a friend";
  const [local, domain] = email.split("@");
  if (!domain) return "a friend";
  const head = local.slice(0, 2);
  const tail = local.length > 3 ? local.slice(-1) : "";
  return `${head}…${tail}@${domain}`;
}

export function buildShareUrl(inviteCode: string, siteUrl?: string): string {
  const base = (siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://grihasti.in")
    .replace(/\/+$/, "");
  return `${base}/?ref=${encodeURIComponent(inviteCode)}`;
}

export async function getReferralDashboard(
  db: Queryable,
  userId: string,
): Promise<ReferralDashboard> {
  const { rows: userRows } = await db.query<{
    invite_code: string;
    invites_remaining: number;
  }>(`select invite_code, invites_remaining from users where id = $1`, [userId]);

  const user = userRows[0];
  if (!user) throw new Error(`No such user: ${userId}`);

  const [{ rows: balRows }, { rows: availRows }, { rows: ledgerRows }, { rows: downRows }] =
    await Promise.all([
      db.query<{ points_balance: string }>(`select points_balance($1)`, [userId]),
      db.query<{ available_points: string }>(`select available_points($1)`, [userId]),
      db.query<{ type: string; level: number | null; total: string }>(
        `select type, level, sum(amount_inr)::text as total
           from points_ledger where user_id = $1
          group by type, level`,
        [userId],
      ),
      db.query<{
        level: number;
        user_id: string;
        email: string;
        joined_at: Date;
        orders_paid: string;
        earned_from: string;
      }>(`select * from get_downline($1, $2)`, [userId, UPLINE_LEVELS]),
    ]);

  // ── Earnings, derived strictly from ledger rows ──────────────────────
  const byLevelInr: Record<number, number> = {};
  for (let l = 1; l <= UPLINE_LEVELS; l++) byLevelInr[l] = 0;

  let ownPurchasesInr = 0;
  let redeemedInr = 0;
  let clawedBackInr = 0;
  let adjustmentsInr = 0;

  for (const r of ledgerRows) {
    const amt = num(r.total);
    switch (r.type) {
      case "EARN_SELF":
        ownPurchasesInr += amt;
        break;
      case "EARN_REFERRAL":
        if (r.level != null) byLevelInr[r.level] = (byLevelInr[r.level] ?? 0) + amt;
        break;
      case "REDEEM":
        redeemedInr += amt; // negative
        break;
      case "CLAWBACK":
        clawedBackInr += amt; // negative, or positive for returned points
        break;
      case "ADJUST":
        adjustmentsInr += amt;
        break;
    }
  }

  const round = (n: number) => Math.round(n * 1e4) / 1e4;

  const downline: DownlineMember[] = downRows.map((r) => ({
    level: r.level,
    userId: r.user_id,
    maskedEmail: maskEmail(r.email),
    joinedAt: r.joined_at,
    ordersPaid: num(r.orders_paid),
    earnedFromInr: round(num(r.earned_from)),
  }));

  const downlineCountByLevel: Record<number, number> = {};
  for (let l = 1; l <= UPLINE_LEVELS; l++) downlineCountByLevel[l] = 0;
  for (const m of downline) {
    downlineCountByLevel[m.level] = (downlineCountByLevel[m.level] ?? 0) + 1;
  }

  const invitesUsed = INVITE_GATE - user.invites_remaining;

  return {
    inviteCode: user.invite_code,
    shareUrl: buildShareUrl(user.invite_code),
    invitesRemaining: user.invites_remaining,
    invitesUsed,
    circleIsFull: user.invites_remaining === 0,
    balanceInr: round(num(balRows[0]?.points_balance)),
    availableInr: round(num(availRows[0]?.available_points)),
    earnings: {
      ownPurchasesInr: round(ownPurchasesInr),
      byLevelInr: Object.fromEntries(
        Object.entries(byLevelInr).map(([k, v]) => [Number(k), round(v)]),
      ) as Record<number, number>,
      totalEarnedInr: round(
        ownPurchasesInr + Object.values(byLevelInr).reduce((a, b) => a + b, 0),
      ),
      redeemedInr: round(redeemedInr),
      clawedBackInr: round(clawedBackInr),
      adjustmentsInr: round(adjustmentsInr),
    },
    downline,
    downlineCountByLevel,
    rates: RATES.map((rate, level) => ({ level, rate })),
  };
}

export interface LedgerRow {
  id: string;
  type: string;
  level: number | null;
  amountInr: number;
  orderId: string | null;
  createdAt: Date;
  /** Plain-English line for the customer. */
  description: string;
}

const describe = (type: string, level: number | null): string => {
  switch (type) {
    case "EARN_SELF":
      return "Cashback on your order";
    case "EARN_REFERRAL":
      return level === 1
        ? "Someone you invited placed an order"
        : `Referral cashback (level ${level})`;
    case "REDEEM":
      return "Points used on an order";
    case "CLAWBACK":
      return "Reversed — order refunded";
    case "ADJUST":
      return "Adjustment by Grihasti";
    default:
      return type;
  }
};

/** Ledger history for the account page. Newest first. */
export async function getLedgerHistory(
  db: Queryable,
  userId: string,
  limit = 50,
): Promise<LedgerRow[]> {
  const { rows } = await db.query<{
    id: string;
    type: string;
    level: number | null;
    amount_inr: string;
    order_id: string | null;
    created_at: Date;
  }>(
    `select id, type, level, amount_inr, order_id, created_at
       from points_ledger
      where user_id = $1
      order by created_at desc, id desc
      limit $2`,
    [userId, Math.min(limit, 200)],
  );

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    level: r.level,
    amountInr: num(r.amount_inr),
    orderId: r.order_id,
    createdAt: r.created_at,
    description: describe(r.type, r.level),
  }));
}

/** Order history for the account page (spec §7.8). */
export async function getOrderHistory(db: Queryable, userId: string) {
  const { rows } = await db.query<{
    id: string;
    status: string;
    gross_total_inr: string;
    points_redeemed_inr: string;
    cash_paid_inr: string;
    gst_invoice_no: string | null;
    awb_tracking: string | null;
    courier_name: string | null;
    created_at: Date;
    item_count: string;
  }>(
    `select o.id, o.status, o.gross_total_inr, o.points_redeemed_inr, o.cash_paid_inr,
            o.gst_invoice_no, o.awb_tracking, o.courier_name, o.created_at,
            (select count(*) from order_items oi where oi.order_id = o.id)::text as item_count
       from orders o
      where o.user_id = $1
      order by o.created_at desc`,
    [userId],
  );

  return rows.map((r) => ({
    orderId: r.id,
    status: r.status,
    grossTotalInr: num(r.gross_total_inr),
    pointsRedeemedInr: num(r.points_redeemed_inr),
    cashPaidInr: num(r.cash_paid_inr),
    invoiceNo: r.gst_invoice_no,
    tracking: r.awb_tracking,
    courier: r.courier_name,
    itemCount: num(r.item_count),
    createdAt: r.created_at,
  }));
}
