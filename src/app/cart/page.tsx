import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CartView from "@/components/CartView";

export const metadata = { title: "Your cart — Grihasti" };
export const dynamic = "force-dynamic";

export default function CartPage() {
  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ padding: "40px 0 80px", maxWidth: 760 }}>
        <h1 style={{ fontSize: 36, marginBottom: 6 }}>Your cart</h1>
        <p style={{ color: "var(--sage)", marginBottom: 24 }}>
          Order by 21 Aug for guaranteed delivery before Raksha Bandhan.
        </p>
        <CartView />
      </main>
      <SiteFooter />
    </>
  );
}
