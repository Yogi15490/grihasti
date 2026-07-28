/**
 * Grihasti — stub payment provider.
 *
 * Implements the same contract as the real thing: HMAC-signed webhooks,
 * at-least-once delivery, provider-side payment ids. The order pipeline cannot
 * tell it apart from Razorpay, which is the point — §11 steps 4-9 are provable
 * today, and the Razorpay adapter later has a passing test suite to land into.
 *
 * NOT for production. `assertNotProduction()` is called in the constructor.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  CreateIntentArgs,
  PaymentEventKind,
  PaymentIntent,
  PaymentProvider,
  RefundResult,
  VerifyResult,
} from "./provider.ts";

export const STUB_SECRET = "stub_webhook_secret_dev_only";

export class StubPaymentProvider implements PaymentProvider {
  readonly name = "stub";
  private readonly secret: string;
  private readonly intents = new Map<string, { orderId: string; amountInr: number }>();

  constructor(secret: string = STUB_SECRET) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "StubPaymentProvider must never run in production — no money moves through it.",
      );
    }
    this.secret = secret;
  }

  async createIntent(args: CreateIntentArgs): Promise<PaymentIntent> {
    if (args.amountInr <= 0) {
      throw new Error(
        `Refusing to create a payment intent for ₹${args.amountInr}. ` +
          "Zero-value orders are settled internally (see isZeroValueOrder).",
      );
    }
    const providerOrderId = `stub_order_${randomUUID().slice(0, 12)}`;
    this.intents.set(providerOrderId, {
      orderId: args.orderId,
      amountInr: args.amountInr,
    });
    return {
      providerOrderId,
      amountInr: args.amountInr,
      currency: "INR",
      clientConfig: { provider: "stub", providerOrderId },
    };
  }

  verifyWebhook(rawBody: string, signature: string): VerifyResult {
    const expected = createHmac("sha256", this.secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature ?? "");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "bad_signature" };
    }

    let parsed: {
      kind?: PaymentEventKind;
      orderId?: string;
      paymentRef?: string;
      amountInr?: number;
    };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "malformed" };
    }

    if (!parsed.kind || !parsed.orderId || !parsed.paymentRef) {
      return { ok: false, reason: "malformed" };
    }
    if (!["payment.captured", "payment.failed", "refund.processed"].includes(parsed.kind)) {
      return { ok: false, reason: "unhandled_event" };
    }

    return {
      ok: true,
      event: {
        kind: parsed.kind,
        orderId: parsed.orderId,
        paymentRef: parsed.paymentRef,
        amountInr: Number(parsed.amountInr ?? 0),
        raw: parsed,
      },
    };
  }

  async refund(paymentRef: string, amountInr: number): Promise<RefundResult> {
    return { ok: true, refundRef: `stub_refund_${paymentRef.slice(-8)}_${amountInr}` };
  }

  // ── Test affordances ───────────────────────────────────────────────────

  /** Build a signed webhook exactly as the provider would send it. */
  signWebhook(payload: {
    kind: PaymentEventKind;
    orderId: string;
    paymentRef: string;
    amountInr: number;
  }): { rawBody: string; signature: string } {
    const rawBody = JSON.stringify(payload);
    return {
      rawBody,
      signature: createHmac("sha256", this.secret).update(rawBody).digest("hex"),
    };
  }

  /** Simulate a successful capture for an order. */
  captureFor(orderId: string, amountInr: number) {
    return this.signWebhook({
      kind: "payment.captured",
      orderId,
      paymentRef: `stub_pay_${randomUUID().slice(0, 12)}`,
      amountInr,
    });
  }
}
