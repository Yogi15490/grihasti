"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { devSettleOrder } from "@/app/actions/checkout";

/**
 * Development-only shortcut to settle an unpaid order, so the full flow —
 * order, cashback to three levels, dispatch — is walkable before Razorpay is
 * wired in. The server action refuses to run in production; this is the UI half.
 */
export default function DevSettle({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div
      className="card"
      style={{ padding: 18, marginTop: 20, borderStyle: "dashed", background: "transparent" }}
    >
      <p style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--haldi)" }}>
        Development only
      </p>
      <p style={{ fontSize: 14, margin: "6px 0 12px", color: "var(--meta)" }}>
        No payment provider is connected yet. Settle this order to walk the rest of
        the flow — cashback, invoice, dispatch.
      </p>
      <button
        className="btn btn-ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await devSettleOrder(orderId);
            if (r.ok) router.refresh();
            else setError(r.error ?? "Failed.");
          })
        }
      >
        {pending ? "Settling…" : "Mark as paid (dev)"}
      </button>
      {error && <p style={{ color: "var(--haldi)", fontSize: 13, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
