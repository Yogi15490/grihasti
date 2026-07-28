"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/account";

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Only ever populated when the app is running on the embedded local database
  // with no email provider — the server refuses to send it otherwise.
  const [devCode, setDevCode] = useState<string | null>(null);

  async function requestCode() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      if (data.devCode) {
        setDevCode(data.devCode);
        setCode(data.devCode); // pre-fill so signing in locally is one click
      }
      setStep("code");
    } catch {
      setError("Couldn't reach us. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "That code isn't right."); return; }
      router.push(next);
      router.refresh();
    } catch {
      setError("Couldn't reach us. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <div className="card" style={{ padding: 24 }}>
        <label style={{ fontSize: 13, color: "var(--sage)" }}>Email address</label>
        <input
          className="field"
          style={{ marginTop: 6 }}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && email && requestCode()}
          placeholder="you@example.com"
        />
        {error && <p style={{ color: "var(--clay)", fontSize: 14, marginTop: 10 }}>{error}</p>}
        <button
          className="btn"
          style={{ marginTop: 16, width: "100%" }}
          disabled={busy || !email}
          onClick={requestCode}
        >
          {busy ? "Sending…" : "Email me a code"}
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <p style={{ fontSize: 14, marginBottom: 14 }}>
        We&apos;ve sent a six-digit code to <strong>{email}</strong>.
      </p>

      {devCode && (
        <div
          style={{
            border: "1px dashed var(--brass)", borderRadius: 8,
            padding: "10px 14px", marginBottom: 14, fontSize: 13,
          }}
        >
          <strong>Local mode</strong> — no email provider connected, so here&apos;s your
          code: <strong style={{ letterSpacing: ".15em" }}>{devCode}</strong>
          <div style={{ color: "var(--sage)", marginTop: 2 }}>
            It&apos;s filled in below. This never happens in production.
          </div>
        </div>
      )}
      <label style={{ fontSize: 13, color: "var(--sage)" }}>Your code</label>
      <input
        className="field"
        style={{ marginTop: 6, fontSize: 22, letterSpacing: ".4em", textAlign: "center" }}
        inputMode="numeric"
        maxLength={6}
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()}
      />
      {error && <p style={{ color: "var(--clay)", fontSize: 14, marginTop: 10 }}>{error}</p>}
      <button
        className="btn"
        style={{ marginTop: 16, width: "100%" }}
        disabled={busy || code.length !== 6}
        onClick={verify}
      >
        {busy ? "Checking…" : "Sign in"}
      </button>
      <button
        onClick={() => { setStep("email"); setCode(""); setError(null); }}
        style={{
          background: "none", border: "none", cursor: "pointer", marginTop: 14,
          color: "var(--sage)", fontSize: 13, textDecoration: "underline",
          fontFamily: "var(--sans)", width: "100%",
        }}
      >
        Use a different email
      </button>
    </div>
  );
}
