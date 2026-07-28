import SiblingPoll from "@/components/SiblingPoll";

// Pre-launch waitlist landing (spec §7.1). Becomes the shop redirect at launch.
export default function WaitlistLanding() {
  return (
    <main>
      <section style={{ padding: "72px 0 40px", textAlign: "center" }}>
        <div className="wrap">
          <p className="eyebrow">A limited Rakhi drop from Grihasti</p>
          <h1 style={{ fontSize: 56, margin: "16px 0 12px" }}>
            This Rakhi, gift them a candle that&apos;s <em>so</em> them.
          </h1>
          <p style={{ maxWidth: 620, margin: "0 auto", fontSize: 18 }}>
            Fourteen characterful caricature candles — the cool bhaiya, the chai-fuelled
            behen, the little terror. Pick the one that&apos;s your sibling. Limited
            quantities, small batches, gone after Rakhi.
          </p>
        </div>
      </section>

      <section style={{ padding: "20px 0 40px" }}>
        <div className="wrap grid grid-3">
          {[
            ["Handmade & limited", "Small batches, only a few of each."],
            ["The gift they'll keep", "A keepsake, not a bouquet that wilts."],
            ["Made for your bond", "Find the one that captures your sibling."],
          ].map(([t, s]) => (
            <div key={t} className="card" style={{ padding: 22 }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 20 }}>{t}</div>
              <div style={{ color: "var(--sage)", marginTop: 4 }}>{s}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "20px 0 80px" }}>
        <div className="wrap">
          <SiblingPoll />
        </div>
      </section>

      <footer style={{ padding: "28px 0", textAlign: "center", color: "var(--sage)" }}>
        <div className="wrap serif-italic">Made for you, by hand. — Grihasti</div>
      </footer>
    </main>
  );
}
