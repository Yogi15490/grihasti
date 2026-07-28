import { redirect } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ShareCircle from "@/components/ShareCircle";
import { getCurrentUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getReferralDashboard, getLedgerHistory, getOrderHistory } from "@/lib/dashboard";

export const metadata = { title: "Your circle — Grihasti" };
export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default async function AccountPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login?next=/account");

  const db = await getDb();
  const [dash, ledger, orders] = await Promise.all([
    getReferralDashboard(db, user.userId),
    getLedgerHistory(db, user.userId, 25),
    getOrderHistory(db, user.userId),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ padding: "40px 0 80px", maxWidth: 860 }}>
        <p className="eyebrow">Your circle</p>
        <h1 style={{ fontSize: 38, margin: "12px 0 24px" }}>
          {inr(dash.availableInr)} ready to spend
        </h1>

        <div className="grid grid-3" style={{ marginBottom: 24 }}>
          {[
            ["Available now", inr(dash.availableInr), "Use at checkout"],
            ["Earned all time", inr(dash.earnings.totalEarnedInr), "Yours and your circle's"],
            [
              "Invites left",
              `${dash.invitesRemaining} of 5`,
              dash.circleIsFull ? "Your circle is full" : "Each one earns you more",
            ],
          ].map(([label, value, sub]) => (
            <div key={label} className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--brass)" }}>
                {label}
              </div>
              <div className="price" style={{ fontSize: 28, marginTop: 6 }}>{value}</div>
              <div style={{ color: "var(--sage)", fontSize: 13 }}>{sub}</div>
            </div>
          ))}
        </div>

        {dash.balanceInr !== dash.availableInr && (
          <p style={{ color: "var(--sage)", fontSize: 13, marginBottom: 20 }}>
            {inr(dash.balanceInr - dash.availableInr)} is held against an order you haven&apos;t
            paid for yet. It&apos;ll come back if that order isn&apos;t completed.
          </p>
        )}

        {!dash.circleIsFull && <ShareCircle shareUrl={dash.shareUrl} />}

        {dash.circleIsFull && (
          <div className="card" style={{ padding: 24, background: "#fff8ef" }}>
            <h2 style={{ fontSize: 24 }}>Your circle is full.</h2>
            <p style={{ color: "var(--sage)", fontSize: 14, marginTop: 6 }}>
              All five invites are used — but you keep earning from everyone in it,
              on every order they place, for as long as they shop with us.
            </p>
          </div>
        )}

        {/* ── Downline ─────────────────────────────────────────────── */}
        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 26, marginBottom: 4 }}>Who you&apos;ve brought in</h2>
          <p style={{ color: "var(--sage)", fontSize: 14, marginBottom: 16 }}>
            You earn {(dash.rates[1].rate * 100).toFixed(1)}% on people you invited directly,
            {" "}{(dash.rates[2].rate * 100).toFixed(2)}% on theirs, and
            {" "}{(dash.rates[3].rate * 100).toFixed(3)}% one level beyond that.
          </p>

          {dash.downline.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--sage)" }}>
              Nobody yet. Share your link above — you&apos;ll earn on every order they place.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {dash.downline.map((m, i) => (
                <div
                  key={m.userId}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "14px 18px",
                    borderTop: i === 0 ? "none" : "1px solid #f2ebdd",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15 }}>{m.maskedEmail}</div>
                    <div style={{ color: "var(--sage)", fontSize: 12 }}>
                      Level {m.level} · {m.ordersPaid === 0
                        ? "no orders yet"
                        : `${m.ordersPaid} order${m.ordersPaid === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  <div className="price" style={{ fontSize: 18 }}>{inr(m.earnedFromInr)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Orders ───────────────────────────────────────────────── */}
        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 26, marginBottom: 16 }}>Your orders</h2>
          {orders.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--sage)" }}>
              No orders yet.{" "}
              <Link href="/shop" style={{ color: "var(--clay)" }}>Browse the collection</Link>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {orders.map((o, i) => (
                <Link
                  key={o.orderId}
                  href={`/order/${o.orderId}`}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "14px 18px", textDecoration: "none", color: "inherit",
                    borderTop: i === 0 ? "none" : "1px solid #f2ebdd",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, textTransform: "capitalize" }}>{o.status}</div>
                    <div style={{ color: "var(--sage)", fontSize: 12 }}>
                      {new Date(o.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                      {" · "}{o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                      {o.tracking ? ` · ${o.tracking}` : ""}
                    </div>
                  </div>
                  <div className="price" style={{ fontSize: 18 }}>{inr(o.grossTotalInr)}</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ── Ledger ───────────────────────────────────────────────── */}
        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 26, marginBottom: 16 }}>Cashback history</h2>
          {ledger.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--sage)" }}>
              Nothing here yet.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {ledger.map((row, i) => (
                <div
                  key={row.id}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 18px",
                    borderTop: i === 0 ? "none" : "1px solid #f2ebdd",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14 }}>{row.description}</div>
                    <div style={{ color: "var(--sage)", fontSize: 12 }}>
                      {new Date(row.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short",
                      })}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--serif)", fontSize: 17,
                      color: row.amountInr < 0 ? "var(--sage)" : "var(--clay)",
                    }}
                  >
                    {row.amountInr < 0 ? "−" : "+"}{inr(Math.abs(row.amountInr))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <form action="/api/auth/logout" method="post" style={{ marginTop: 36, textAlign: "center" }}>
          <button
            type="submit"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--sage)", fontSize: 13, textDecoration: "underline",
              fontFamily: "var(--sans)",
            }}
          >
            Sign out
          </button>
        </form>
      </main>
      <SiteFooter />
    </>
  );
}
