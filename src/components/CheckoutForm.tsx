"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { readCart, clearCart, type CartLine } from "@/lib/cartStorage";
import { quoteCart, placeOrder } from "@/app/actions/checkout";

type Quote = Awaited<ReturnType<typeof quoteCart>>;

const INDIAN_STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export default function CheckoutForm() {
  const router = useRouter();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [addr, setAddr] = useState({
    name: "", line1: "", line2: "", city: "", state: "Maharashtra", pin: "", phone: "",
  });

  useEffect(() => {
    (async () => {
      const current = readCart();
      setLines(current);
      if (!current.length) { setLoading(false); return; }
      const q = await quoteCart(current.map((l) => ({ slug: l.slug, qty: l.qty })));
      setQuote(q);
      setLoading(false);
    })();
  }, []);

  const subtotal = quote?.subtotalInr ?? 0;
  const maxPoints = Math.min(quote?.availablePointsInr ?? 0, subtotal);
  const applied = Math.min(points, maxPoints);
  const cashDue = Math.round((subtotal - applied) * 100) / 100;

  function submit() {
    setError(null);
    start(async () => {
      const res = await placeOrder({
        lines: lines.map((l) => ({
          slug: l.slug, qty: l.qty, scent: l.scent, nameMessage: l.nameMessage,
        })),
        pointsToUse: applied,
        address: addr,
      });

      if (!res.ok) { setError(res.error); return; }
      clearCart();
      router.push(`/order/${res.orderId}`);
    });
  }

  if (loading) return <p style={{ color: "var(--sage)" }}>Loading…</p>;

  if (!lines.length) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <p style={{ marginBottom: 16 }}>Your cart is empty.</p>
        <Link href="/shop" className="btn">Browse the collection</Link>
      </div>
    );
  }

  const field = (
    key: keyof typeof addr,
    label: string,
    extra: Record<string, unknown> = {},
  ) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, color: "var(--sage)" }}>{label}</label>
      <input
        className="field"
        style={{ marginTop: 5 }}
        value={addr[key]}
        onChange={(e) => setAddr({ ...addr, [key]: e.target.value })}
        {...extra}
      />
    </div>
  );

  return (
    <div>
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, marginBottom: 16 }}>Where should it go?</h2>
        {field("name", "Recipient's full name")}
        {field("line1", "Address")}
        {field("line2", "Apartment, landmark (optional)")}
        <div className="grid grid-2" style={{ gap: 14 }}>
          {field("city", "City")}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: "var(--sage)" }}>State</label>
            <select
              className="field"
              style={{ marginTop: 5 }}
              value={addr.state}
              onChange={(e) => setAddr({ ...addr, state: e.target.value })}
            >
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-2" style={{ gap: 14 }}>
          {field("pin", "PIN code", { inputMode: "numeric", maxLength: 6 })}
          {field("phone", "Mobile number", { inputMode: "tel", placeholder: "For delivery updates" })}
        </div>
      </div>

      {maxPoints > 0 && (
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <h2 style={{ fontSize: 24, marginBottom: 4 }}>Use your cashback</h2>
          <p style={{ color: "var(--sage)", fontSize: 14, marginBottom: 14 }}>
            You have <strong>₹{maxPoints.toLocaleString("en-IN")}</strong> available.
            Use as much or as little as you like.
          </p>
          <input
            type="range"
            min={0}
            max={Math.floor(maxPoints)}
            value={applied}
            onChange={(e) => setPoints(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--clay)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--sage)" }}>
            <span>₹0</span>
            <span>Using ₹{applied.toLocaleString("en-IN")}</span>
            <span>₹{Math.floor(maxPoints).toLocaleString("en-IN")}</span>
          </div>
          {applied > 0 && applied === subtotal && (
            <p style={{ fontSize: 13, color: "var(--brass)", marginTop: 10 }}>
              Your points cover the whole order — nothing to pay.
            </p>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 24, marginBottom: 14 }}>Order summary</h2>
        {quote?.items.map((i) => (
          <div key={i.slug} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
            <span>{i.name} × {i.qty}</span>
            <span>₹{i.lineTotalInr.toLocaleString("en-IN")}</span>
          </div>
        ))}

        <hr style={{ border: "none", borderTop: "1px solid #ece3d3", margin: "14px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>Subtotal</span><span>₹{subtotal.toLocaleString("en-IN")}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginTop: 4 }}>
          <span>Shipping</span><span style={{ color: "var(--sage)" }}>Free</span>
        </div>
        {applied > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginTop: 4, color: "var(--brass)" }}>
            <span>Cashback applied</span><span>−₹{applied.toLocaleString("en-IN")}</span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <span style={{ fontSize: 16 }}>To pay</span>
          <span className="price" style={{ fontSize: 28 }}>₹{cashDue.toLocaleString("en-IN")}</span>
        </div>

        {error && (
          <p style={{ color: "var(--clay)", fontSize: 14, marginTop: 14 }}>{error}</p>
        )}

        <button
          className="btn"
          style={{ marginTop: 18, width: "100%" }}
          onClick={submit}
          disabled={pending || quote?.hasProblems}
        >
          {pending ? "Placing your order…" : cashDue === 0 ? "Place order" : `Pay ₹${cashDue.toLocaleString("en-IN")}`}
        </button>

        <p style={{ fontSize: 12, color: "var(--sage)", marginTop: 12, textAlign: "center" }}>
          You&apos;ll earn 5% back on this order, and so will whoever invited you.
        </p>
      </div>
    </div>
  );
}
