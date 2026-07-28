import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import AdminOrderRow from "@/components/AdminOrderRow";
import AdminStockRow from "@/components/AdminStockRow";
import { getCurrentUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getAdminSummary, listOrders, listStock } from "@/lib/admin";

export const metadata = { title: "Admin — Grihasti" };
export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default async function AdminPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login?next=/admin");

  const db = await getDb();

  // Not a 403 page: an admin URL that confirms it exists is an invitation.
  let summary, orders, stock;
  try {
    [summary, orders, stock] = await Promise.all([
      getAdminSummary(db, user.userId),
      listOrders(db, user.userId, { limit: 100 }),
      listStock(db, user.userId),
    ]);
  } catch {
    redirect("/");
  }

  const held = orders.filter((o) => o.fulfilmentHold && o.status !== "refunded");

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ padding: "36px 0 80px" }}>
        <p className="eyebrow">Grihasti · Operations</p>
        <h1 style={{ fontSize: 34, margin: "10px 0 24px" }}>Admin</h1>

        {/* ── Counters ─────────────────────────────────────────────── */}
        <div className="grid grid-3" style={{ marginBottom: 10 }}>
          {[
            ["Awaiting dispatch", String(summary.awaitingDispatch), "Paid, not yet shipped"],
            ["In transit", String(summary.inTransit), "Dispatched"],
            ["Needs refund", String(summary.onHold), "Oversold — customer waiting"],
            ["Revenue", inr(summary.revenueInr), "Cash collected"],
            ["Points liability", inr(summary.outstandingPointsInr), "Owed back as discount"],
            ["Sold out", String(summary.soldOutDesigns), "Designs at zero"],
          ].map(([label, value, sub]) => (
            <div key={label} className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--brass)" }}>
                {label}
              </div>
              <div className="price" style={{ fontSize: 24, marginTop: 4 }}>{value}</div>
              <div style={{ color: "var(--sage)", fontSize: 12 }}>{sub}</div>
            </div>
          ))}
        </div>

        <p style={{ color: "var(--sage)", fontSize: 13, marginBottom: 30 }}>
          {summary.members} members · {summary.waitlistSize} on the waitlist
        </p>

        {/* ── Held orders ──────────────────────────────────────────── */}
        {held.length > 0 && (
          <section style={{ marginBottom: 34 }}>
            <h2 style={{ fontSize: 24, marginBottom: 6, color: "var(--clay)" }}>
              Needs your attention
            </h2>
            <p style={{ color: "var(--sage)", fontSize: 14, marginBottom: 14 }}>
              These customers paid for stock we didn&apos;t have. Refund them.
            </p>
            {held.map((o) => <AdminOrderRow key={o.orderId} order={o} />)}
          </section>
        )}

        {/* ── Orders ───────────────────────────────────────────────── */}
        <section style={{ marginBottom: 34 }}>
          <h2 style={{ fontSize: 24, marginBottom: 14 }}>Orders</h2>
          {orders.length === 0 ? (
            <div className="card" style={{ padding: 24, color: "var(--sage)" }}>No orders yet.</div>
          ) : (
            orders
              .filter((o) => !o.fulfilmentHold || o.status === "refunded")
              .map((o) => <AdminOrderRow key={o.orderId} order={o} />)
          )}
        </section>

        {/* ── Stock ────────────────────────────────────────────────── */}
        <section>
          <h2 style={{ fontSize: 24, marginBottom: 6 }}>Stock</h2>
          <p style={{ color: "var(--sage)", fontSize: 14, marginBottom: 14 }}>
            Absolute counts — set what&apos;s physically on the shelf, not a change.
          </p>
          {stock.map((s) => <AdminStockRow key={s.productId} item={s} />)}
        </section>
      </main>
    </>
  );
}
