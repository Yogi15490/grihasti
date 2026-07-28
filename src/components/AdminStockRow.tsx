"use client";

import { useState, useTransition } from "react";
import { setStockAction } from "@/app/actions/admin";

interface StockItem {
  productId: string;
  slug: string;
  name: string;
  stockQty: number;
  priceInr: number;
  isActive: boolean;
  sold: number;
  isLow: boolean;
  isSoldOut: boolean;
}

export default function AdminStockRow({ item }: { item: StockItem }) {
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div
      className="card"
      style={{
        padding: 14, marginBottom: 8, display: "flex",
        alignItems: "center", gap: 14, flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 15 }}>{item.name}</div>
        <div style={{ color: item.isSoldOut ? "var(--clay)" : "var(--sage)", fontSize: 12 }}>
          {item.isSoldOut ? "Sold out" : item.isLow ? `Low · ${item.stockQty} left` : `${item.stockQty} in stock`}
          {" · "}{item.sold} sold
        </div>
      </div>

      <form
        action={(fd) => {
          fd.set("productId", item.productId);
          setNote(null);
          start(async () => {
            const r = await setStockAction(fd);
            setNote(r.ok ? (r.message ?? "Updated.") : (r.error ?? "Failed."));
          });
        }}
        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
      >
        <input
          className="field" name="qty" type="number" min={0}
          defaultValue={item.stockQty} style={{ width: 92 }} required
        />
        <input className="field" name="reason" placeholder="Reason" style={{ width: 190 }} />
        <button className="btn btn-ghost" disabled={pending}>Set</button>
      </form>

      {note && <span style={{ fontSize: 12, color: "var(--brass)", width: "100%" }}>{note}</span>}
    </div>
  );
}
