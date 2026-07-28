import Link from "next/link";
import Lockup from "./Lockup";

/**
 * Site-wide footer, so no page is a dead end.
 *
 * §6: opens with the rule, full measure. §2.3: the stacked lockup (rule then
 * wordmark, no ग) is the form for secondary placements like this one.
 *
 * §8 voice: "रोज़ के काम, रोज़ की सुंदरता" sits beside the English rather than
 * translating it — the guideline is explicit that the two languages sit side
 * by side without one being a word-for-word rendering of the other.
 */
export default function SiteFooter() {
  return (
    <footer style={{ marginTop: 48 }}>
      <div className="rule" />
      <div className="wrap" style={{ padding: "36px 0 48px" }}>
        <div className="grid grid-3" style={{ gap: 28, marginBottom: 28 }}>
          <div>
            <Lockup href={null} compact />
            <p
              className="deva-text"
              lang="hi"
              style={{ color: "var(--text2)", fontSize: 16, marginTop: 12 }}
            >
              रोज़ के काम, रोज़ की सुंदरता।
            </p>
            <p style={{ color: "var(--meta)", fontSize: 15, marginTop: 6 }}>
              Caricature candles for the siblings who&apos;d never say it out loud.
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
                <Link href={href} style={{ color: "var(--ink)", textDecoration: "none", fontSize: 16 }}>
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
                <Link href={href} style={{ color: "var(--ink)", textDecoration: "none", fontSize: 16 }}>
                  {label}
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid var(--sand)", paddingTop: 18,
            display: "flex", justifyContent: "space-between",
            flexWrap: "wrap", gap: 10, color: "var(--meta)", fontSize: 13,
          }}
        >
          <span className="label">Made by hand, in small batches</span>
          <span className="label">Order by 21 August · Raksha Bandhan 28 August</span>
        </div>
      </div>
    </footer>
  );
}
