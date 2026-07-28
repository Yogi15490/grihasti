import Link from "next/link";
import Lockup from "./Lockup";
import CartCount from "./CartCount";
import { getCurrentUser } from "@/lib/session";

/**
 * Shared header. Server component so sign-in state renders without a flash.
 *
 * §6: "the rule as the top border of the site header" — the same device as
 * the extended shirorekha in the lockup, running the full measure of the page.
 *
 * §7: no shadows or blurs. The previous translucent backdrop-blur bar was a
 * different visual language entirely; a flat Paper ground with a rule is the
 * brand's own.
 */
export default async function SiteHeader() {
  const user = await getCurrentUser().catch(() => null);

  return (
    <header
      style={{
        borderTop: "4px solid var(--haldi)",
        borderBottom: "1px solid var(--sand)",
        background: "var(--paper)",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <div
        className="wrap"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 78,
          gap: 16,
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        <Lockup href="/" />

        <nav style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Link href="/shop" className="nav-link">Collection</Link>
          {user ? (
            <Link href="/account" className="nav-link">Your circle</Link>
          ) : (
            <Link href="/login" className="nav-link">Sign in</Link>
          )}
          <CartCount />
        </nav>
      </div>
    </header>
  );
}
