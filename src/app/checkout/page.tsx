import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import CheckoutForm from "@/components/CheckoutForm";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Checkout — Grihasti" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await getCurrentUser().catch(() => null);
  // Sign-in is required before checkout: attribution and cashback both hang off
  // a user id, and creating the account after payment would lose the referral.
  if (!user) redirect("/login?next=/checkout");

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ padding: "40px 0 80px", maxWidth: 720 }}>
        <h1 style={{ fontSize: 36, marginBottom: 6 }}>Checkout</h1>
        <p style={{ color: "var(--sage)", marginBottom: 24 }}>
          Signed in as {user.email}
        </p>
        <CheckoutForm />
      </main>
    </>
  );
}
