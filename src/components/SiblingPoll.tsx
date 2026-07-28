"use client";

import { useEffect, useState, useTransition } from "react";
import { CARICATURES } from "@/data/designs";
import { joinWaitlist } from "@/app/actions";

export default function SiblingPoll() {
  const [choice, setChoice] = useState<string>("");
  const [contact, setContact] = useState("");
  const [ref, setRef] = useState("");
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("ref");
    if (p) setRef(p);
  }, []);

  function submit() {
    setError(null);
    // Consent must be an affirmative act (spec §10, DPDP). Not pre-ticked,
    // not inferred from submitting the form.
    if (!consent) {
      setError("Please tick the box so we know it's okay to message you.");
      return;
    }
    const fd = new FormData();
    fd.set("contact", contact);
    fd.set("poll_choice", choice);
    fd.set("ref", ref);
    fd.set("consent", String(consent));
    start(async () => {
      const res = await joinWaitlist(fd);
      if (res.ok) setDone(true);
      else setError(res.error ?? "Something went wrong.");
    });
  }

  if (done) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <h2 style={{ fontSize: 30 }}>You&apos;re on the list. 🎉</h2>
        <p style={{ marginTop: 10 }}>
          We&apos;ll ping you the second the Bhai-Behen Collection drops. Want first pick
          before the popular ones sell out? Share your link — the more siblings you bring,
          the earlier you&apos;re in.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 30, marginBottom: 6 }}>Which one&apos;s YOUR sibling?</h2>
      <p className="serif-italic" style={{ color: "var(--clay)", marginBottom: 20 }}>
        Tap the one that&apos;s so them. (The popular ones sell out first.)
      </p>

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        {CARICATURES.map((d) => (
          <button
            key={d.slug}
            type="button"
            onClick={() => setChoice(d.slug)}
            className="card"
            style={{
              padding: 14, textAlign: "left", cursor: "pointer",
              borderColor: choice === d.slug ? "var(--clay)" : undefined,
              outline: choice === d.slug ? "2px solid var(--clay)" : "none",
            }}
          >
            <div style={{ fontFamily: "var(--serif)", fontSize: 18 }}>{d.name}</div>
            <div style={{ fontSize: 13, color: "var(--sage)" }}>{d.persona}</div>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <label style={{ fontSize: 13, letterSpacing: ".04em" }}>
          We&apos;ll ping you the moment the drop is live.
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <input
            className="field"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Phone or email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
          <button className="btn" onClick={submit} disabled={pending}>
            {pending ? "Joining…" : "Join the early list"}
          </button>
        </div>

        <label
          style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            marginTop: 12, fontSize: 13, color: "var(--sage)", cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            Yes, message me about the drop. We&apos;ll only use this to tell you when
            the collection goes live — never shared, unsubscribe anytime.
          </span>
        </label>
        {error && <p style={{ color: "var(--clay)", marginTop: 10, fontSize: 14 }}>{error}</p>}
        {ref && <p style={{ color: "var(--sage)", marginTop: 8, fontSize: 12 }}>Referred by a friend ✓</p>}
      </div>
    </div>
  );
}
