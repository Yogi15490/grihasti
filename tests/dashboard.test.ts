/**
 * Referral dashboard + admin tests.
 *
 * The dashboard numbers must reconcile exactly with the ledger. Covers §11
 * step 7 (dispatch) via the admin service.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { freshDb, signup, type TestDb } from "./helpers/testdb.ts";
import { createOrder, confirmPayment, refundOrder } from "../src/lib/orders.ts";
import { StubPaymentProvider } from "../src/lib/payments/stub.ts";
import {
  getReferralDashboard, getLedgerHistory, getOrderHistory, maskEmail, buildShareUrl,
} from "../src/lib/dashboard.ts";
import {
  assertAdmin, AdminError, listOrders, getOrderDetail, listStock, setStock,
  markDispatched, markDelivered, getUserForSupport, adjustBalance, getAdminSummary,
} from "../src/lib/admin.ts";

async function chain(db: TestDb, stock = 10) {
  const a = await signup(db, "aarti.sharma@example.com");
  const b = await signup(db, "bhavesh@example.com", a.code);
  const c = await signup(db, "chetan@example.com", b.code);
  const d = await signup(db, "divya@example.com", c.code);
  await db.query(
    `insert into products (slug, name, type, price_inr, stock_qty)
     values ('cool-bhaiya','The Cool Bhaiya','caricature',1000,$1),
            ('gift-set','The Rakhi Gift Set','giftset',850,$1)`,
    [stock],
  );
  return { a, b, c, d };
}

/** Push an existing order through the signed-webhook path. */
async function payOrder(db: TestDb, orderId: string, amountInr: number) {
  const provider = new StubPaymentProvider();
  const { rawBody, signature } = provider.captureFor(orderId, amountInr);
  const v = provider.verifyWebhook(rawBody, signature);
  if (!v.ok) throw new Error("unreachable");
  return confirmPayment(db, {
    orderId, provider: "stub", paymentRef: v.event.paymentRef, amountInr,
  });
}

async function buyAndPay(db: TestDb, userId: string, points = 0, slug = "cool-bhaiya") {
  const o = await createOrder(db, {
    userId, items: [{ slug, qty: 1 }], requestedPointsInr: points,
    shippingAddress: { line1: "12 MG Road", city: "Pune", pin: "411001" },
  });
  await payOrder(db, o.orderId, o.cashDueInr);
  return o;
}

/**
 * Reproduce a genuine oversell: BOTH customers reach checkout while one unit
 * remains, then both pay. Creating the second order after the first has paid
 * would just fail the stock check and never exercise the hold path.
 */
async function oversell(db: TestDb, firstUser: string, secondUser: string) {
  const first = await createOrder(db, {
    userId: firstUser, items: [{ slug: "cool-bhaiya", qty: 1 }],
  });
  const second = await createOrder(db, {
    userId: secondUser, items: [{ slug: "cool-bhaiya", qty: 1 }],
  });
  await payOrder(db, first.orderId, first.cashDueInr);
  const secondResult = await payOrder(db, second.orderId, second.cashDueInr);
  return { first, second, secondResult };
}

async function makeAdmin(db: TestDb, email = "ops@grihasti.in") {
  const admin = await signup(db, email);
  await db.query(`update users set is_admin = true where id = $1`, [admin.id]);
  return admin;
}

