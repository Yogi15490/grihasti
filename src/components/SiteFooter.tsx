import Link from "next/link";

/**
 * Site-wide footer. Exists mainly so every page has a route out of it —
 * the landing page shipped without navigation and stranded visitors on a
 * waitlist form while the shop was open.
 *
 * The policy links are placeholders: Razorpay requires those pages live
 * before it will activate an account (see docs/GO_LIVE_ACCOUNTS.md).
 */
export default function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid #ece3d3", marginTop: 40, padding: "40px 0 48px" }}>
      <div className="wrap">
        <div className="grid grid-3" style={{ gap: 28, marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 24 }}>Grihasti</div>
            <p style={{ color: "var(--sage)", fontSize: 14, marginTop: 6 }}>
              Handmade caricature candles for the siblings who&apos;d never say it out loud.
            </p>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Shop</div>
            {[
              ["The Bhai-Behen Collection", "/shop"],
              ["The Rakhi Gift Set", "/shop/gift-set"],
              ["Your cart", "/cart"],
            ].map(([label, href]) => (
              <div key={href} style={{ marginBottom: 6 }}>
                <Link href={href} style={{ color: "var(--ember)", textDecoration: "none", fontSize: 14 }}>
                  {label}
                </Link>
              </div>
            ))}
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Your account</div>
            {[
              ["Sign in", "/login"],
              ["Your circle & cashback", "/account"],
            ].map(([label, href]) => (
              <div key={href} style={{ marginBottom: 6 }}>
                <Link href={href} style={{ color: "var(--ember)", textDecoration: "none", fontSize: 14 }}>
                  {label}
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid #f2ebdd", paddingTop: 18,
            display: "flex", justifyContent: "space-between",
            flexWrap: "wrap", gap: 10, color: "var(--sage)", fontSize: 13,
          }}
        >
          <span className="serif-italic">Made for you, by hand.</span>
          <span>Order by 21 August for delivery before Raksha Bandhan.</span>
        </div>
      </div>
    </footer>
  );
}
