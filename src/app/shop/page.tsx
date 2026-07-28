import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { listCatalog } from "@/lib/catalog";

export const metadata = { title: "The Bhai-Behen Collection — Grihasti" };

// Stock must never be cached on a limited drop (spec §7.2).
export const dynamic = "force-dynamic";

export default async function Shop() {
  let items: Awaited<ReturnType<typeof listCatalog>> = [];
  let dbDown = false;

  try {
    items = await listCatalog();
  } catch {
    dbDown = true;
  }

  return (
    <>
      <SiteHeader />
      <main>
        <section style={{ padding: "48px 0 24px", textAlign: "center" }}>
          <div className="wrap">
            <p className="eyebrow">Grihasti · The Bhai-Behen Collection</p>
            <h1 style={{ fontSize: 44, margin: "14px 0 8px" }}>
              Find the one that&apos;s so your sibling.
            </h1>
            <p style={{ color: "var(--sage)" }}>
              Limited quantities · handmade in small batches · order by 21 Aug for Rakhi.
            </p>
          </div>
        </section>

        {dbDown && (
          <div className="wrap" style={{ paddingBottom: 24 }}>
            <div className="card" style={{ padding: 20, textAlign: "center" }}>
              We&apos;re having trouble loading the collection. Please refresh in a moment.
            </div>
          </div>
        )}

        <section style={{ padding: "16px 0 80px" }}>
          <div className="wrap grid grid-3">
            {items.map((item) => (
              <Link
                key={item.slug}
                href={`/shop/${item.slug}`}
                className="card"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  opacity: item.isSoldOut ? 0.62 : 1,
                }}
              >
                <div className="thumb" style={{ position: "relative", padding: 0 }}>
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    width={400}
                    height={400}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  {item.isSoldOut && (
                    <span
                      style={{
                        position: "absolute", top: 12, right: 12, background: "var(--ember)",
                        color: "var(--cream)", fontSize: 11, letterSpacing: ".12em",
                        textTransform: "uppercase", padding: "4px 10px", borderRadius: 100,
                      }}
                    >
                      Sold out
                    </span>
                  )}
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
                      {item.isSoldOut
                        ? "Sold out"
                        : item.isLow
                          ? `Only ${item.stockQty} left`
                          : "In stock"}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {!dbDown && items.length === 0 && (
            <div className="wrap" style={{ textAlign: "center", color: "var(--sage)" }}>
              The collection goes live shortly.{" "}
              <Link href="/" style={{ color: "var(--clay)" }}>
                Join the early list
              </Link>{" "}
              for first pick.
            </div>
          )}
        </section>
      </main>
    </>
  );
}
