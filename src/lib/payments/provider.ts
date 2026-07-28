/**
 * Grihasti — payment provider abstraction.
 *
 * The order pipeline (create -> pay -> payout -> refund) is the risky core and
 * is built and tested against this interface, not against Razorpay. Razorpay
 * arrives at the end as a single adapter implementing `PaymentProvider`; if it
 * ever needs replacing (or a second provider added for international cards),
 * nothing above this line changes.
 *
 * Rules that hold for every implementation:
 *  - Payment is WEBHOOK-AUTHORITATIVE (spec §10). A client-side "payment
 *    succeeded" callback is a UI hint, never a state transition.
 *  - `verifyWebhook` must authenticate the payload cryptographically before
 *    anything downstream trusts it.
 *  - Webhooks are at-least-once. Every event may arrive twice; idempotency is
 *    enforced downstream by the ledger constraint and the order status check.
 */

/** Amounts crossing a provider boundary are in paise — never floats. */
export type Paise = number;

export const toPaise = (inr: number): Paise => Math.round(inr * 100);
export const fromPaise = (p: Paise): number => Math.round(p) / 100;

export interface CreateIntentArgs {
  /** Our internal order id — echoed back on the webhook for correlation. */
  orderId: string;
  amountInr: number;
  customerEmail?: string | null;
  customerPhone?: string | null;
  notes?: Record<string, string>;
}

export interface PaymentIntent {
  /** The provider's handle for this payment attempt. */
  providerOrderId: string;
  amountInr: number;
  currency: "INR";
  /** Anything the client SDK needs to open checkout (public key, etc). */
  clientConfig: Record<string, unknown>;
}

export type PaymentEventKind = "payment.captured" | "payment.failed" | "refund.processed";

export interface PaymentEvent {
  kind: PaymentEventKind;
  /** Our order id, recovered from provider notes/receipt. */
  orderId: string;
  /** The provider's payment id — stored, and unique per order. */
  paymentRef: string;
  amountInr: number;
  raw: unknown;
}

export type VerifyResult =
  | { ok: true; event: PaymentEvent }
  | { ok: false; reason: "bad_signature" | "malformed" | "unhandled_event" };

export interface RefundResult {
  ok: boolean;
  refundRef?: string;
  error?: string;
}

export interface PaymentProvider {
  readonly name: string;

  /** Create a payment attempt for an order. Never mutates order state. */
  createIntent(args: CreateIntentArgs): Promise<PaymentIntent>;

  /**
   * Authenticate and parse a webhook. MUST verify the signature against the
   * raw request body — re-serialising parsed JSON changes bytes and breaks
   * HMAC comparison.
   */
  verifyWebhook(rawBody: string, signature: string): VerifyResult;

  /** Refund a captured payment. */
  refund(paymentRef: string, amountInr: number): Promise<RefundResult>;
}

/**
 * A ₹0 order cannot be sent to a payment provider — most, Razorpay included,
 * reject zero-value orders. This is reachable in normal operation because
 * REDEMPTION_CAP is none (spec §3.1): points can cover 100% of an order.
 *
 * Such orders are settled server-side without a provider round-trip. That is a
 * deliberate, narrow exception to the webhook-authoritative rule, and it is
 * safe only because there is no external money movement to be lied about — the
 * points debit is fully under our control and still guarded by the ledger's
 * idempotency constraint.
 */
export const ZERO_PAYMENT_REF_PREFIX = "internal_zero_";

export function isZeroValueOrder(cashDueInr: number): boolean {
  return toPaise(cashDueInr) === 0;
}