describe("referral dashboard", () => {
  test("reports link, invites, balance and per-level earnings", async () => {
    const db = await freshDb();
    const { a, b, c, d } = await chain(db);
    await buyAndPay(db, d.id);

    const dash = await getReferralDashboard(db, a.id);

    assert.equal(dash.inviteCode, a.code);
    assert.equal(dash.shareUrl, buildShareUrl(a.code));
    assert.equal(dash.invitesRemaining, 4, "A invited B");
    assert.equal(dash.invitesUsed, 1);
    assert.equal(dash.circleIsFull, false);

    // A sits at L3 of D's order: 0.625% of ₹1000.
    assert.equal(dash.balanceInr, 6.25);
    assert.equal(dash.earnings.byLevelInr[3], 6.25);
    assert.equal(dash.earnings.byLevelInr[1], 0);
    assert.equal(dash.earnings.ownPurchasesInr, 0);
    assert.equal(dash.earnings.totalEarnedInr, 6.25);

    // Rates come from the engine, never hardcoded in the UI.
    assert.deepEqual(dash.rates.map((r) => r.rate), [0.05, 0.025, 0.0125, 0.00625]);
    await db.close();
  });

  test("dashboard balance always equals the ledger sum", async () => {
    const db = await freshDb();
    const { c, d } = await chain(db);
    await buyAndPay(db, d.id);
    await buyAndPay(db, c.id);

    for (const u of [c.id, d.id]) {
      const dash = await getReferralDashboard(db, u);
      const ledgerSum = await db.scalar<string>(
        `select coalesce(sum(amount_inr),0)::text from points_ledger where user_id = $1`, [u],
      );
      assert.equal(dash.balanceInr, Number(ledgerSum), "no drift between view and ledger");
    }
    await db.close();
  });

  test("downline shows three levels with masked identities", async () => {
    const db = await freshDb();
    const { a, b, c, d } = await chain(db);
    await buyAndPay(db, d.id);

    const dash = await getReferralDashboard(db, a.id);
    assert.equal(dash.downline.length, 3);
    assert.deepEqual(dash.downlineCountByLevel, { 1: 1, 2: 1, 3: 1 });

    const dRow = dash.downline.find((m) => m.level === 3)!;
    assert.equal(dRow.ordersPaid, 1);
    assert.equal(dRow.earnedFromInr, 6.25);
    assert.match(dRow.maskedEmail, /^di…a@example\.com$/, "identity masked");
    assert.ok(!dash.downline.some((m) => m.maskedEmail.includes("divya")), "no raw emails");
    await db.close();
  });

  test("downline never shows deeper than the payout reaches", async () => {
    // Showing L4 would imply earnings that never arrive.
    const db = await freshDb();
    const { a, d } = await chain(db);
    const e = await signup(db, "esha@example.com", d.code);
    await signup(db, "farhan@example.com", e.code);

    const dash = await getReferralDashboard(db, a.id);
    assert.equal(dash.downline.length, 3);
    assert.ok(dash.downline.every((m) => m.level <= 3));
    await db.close();
  });

  test("available balance excludes points committed to an unpaid order", async () => {
    const db = await freshDb();
    const { d } = await chain(db);
    await db.query(
      `insert into points_ledger (user_id, order_id, type, level, amount_inr)
       values ($1, null, 'ADJUST', null, 500)`, [d.id],
    );
    await createOrder(db, {
      userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }], requestedPointsInr: 500,
    });

    const dash = await getReferralDashboard(db, d.id);
    assert.equal(dash.balanceInr, 500, "ledger still shows the points");
    assert.equal(dash.availableInr, 0, "but none are spendable");
    await db.close();
  });

  test("circle full is surfaced explicitly", async () => {
    const db = await freshDb();
    const { a } = await chain(db);
    for (let i = 0; i < 4; i++) await signup(db, `x${i}@example.com`, a.code);

    const dash = await getReferralDashboard(db, a.id);
    assert.equal(dash.invitesRemaining, 0);
    assert.equal(dash.circleIsFull, true);
    assert.equal(dash.invitesUsed, 5);
    await db.close();
  });

  test("refund is reflected as a clawback, not a silent decrease", async () => {
    const db = await freshDb();
    const { a, d } = await chain(db);
    const o = await buyAndPay(db, d.id);
    assert.equal((await getReferralDashboard(db, a.id)).balanceInr, 6.25);

    await refundOrder(db, o.orderId);
    const dash = await getReferralDashboard(db, a.id);
    assert.equal(dash.balanceInr, 0);
    assert.equal(dash.earnings.clawedBackInr, -6.25, "visible as a reversal");
    assert.equal(dash.earnings.byLevelInr[3], 6.25, "the original earn is not erased");
    await db.close();
  });

  test("ledger history is human-readable and newest first", async () => {
    const db = await freshDb();
    const { c, d } = await chain(db);
    await buyAndPay(db, d.id);

    const rows = await getLedgerHistory(db, c.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amountInr, 25);
    assert.equal(rows[0].description, "Someone you invited placed an order");
    await db.close();
  });

  test("order history exposes tracking once dispatched", async () => {
    const db = await freshDb();
    const { d } = await chain(db);
    const admin = await makeAdmin(db);
    const o = await buyAndPay(db, d.id);
    await markDispatched(db, admin.id, {
      orderId: o.orderId, awb: "AWB123456", courierName: "Delhivery",
    });

    const history = await getOrderHistory(db, d.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].status, "dispatched");
    assert.equal(history[0].tracking, "AWB123456");
    assert.equal(history[0].courier, "Delhivery");
    await db.close();
  });

  test("maskEmail keeps recognisability without leaking the address", () => {
    assert.equal(maskEmail("ravi.sharma@gmail.com"), "ra…a@gmail.com");
    assert.equal(maskEmail("ab@x.com"), "ab…@x.com");
    assert.equal(maskEmail(null), "a friend");
    assert.equal(maskEmail("not-an-email"), "a friend");
  });
});

