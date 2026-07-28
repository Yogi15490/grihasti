import { Suspense } from "react";
import SiteHeader from "@/components/SiteHeader";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Sign in — Grihasti" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ padding: "56px 0 80px", maxWidth: 460 }}>
        <p className="eyebrow">Grihasti</p>
        <h1 style={{ fontSize: 36, margin: "12px 0 6px" }}>Sign in</h1>
        <p style={{ color: "var(--sage)", marginBottom: 24 }}>
          No password. We&apos;ll email you a six-digit code.
        </p>
        <Suspense fallback={<p style={{ color: "var(--sage)" }}>Loading…</p>}>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}
