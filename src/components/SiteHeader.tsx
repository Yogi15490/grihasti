import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import CartCount from "./CartCount";

/** Shared header. Server component so it can show sign-in state without a flash. */
export default async function SiteHeader() {
  const user = await getCurrentUser().catch(() => null);

  return (
    <header
      style={{
        borderBottom: "1px solid #ece3d3",
        background: "rgba(244,236,221,.9)",
        backdropFilter: "blur(8px)",
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
          height: 62,
          gap: 16,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "var(--serif)",
            fontSize: 24,
            letterSpacing: ".02em",
            textDecoration: "none",
            color: "var(--ember)",
          }}
        >
          Grihasti
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 14 }}>
          <Link href="/shop" style={{ textDecoration: "none", color: "var(--ember)" }}>
            Collection
          </Link>
          {user ? (
            <Link href="/account" style={{ textDecoration: "none", color: "var(--ember)" }}>
              Your circle
            </Link>
          ) : (
            <Link href="/login" style={{ textDecoration: "none", color: "var(--ember)" }}>
              Sign in
            </Link>
          )}
          <CartCount />
        </nav>
      </div>
    </header>
  );
}