describe("admin — authorisation", () => {
  test("every admin entry point rejects a non-admin", async () => {
    const db = await freshDb();
    const { d } = await chain(db);
    const rejects = (p: Promise<unknown>) =>
      assert.rejects(() => p, (e: Error) => e instanceof AdminError && e.code === "not_admin");

    await rejects(assertAdmin(db, d.id));
    await rejects(listOrders(db, d.id));
    await rejects(listStock(db, d.id));
    await rejects(getAdminSummary(db, d.id));
    await rejects(getUserForSupport(db, d.id, d.id));
    await rejects(adjustBalance(db, d.id, d.id, 1000, "self-serve"));
    await rejects(markDispatched(db, d.id, { orderId: d.id, awb: "X", courierName: "Y" }));
    await db.close();
  });
});

describe("§11.7 — admin dispatch", () => {
  test("dispatch sets tracking and status, and is audited", async () => {
    const db = await freshDb();
    const { d } = await chain(db);
    const admin = await makeAdmin(db);
    const o = await buyAndPay(db, d.id);

    const res = await markDispatched(db, admin.id, {
      orderId: o.orderId, awb: "AWB999", courierName: "Bluedart",
      shiprocketOrderId: "SR-1", labelUrl: "https://example.com/label.pdf",
    });
    assert.equal(res.awb, "AWB999");

    const row = await db.one<{ status: string; awb_tracking: string; dispatched_at: Date }>(
      `select status, awb_tracking, dispatched_at from orders where id = $1`, [o.orderId],
    );
    assert.equal(row!.status, "dispatched");
    assert.equal(row!.awb_tracking, "AWB999");
    assert.ok(row!.dispatched_at, "dispatch timestamped");

    const audited = await db.scalar<string>(
      `select count(*)::text from admin_actions
        where action = 'dispatch' and target_id = $1 and admin_id = $2`,
      [o.orderId, admin.id],
    );
    assert.equal(Number(audited), 1, "attributable to a named admin");
    await db.close();
  });

  test("cannot dispatch an unpaid order", async () => {
    const db = await freshDb();
    const { d } = await chain(db);
    const admin = await makeAdmin(db);
    const o = await createOrder(db, { userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }] });

    await assert.rejects(
      () => markDispatched(db, admin.id, { orderId: o.orderId, awb: "X", courierName: "Y" }),
      (e: Error) => e instanceof AdminError && e.code === "bad_status",
    );
    await db.close();
  });

  test("cannot dispatch an oversold order — it must be refunded", async () => {
    const db = await freshDb();
    const { c, d } = await chain(db, 1);
    const admin = await makeAdmin(db);
    const { second, secondResult } = await oversell(db, c.id, d.id);

    assert.equal(secondResult.fulfilmentHold, true, "payment kept, order flagged");
    await assert.rejects(
      () => markDispatched(db, admin.id, { orderId: second.orderId, awb: "X", courierName: "Y" }),
      /fulfilment hold/i,
    );
    await db.close();
  });

  test("AWB is required — a blank dispatch is refused", async () => {
    const db = await freshDb();
    const { d } = await chain(db);
    const admin = await makeAdmin(db);
    const o = await buyAndPay(db, d.id);
    await assert.rejects(
      () => markDispatched(db, admin.id, { orderId: o.orderId, awb: "   ", courierName: "Y" }),
      (e: Error) => e instanceof AdminError && e.code === "bad_input",
    );
    await db.close();
  });

  test("delivery follows dispatch, not payment", async () => {
    const db = await freshDb();
    const { d } = await chain(db);
    const admin = await makeAdmin(db);
    const o = await buyAndPay(db, d.id);

    await assert.rejects(() => markDelivered(db, admin.id, o.orderId), /Cannot deliver/);
    await markDispatched(db, admin.id, { orderId: o.orderId, awb: "A1", courierName: "C" });
    await markDelivered(db, admin.id, o.orderId);

    assert.equal(await db.scalar<string>(`select status from orders where id=$1`, [o.orderId]), "delivered");
    await db.close();
  });
});

