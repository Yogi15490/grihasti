import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ShareCircle from "@/components/ShareCircle";
import DevSettle from "@/components/DevSettle";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { buildShareUrl } from "@/lib/dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your order — Grihasti" };

export default async function OrderConfirmation({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(`/login?next=/order/${id}`);

  const { rows } = await query<{
    id: string;
    user_id: string;
    status: string;
    gross_total_inr: string;
    points_redeemed_inr: string;
    cash_paid_inr: string;
    gst_invoice_no: string | null;
    awb_tracking: string | null;
    courier_name: string | null;
    fulfilment_hold: boolean;
  }>(
    `select id, user_id, status, gross_total_inr, points_redeemed_inr, cash_paid_inr,
            gst_invoice_no, awb_tracking, courier_name, fulfilment_hold
       from orders where id = $1`,
    [id],
  );

  const order = rows[0];
  // Authorization in app code — the client never touches Postgres, so there is
  // no RLS backstop here. This check is the boundary.
  if (!order || order.user_id !== user.userId) notFound();

  const { rows: items } = await query<{
    slug: string; name: string; qty: number; scent: string | null; name_message: string | null;
  }>(
    `select p.slug, p.name, oi.qty, oi.scent, oi.name_message
       from order_items oi join products p on p.id = oi.product_id
      where oi.order_id = $1`,
    [id],
  );

  const paid = ["paid", "dispatched", "delivered"].includes(order.status);
  const gross = Number(order.gross_total_inr);
  const pointsUsed = Number(order.points_redeemed_inr);
  const cashDue = Math.round((gross - pointsUsed) * 100) / 100;

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ padding: "48px 0 80px", maxWidth: 700 }}>
        {paid ? (
          <>
            <p className="eyebrow">Order confirmed</p>
            <h1 style={{ fontSize: 40, margin: "12px 0 8px" }}>
              It&apos;s on its way to being made.
            </h1>
            <p style={{ color: "var(--sage)" }}>
              We&apos;ve emailed your receipt
              {order.gst_invoice_no ? ` · Invoice ${order.gst_invoice_no}` : ""}.
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow">Payment pending</p>
            <h1 style={{ fontSize: 40, margin: "12px 0 8px" }}>Almost there.</h1>
            <p style={{ color: "var(--sage)" }}>
              We&apos;ve held your order. It&apos;s confirmed once payment completes —
              you&apos;ll get an email the moment it does.
            </p>
          </>
        )}

        {order.fulfilment_hold && (
          <div
            className="card"
            style={{ padding: 18, marginTop: 20, borderColor: "var(--clay)", background: "#fff5f0" }}
          >
            <strong>We&apos;ve hit a snag with stock on this one.</strong>
            <p style={{ fontSize: 14, marginTop: 6 }}>
              This design sold out moments before your payment landed. We&apos;re refunding
              you in full and will email you shortly. Sorry — small batches, and this one went fast.
            </p>
          </div>
        )}

        <div className="card" style={{ padding: 24, marginTop: 24 }}>
          <h2 style={{ fontSize: 22, marginBottom: 14 }}>What you ordered</h2>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <img
                src={`/designs/${it.slug}.svg`}
                alt={it.name}
                width={56}
                height={56}
                style={{ width: 56, height: 56, borderRadius: 8, background: "#efe4d2", flexShrink: 0 }}
              />
              <div>
                <div>{it.name} × {it.qty}</div>
                <div style={{ color: "var(--sage)", fontSize: 13 }}>
                  {it.scent}
                  {it.name_message ? ` · “${it.name_message}”` : ""}
                </div>
              </div>
            </div>
          ))}

          <hr style={{ border: "none", borderTop: "1px solid #ece3d3", margin: "14px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
            <span>Order total</span><span>₹{gross.toLocaleString("en-IN")}</span>
          </div>
          {pointsUsed > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--brass)" }}>
              <span>Cashback used</span><span>−₹{pointsUsed.toLocaleString("en-IN")}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span>{paid ? "Paid" : "To pay"}</span>
            <span className="price">₹{(paid ? Number(order.cash_paid_inr) : cashDue).toLocaleString("en-IN")}</span>
          </div>

          {order.awb_tracking && (
            <p style={{ marginTop: 14, fontSize: 14 }}>
              Tracking: <strong>{order.awb_tracking}</strong>
              {order.courier_name ? ` · ${order.courier_name}` : ""}
            </p>
          )}
        </div>

        {!paid && <DevSettle orderId={order.id} />}

        {paid && !order.fulfilment_hold && (
          <ShareCircle shareUrl={buildShareUrl(user.inviteCode)} />
        )}

        <div style={{ marginTop: 28, textAlign: "center" }}>
          <Link href="/account" style={{ color: "var(--clay)" }}>
            See all your orders and cashback →
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
