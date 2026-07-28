import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SiblingPoll from "@/components/SiblingPoll";
import { listCatalog } from "@/lib/catalog";
import { RATES, INVITE_GATE } from "@/lib/referral";

// Stock is shown here, so this must not be cached (spec §7.2).
export const dynamic = "force-dynamic";

/**
 * Storefront home.
 *
 * This began life as the pre-launch waitlist page (spec §12, "ship the
 * waitlist first") and kept that shape after the shop opened — no header,
 * no navigation, no route to /shop. Visitors landed on a mailing-list form
 * for a shop that was already taking orders.
 *
 * Now it leads with the collection. The waitlist survives lower down, for
 * people who aren't ready to buy today.
 */
export default async function Home() {
  let featured: Awaited<ReturnType<typeof listCatalog>> = [];
  try {
    // Six in-stock designs, gift set first — it's the safe choice for someone
    // who can't decide, and the one that never sells out of a single design.
    featured = (await listCatalog())
      .filter((i) => !i.isSoldOut)
      .sort((a, b) => (a.type === "giftset" ? -1 : b.type === "giftset" ? 1 : 0))
      .slice(0, 6);
  } catch {
    featured = [];
  }

  return (
    <>
      <SiteHeader />
      <main>
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section style={{ padding: "64px 0 36px", textAlign: "center" }}>
          <div className="wrap">
            <p className="eyebrow">A limited Rakhi drop from Grihasti</p>
            <h1 style={{ fontSize: 56, margin: "16px 0 14px" }}>
              This Rakhi, gift them a candle that&apos;s <em>so</em> them.
            </h1>
            <p style={{ maxWidth: 620, margin: "0 auto", fontSize: 18 }}>
              Fourteen characterful caricature candles — the cool bhaiya, the chai-fuelled
              behen, the little terror. Pick the one that&apos;s your sibling.
            </p>

            <div
              style={{
                display: "flex", gap: 12, justifyContent: "center",
                marginTop: 28, flexWrap: "wrap",
              }}
            >
              <Link href="/shop" className="btn">Shop the collection</Link>
              <Link href="/shop/gift-set" className="btn btn-ghost">See the gift set</Link>
            </div>

            <p style={{ color: "var(--clay)", fontSize: 14, marginTop: 18 }}>
              Small batches · order by 21 August for Raksha Bandhan
            </p>
          </div>
        </section>

        {/* ── Featured designs ─────────────────────────────────────── */}
        {featured.length > 0 && (
          <section style={{ padding: "20px 0 12px" }}>
            <div className="wrap">
              <div
                style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "baseline", marginBottom: 16, flexWrap: "wrap", gap: 8,
                }}
              >
                <h2 style={{ fontSize: 30 }}>Which one&apos;s your sibling?</h2>
                <Link href="/shop" style={{ color: "var(--clay)", fontSize: 15 }}>
                  See all 15 →
                </Link>
              </div>

              <div className="grid grid-3">
                {featured.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/shop/${item.slug}`}
                    className="card"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div className="thumb" style={{ padding: 0 }}>
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        width={400}
                        height={400}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                    <div style={{ padding: 16 }}>
                      <div style={{ fontFamily: "var(--serif)", fontSize: 19 }}>{item.name}</div>
                      <div style={{ color: "var(--sage)", fontSize: 13, minHeight: 34 }}>
                        {item.design?.persona ?? ""}
                      </div>
                      <div
                        style={{
                          display: "flex", justifyContent: "space-between",
                          alignItems: "center", marginTop: 10,
                        }}
                      >
                        <span className="price">₹{item.priceInr}</span>
                        <span className={item.isLow ? "stock stock-low" : "stock"}>
                          {item.isLow ? `Only ${item.stockQty} left` : "In stock"}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Why ──────────────────────────────────────────────────── */}
        <section style={{ padding: "36px 0 20px" }}>
          <div className="wrap grid grid-3">
            {[
              ["Handmade & limited", "Small batches, only a few of each design."],
              ["The gift they'll keep", "A keepsake, not a bouquet that wilts by Tuesday."],
              ["Made for your bond", "Fourteen personas. One of them is unmistakably them."],
            ].map(([t, s]) => (
              <div key={t} className="card" style={{ padding: 22 }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 20 }}>{t}</div>
                <div style={{ color: "var(--sage)", marginTop: 4 }}>{s}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── The referral programme ───────────────────────────────── */}
        <section style={{ padding: "28px 0" }}>
          <div className="wrap">
            <div className="card" style={{ padding: 32, background: "#fff8ef", textAlign: "center" }}>
              <p className="eyebrow">Your circle</p>
              <h2 style={{ fontSize: 32, margin: "10px 0 10px" }}>
                Get {(RATES[0] * 100).toFixed(0)}% back. So does whoever brought you.
              </h2>
              <p style={{ maxWidth: 620, margin: "0 auto", color: "var(--ember)" }}>
                Every order earns you {(RATES[0] * 100).toFixed(0)}% back as credit on the next
                one. Invite up to {INVITE_GATE} people and you keep earning a share of what
                they spend — and what their friends spend — for as long as they shop with us.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 22, flexWrap: "wrap" }}>
                <Link href="/login" className="btn">Start your circle</Link>
              </div>
              <p style={{ color: "var(--sage)", fontSize: 13, marginTop: 14 }}>
                Five invites each. No fees, no catch — just a smaller marketing budget.
              </p>
            </div>
          </div>
        </section>

        {/* ── Waitlist + poll ──────────────────────────────────────── */}
        <section style={{ padding: "28px 0 20px" }}>
          <div className="wrap">
            <SiblingPoll />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
