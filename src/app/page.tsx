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
        {/* ── Hero ─────────────────────────────────────────────────────
            §1 Devanagari-first: the Hindi line leads, set in Yatra One at
            display size (§5 permits it above ~32px). §8: the two languages
            sit side by side, neither translating the other word for word. */}
        <section style={{ padding: "64px 0 40px", textAlign: "center" }}>
          <div className="wrap">
            <p className="eyebrow">The Bhai-Behen Collection</p>

            <p
              className="deva-display"
              lang="hi"
              style={{ fontSize: 46, margin: "20px 0 10px", color: "var(--ink)" }}
            >
              जो सबसे ज़्यादा उन जैसा हो।
            </p>

            <h1 style={{ fontSize: 44, margin: "0 0 16px", fontWeight: 400 }}>
              A candle that is unmistakably them.
            </h1>

            <p style={{ maxWidth: 600, margin: "0 auto", color: "var(--text2)" }}>
              Fourteen caricature candles — the cool bhaiya, the chai-fuelled behen,
              the little terror. Pick the one that is your sibling.
            </p>

            <div
              style={{
                display: "flex", gap: 12, justifyContent: "center",
                marginTop: 30, flexWrap: "wrap",
              }}
            >
              <Link href="/shop" className="btn">Shop the collection</Link>
              <Link href="/shop/gift-set" className="btn btn-ghost">See the gift set</Link>
            </div>

            <p className="label" style={{ marginTop: 20 }}>
              Small batches · order by 21 August
            </p>
          </div>
        </section>

        {/* ── Featured designs ─────────────────────────────────────────
            §6: the rule above every section heading, full column width. */}
        {featured.length > 0 && (
          <section style={{ padding: "20px 0 12px" }}>
            <div className="wrap">
              <div className="section-head">
                <div className="rule" />
                <div
                  style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", flexWrap: "wrap", gap: 8,
                  }}
                >
                  <h2 style={{ fontSize: 32 }}>Which one is your sibling?</h2>
                  <Link href="/shop" className="label" style={{ color: "var(--haldi)" }}>
                    See all 15
                  </Link>
                </div>
              </div>

              <div className="grid grid-3">
                {featured.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/shop/${item.slug}`}
                    className="card card-ruled"
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
                      <div style={{ color: "var(--meta)", fontSize: 13, minHeight: 34 }}>
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
              ["Poured in small batches", "A few of each design. When one is gone, it is gone."],
              ["Kept, not consumed", "It sits on a shelf long after the sweets are finished."],
              ["Two scents", "Aangan at Dusk and Sunday Slow. Chosen at checkout."],
            ].map(([t, s]) => (
              <div key={t} className="card card-ruled" style={{ padding: 22 }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 20 }}>{t}</div>
                <div style={{ color: "var(--meta)", marginTop: 4 }}>{s}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── The referral programme ───────────────────────────────── */}
        <section style={{ padding: "28px 0" }}>
          <div className="wrap">
            <div className="rule" />
            <div className="card" style={{ padding: 32, background: "var(--band)", textAlign: "center", borderTop: "none" }}>
              <p className="eyebrow">Your circle</p>
              <h2 style={{ fontSize: 32, margin: "10px 0 10px" }}>
                Get {(RATES[0] * 100).toFixed(0)}% back. So does whoever brought you.
              </h2>
              <p style={{ maxWidth: 620, margin: "0 auto", color: "var(--ink)" }}>
                Every order earns you {(RATES[0] * 100).toFixed(0)}% back as credit on the next
                one. Invite up to {INVITE_GATE} people and you keep earning a share of what
                they spend — and what their friends spend — for as long as they shop with us.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 22, flexWrap: "wrap" }}>
                <Link href="/login" className="btn">Start your circle</Link>
              </div>
              <p className="label" style={{ marginTop: 16 }}>
                Five invites each · no fee · no expiry
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
