"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { readCart, updateQty, removeLine, type CartLine } from "@/lib/cartStorage";
import { quoteCart } from "@/app/actions/checkout";

type Quote = Awaited<ReturnType<typeof quoteCart>>;

export default function CartView() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [, start] = useTransition();

  async function refresh() {
    const current = readCart();
    setLines(current);
    if (!current.length) {
      setQuote(null);
      setLoading(false);
      return;
    }
    // Prices and stock are re-read server-side — localStorage is display only.
    const q = await quoteCart(current.map((l) => ({ slug: l.slug, qty: l.qty })));
    setQuote(q);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  function change(index: number, qty: number) {
    updateQty(index, qty);
    start(() => { refresh(); });
  }

  function remove(index: number) {
    removeLine(index);
    start(() => { refresh(); });
  }

  if (loading) return <p style={{ color: "var(--sage)" }}>Loading your cart…</p>;

  if (!lines.length) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 24 }}>Your cart is empty.</div>
        <p style={{ color: "var(--sage)", margin: "8px 0 20px" }}>
          Fourteen siblings are waiting to be picked.
        </p>
        <Link href="/shop" className="btn">Browse the collection</Link>
      </div>
    );
  }

  return (
    <div>
      {lines.map((line, i) => {
        const priced = quote?.items[i];
        const unavailable = priced && !priced.available;
        return (
          <div
            key={`${line.slug}-${i}`}
            className="card"
            style={{ padding: 18, marginBottom: 12, display: "flex", gap: 16, alignItems: "flex-start" }}
          >
            <div
              className="thumb"
              style={{ width: 84, height: 84, aspectRatio: "auto", flexShrink: 0, fontSize: 11, borderRadius: 8 }}
            >
              {line.name}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 19 }}>{line.name}</div>
              <div style={{ color: "var(--sage)", fontSize: 13 }}>{line.scent}</div>
              {line.nameMessage && (
                <div className="serif-italic" style={{ fontSize: 14, marginTop: 2 }}>
                  “{line.nameMessage}”
                </div>
              )}

              {unavailable && (
                <div style={{ color: "var(--clay)", fontSize: 13, marginTop: 6 }}>
                  {priced!.stockQty === 0
                    ? "Sold out — please remove to continue."
                    : `Only ${priced!.stockQty} left — reduce the quantity to continue.`}
                </div>
              )}

              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
                <select
                  className="field"
                  style={{ width: 78, padding: "7px 10px" }}
                  value={line.qty}
                  onChange={(e) => change(i, Number(e.target.value))}
                >
                  {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <button
                  onClick={() => remove(i)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--sage)", fontSize: 13, textDecoration: "underline",
                    fontFamily: "var(--sans)",
                  }}
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="price" style={{ whiteSpace: "nowrap" }}>
              ₹{(priced?.lineTotalInr ?? line.unitPriceInr * line.qty).toLocaleString("en-IN")}
            </div>
          </div>
        );
      })}

      <div className="card" style={{ padding: 20, marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15 }}>Subtotal</span>
          <span className="price" style={{ fontSize: 26 }}>
            ₹{(quote?.subtotalInr ?? 0).toLocaleString("en-IN")}
          </span>
        </div>
        <p style={{ color: "var(--sage)", fontSize: 13, marginTop: 4 }}>
          Inclusive of GST. Shipping is on us.
        </p>

        {quote?.hasProblems ? (
          <p style={{ color: "var(--clay)", fontSize: 14, marginTop: 14 }}>
            Please fix the items flagged above before checking out.
          </p>
        ) : (
          <Link
            href="/checkout"
            className="btn"
            style={{ marginTop: 16, width: "100%", textAlign: "center", display: "block" }}
          >
            Checkout
          </Link>
        )}

        {quote && !quote.signedIn && (
          <p style={{ color: "var(--sage)", fontSize: 13, marginTop: 12, textAlign: "center" }}>
            You&apos;ll sign in at checkout — that&apos;s also how your cashback gets tracked.
          </p>
        )}
      </div>
    </div>
  );
}
