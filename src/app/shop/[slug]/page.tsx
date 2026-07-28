import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AddToCart from "@/components/AddToCart";
import { getCatalogItem } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function DesignDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await getCatalogItem(slug).catch(() => null);
  if (!item || !item.isActive) notFound();

  const d = item.design;

  return (
    <>
      <SiteHeader />
      <main>
        <div className="wrap" style={{ padding: "28px 0" }}>
          <Link
            href="/shop"
            style={{ color: "var(--haldi)", textDecoration: "none", fontSize: 14 }}
          >
            ← Back to the collection
          </Link>
        </div>

        <section className="wrap grid grid-2" style={{ paddingBottom: 80, alignItems: "start" }}>
          <div className="card">
            <div className="thumb" style={{ padding: 0 }}>
              <img
                src={item.imageUrl}
                alt={item.name}
                width={400}
                height={400}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          </div>

          <div>
            <p className="eyebrow">Grihasti · The Bhai-Behen Collection</p>
            <h1 style={{ fontSize: 40, margin: "10px 0 6px" }}>{item.name}</h1>
            {d && (
              <p className="serif-italic" style={{ color: "var(--haldi)", fontSize: 18 }}>
                {d.persona}
              </p>
            )}
            <p style={{ marginTop: 14 }}>
              A 4-inch caricature candle, hand-finished
              {d ? `. ${d.cues}` : ""}. Gift-boxed with a rakhi thread and a card
              {d ? `. Best for ${d.bestFor.toLowerCase()}` : ""}.
            </p>

            <div className="price" style={{ fontSize: 30, margin: "16px 0 6px" }}>
              ₹{item.priceInr}
            </div>
            <p className={item.isLow ? "stock stock-low" : "stock"} style={{ marginBottom: 18 }}>
              {item.isSoldOut
                ? "Sold out for this drop"
                : item.isLow
                  ? `Only ${item.stockQty} left`
                  : "In stock"}
            </p>

            {item.isSoldOut ? (
              <div className="card" style={{ padding: 20, background: "var(--band)" }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 20 }}>
                  This one&apos;s gone.
                </div>
                <p style={{ color: "var(--meta)", marginTop: 6, fontSize: 14 }}>
                  Small batches, and this design went fast. The{" "}
                  <Link href="/shop/gift-set" style={{ color: "var(--haldi)" }}>
                    Rakhi Gift Set
                  </Link>{" "}
                  is a lovely stand-in, or browse{" "}
                  <Link href="/shop" style={{ color: "var(--haldi)" }}>
                    the rest of the collection
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <AddToCart
                slug={item.slug}
                name={item.name}
                priceInr={item.priceInr}
                scentOptions={item.scentOptions}
                maxQty={item.stockQty}
              />
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
