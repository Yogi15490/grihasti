"use client";

import { useState } from "react";

/**
 * The post-purchase share prompt (spec §7.6).
 *
 * This is the highest-intent moment in the whole funnel — someone has just
 * bought a gift they're pleased with. K = invites x activation (§14), and this
 * screen is where most activation actually happens.
 */
export default function ShareCircle({ shareUrl }: { shareUrl: string }) {
  const [copied, setCopied] = useState(false);

  const message =
    `I just got my sibling a caricature candle from Grihasti for Rakhi ` +
    `You get 5% back on yours, and so do I. Only 5 people can join through me: ${shareUrl}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="card" style={{ padding: 26, marginTop: 24, background: "var(--band)" }}>
      <p className="eyebrow">Your circle</p>
      <h2 style={{ fontSize: 26, margin: "10px 0 6px" }}>
        Bring five people in. Earn on every order they ever place.
      </h2>
      <p style={{ color: "var(--meta)", fontSize: 14, marginBottom: 16 }}>
        You get 5% back on your own orders, and a share of what your circle spends —
        for as long as they keep shopping. Five invites, that&apos;s it.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="field" style={{ flex: 1, minWidth: 220 }} readOnly value={shareUrl} />
        <button className="btn" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <a
          className="btn btn-ghost"
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Share on WhatsApp
        </a>
      </div>
    </div>
  );
}
