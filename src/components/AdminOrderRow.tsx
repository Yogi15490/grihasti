"use client";

import { useState, useTransition } from "react";
import {
  dispatchOrderAction, deliverOrderAction, refundOrderAction,
} from "@/app/actions/admin";

interface OrderSummary {
  orderId: string;
  status: string;
  grossTotalInr: number;
  cashPaidInr: number;
  pointsRedeemedInr: number;
  invoiceNo: string | null;
  tracking: string | null;
  fulfilmentHold: boolean;
  holdReason: string | null;
  customerEmail: string | null;
  itemCount: number;
  createdAt: Date | string;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function AdminOrderRow({ order }: { order: OrderSummary }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: (fd: FormData) => Promise<{ ok: boolean; error?: string; message?: string }>, fd: FormData) {
    setNote(null);
    start(async () => {
      const r = await action(fd);
      setNote(r.ok ? (r.message ?? "Done.") : (r.error ?? "Failed."));
    });
  }

  return (
    <div
      className="card"
      style={{
        padding: 16,
        marginBottom: 10,
        borderColor: order.fulfilmentHold && order.status !== "refunded" ? "var(--clay)" : undefined,
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 14, cursor: "pointer" }}
        onClick={() => setOpen(!open)}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15 }}>
            <span style={{ textTransform: "capitalize" }}>{order.status}</span>
            {order.invoiceNo ? ` · ${order.invoiceNo}` : ""}
          </div>
          <div style={{ color: "var(--sage)", fontSize: 12, wordBreak: "break-all" }}>
            {order.customerEmail} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
            {order.tracking ? ` · ${order.tracking}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <div className="price" style={{ fontSize: 18 }}>{inr(order.grossTotalInr)}</div>
          {order.pointsRedeemedInr > 0 && (
            <div style={{ color: "var(--brass)", fontSize: 12 }}>
              {inr(order.pointsRedeemedInr)} points
            </div>
          )}
        </div>
      </div>

      {order.holdReason && (
        <p style={{ color: "var(--clay)", fontSize: 13, marginTop: 8 }}>{order.holdReason}</p>
      )}

      {open && (
        <div style={{ marginTop: 14, borderTop: "1px solid #f2ebdd", paddingTop: 14 }}>
          {order.status === "paid" && !order.fulfilmentHold && (
            <form
              action={(fd) => { fd.set("orderId", order.orderId); run(dispatchOrderAction, fd); }}
              style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}
            >
              <input className="field" name="awb" placeholder="AWB tracking number" style={{ flex: 1, minWidth: 180 }} required />
              <input className="field" name="courier" placeholder="Courier" style={{ width: 150 }} />
              <button className="btn" disabled={pending}>Dispatch</button>
            </form>
          )}

          {order.status === "dispatched" && (
            <form
              action={(fd) => { fd.set("orderId", order.orderId); run(deliverOrderAction, fd); }}
              style={{ marginBottom: 10 }}
            >
              <button className="btn btn-ghost" disabled={pending}>Mark delivered</button>
            </form>
          )}

          {["paid", "dispatched", "delivered"].includes(order.status) && (
            <form
              action={(fd) => { fd.set("orderId", order.orderId); run(refundOrderAction, fd); }}
            >
              <button
                className="btn btn-ghost"
                disabled={pending}
                style={{ borderColor: "var(--clay)", color: "var(--clay)" }}
              >
                {order.fulfilmentHold ? "Refund (oversold)" : "Refund"}
              </button>
              <span style={{ color: "var(--sage)", fontSize: 12, marginLeft: 10 }}>
                Reverses all cashback, returns points, restocks.
              </span>
            </form>
          )}

          {note && <p style={{ fontSize: 13, marginTop: 10, color: "var(--brass)" }}>{note}</p>}
        </div>
      )}
    </div>
  );
}
