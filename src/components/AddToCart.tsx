"use client";

import { useState } from "react";
import Link from "next/link";
import { addToCart } from "@/lib/cartStorage";

export default function AddToCart({
  slug,
  name,
  priceInr,
  scentOptions,
  maxQty,
}: {
  slug: string;
  name: string;
  priceInr: number;
  scentOptions: string[];
  maxQty: number;
}) {
  const [scent, setScent] = useState(scentOptions[0] ?? "Aangan at Dusk");
  const [nameMessage, setNameMessage] = useState("");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  // Never offer more than exists. The server re-checks anyway, but a customer
  // shouldn't get as far as checkout before being told.
  const cap = Math.max(1, Math.min(maxQty, 10));

  function add() {
    addToCart({
      slug,
      name,
      unitPriceInr: priceInr,
      qty,
      scent,
      nameMessage: nameMessage.slice(0, 60),
    });
    setAdded(true);
  }

  return (
    <div>
      <label style={{ fontSize: 13, color: "var(--meta)" }}>Scent</label>
      <select
        className="field"
        value={scent}
        onChange={(e) => { setScent(e.target.value); setAdded(false); }}
        style={{ marginTop: 6 }}
      >
        {scentOptions.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <label style={{ fontSize: 13, color: "var(--meta)", display: "block", marginTop: 16 }}>
        Name / short message on the card (optional)
      </label>
      <input
        className="field"
        style={{ marginTop: 6 }}
        maxLength={60}
        value={nameMessage}
        onChange={(e) => { setNameMessage(e.target.value); setAdded(false); }}
        placeholder="e.g. For Rohan, from your didi"
      />
      <div style={{ fontSize: 12, color: "var(--meta)", marginTop: 4 }}>
        {60 - nameMessage.length} characters left
      </div>

      <label style={{ fontSize: 13, color: "var(--meta)", display: "block", marginTop: 16 }}>
        Quantity
      </label>
      <select
        className="field"
        value={qty}
        onChange={(e) => { setQty(Number(e.target.value)); setAdded(false); }}
        style={{ marginTop: 6, width: 110 }}
      >
        {Array.from({ length: cap }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      <button className="btn" style={{ marginTop: 20, width: "100%" }} onClick={add}>
        {added ? "Added — add another?" : "Add to cart"}
      </button>

      {added && (
        <Link
          href="/cart"
          className="btn btn-ghost"
          style={{ marginTop: 10, width: "100%", textAlign: "center", display: "block" }}
        >
          Go to cart
        </Link>
      )}

      <p style={{ fontSize: 12, color: "var(--meta)", marginTop: 12 }}>
        A keepsake, made to be treasured. Order by 21 Aug for guaranteed Rakhi delivery.
      </p>
    </div>
  );
}