describe("admin — orders, stock, support", () => {
  test("held orders sort to the top of the list", async () => {
    const db = await freshDb();
    const { c, d } = await chain(db, 1);
    const admin = await makeAdmin(db);
    const { second } = await oversell(db, c.id, d.id);

    const all = await listOrders(db, admin.id);
    assert.equal(all[0].orderId, second.orderId, "someone is waiting on a refund");
    assert.equal(all[0].fulfilmentHold, true);

    const heldOnly = await listOrders(db, admin.id, { heldOnly: true });
    assert.equal(heldOnly.length, 1);
    await db.close();
  });

  test("order detail shows personalisation and the ledger it moved", async () => {
    const db = await freshDb();
    const { a, d } = await chain(db);
    const admin = await makeAdmin(db);
    const provider = new StubPaymentProvider();
    const o = await createOrder(db, {
      userId: d.id,
      items: [{ slug: "cool-bhaiya", qty: 1, scent: "Sunday Slow", nameMessage: "For Rohit bhai" }],
    });
    const { rawBody, signature } = provider.captureFor(o.orderId, 1000);
    const v = provider.verifyWebhook(rawBody, signature);
    if (!v.ok) throw new Error("unreachable");
    await confirmPayment(db, {
      orderId: o.orderId, provider: "stub", paymentRef: v.event.paymentRef, amountInr: 1000,
    });

    const detail = await getOrderDetail(db, admin.id, o.orderId);
    assert.equal(detail.items[0].nameMessage, "For Rohit bhai", "needed to make the candle");
    assert.equal(detail.items[0].scent, "Sunday Slow");
    assert.equal(detail.ledger.length, 4, "buyer + 3 upline");
    assert.equal(detail.ledger.find((l) => l.userId === a.id)!.amountInr, 6.25);
    await db.close();
  });

  test("stock list flags low and sold-out designs, and counts sold", async () => {
    const db = await freshDb();
    const { d } = await chain(db, 3);
    const admin = await makeAdmin(db);
    await buyAndPay(db, d.id);

    const stock = await listStock(db, admin.id);
    const cool = stock.find((s) => s.slug === "cool-bhaiya")!;
    assert.equal(cool.stockQty, 2);
    assert.equal(cool.sold, 1);
    assert.equal(cool.isLow, true, "2 <= threshold");
    assert.equal(cool.isSoldOut, false);
    await db.close();
  });

  test("setStock is absolute and audited", async () => {
    const db = await freshDb();
    await chain(db, 3);
    const admin = await makeAdmin(db);
    const productId = await db.scalar<string>(`select id from products where slug='cool-bhaiya'`);

    const res = await setStock(db, admin.id, productId, 40, "production pilot delivered");
    assert.deepEqual([res.from, res.to], [3, 40]);

    const audited = await db.one<{ detail: { reason: string } }>(
      `select detail from admin_actions where action='set_stock' and target_id=$1`, [productId],
    );
    assert.equal(audited!.detail.reason, "production pilot delivered");

    await assert.rejects(() => setStock(db, admin.id, productId, -1, "oops"), /non-negative/);
    await db.close();
  });

  test("balance corrections append an ADJUST row and require a reason", async () => {
    const db = await freshDb();
    const { d } = await chain(db);
    const admin = await makeAdmin(db);

    await assert.rejects(() => adjustBalance(db, admin.id, d.id, 100, "  "), /reason is required/);
    await assert.rejects(() => adjustBalance(db, admin.id, d.id, 0, "nothing"), /non-zero/);

    const r = await adjustBalance(db, admin.id, d.id, 250, "goodwill — delayed delivery");
    assert.equal(r.newBalanceInr, 250);

    const kinds = await db.query<{ type: string }>(
      `select type from points_ledger where user_id = $1`, [d.id],
    );
    assert.deepEqual(kinds.rows.map((k) => k.type), ["ADJUST"], "history appended, never edited");

    // Repeat corrections must keep working — the guard is partial on order_id.
    await adjustBalance(db, admin.id, d.id, -50, "correction");
    const after = await adjustBalance(db, admin.id, d.id, 10, "rounding");
    assert.equal(after.newBalanceInr, 210);
    await db.close();
  });

  test("support view resolves a customer's whole referral picture", async () => {
    const db = await freshDb();
    const { a, b, d } = await chain(db);
    const admin = await makeAdmin(db);
    await buyAndPay(db, d.id);

    const view = await getUserForSupport(db, admin.id, b.id);
    assert.equal(view.user.inviterEmail, "aarti.sharma@example.com");
    assert.equal(view.balanceInr, 12.5, "B earns at L2");
    assert.equal(view.downline.length, 2, "C and D beneath B");
    await db.close();
  });

  test("summary counts the points liability, not just revenue", async () => {
    const db = await freshDb();
    const { c, d } = await chain(db);
    const admin = await makeAdmin(db);
    const o = await buyAndPay(db, d.id);
    await markDispatched(db, admin.id, { orderId: o.orderId, awb: "A", courierName: "C" });
    await buyAndPay(db, c.id);

    const s = await getAdminSummary(db, admin.id);
    assert.equal(s.revenueInr, 2000);
    assert.equal(s.inTransit, 1);
    assert.equal(s.awaitingDispatch, 1);

    // Every rupee here is owed back to customers as future discount.
    // D's ₹1000 order has a full 3-deep upline: 50+25+12.5+6.25 = 93.75.
    // C's ₹1000 order only reaches B and A:      50+25+12.5      = 87.50.
    // Both are 9.375% and 8.75% respectively — a shallower chain costs less,
    // which is exactly why the bounded figure in §14 is a ceiling, not a rate.
    assert.equal(s.outstandingPointsInr, 93.75 + 87.5);
    assert.equal(s.members, 5, "4 chain + 1 admin");
    await db.close();
  });
});
