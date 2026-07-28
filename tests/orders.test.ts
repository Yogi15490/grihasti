/**
 * End-to-end acceptance tests — spec §11 steps 4, 5, 6, 8, 9.
 *
 * Runs the real order pipeline against real Postgres with a stub payment
 * provider. When the Razorpay adapter lands, these tests should pass unchanged
 * with the provider swapped.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { freshDb, signup, balanceOf, type TestDb } from "./helpers/testdb.ts";
import { createOrder, confirmPayment, refundOrder, OrderError, getAvailablePoints } from "../src/lib/orders.ts";
import { StubPaymentProvider } from "../src/lib/payments/stub.ts";

/** Chain A -> B -> C -> D, plus a ₹1000 design in stock. */
async function scenario(db: TestDb, stock = 10) {
  const a = await signup(db, "a@example.com");
  const b = await signup(db, "b@example.com", a.code);
  const c = await signup(db, "c@example.com", b.code);
  const d = await signup(db, "d@example.com", c.code);

  await db.query(
    `insert into products (slug, name, type, price_inr, stock_qty)
     values ('cool-bhaiya','The Cool Bhaiya','caricature',1000,$1)`,
    [stock],
  );

  // Give D ₹100 of points to spend (ADJUST is a legitimate ledger type, §3.5).
  await db.query(
    `insert into points_ledger (user_id, order_id, type, level, amount_inr)
     values ($1, null, 'ADJUST', null, 100)`,
    [d.id],
  );

  return { a, b, c, d };
}

describe("§11.4-6 — the worked example, end to end", () => {
  test("₹1000 order paid ₹900 cash + ₹100 points pays all four levels", async () => {
    const db = await freshDb();
    const { a, b, c, d } = await scenario(db);
    const provider = new StubPaymentProvider();

    const order = await createOrder(db, {
      userId: d.id,
      items: [{ slug: "cool-bhaiya", qty: 1, scent: "Sunday Slow" }],
      requestedPointsInr: 100,
      shippingAddress: { line1: "12 MG Road", city: "Pune", pin: "411001" },
    });

    assert.equal(order.grossTotalInr, 1000);
    assert.equal(order.pointsRedeemedInr, 100);
    assert.equal(order.cashDueInr, 900);
    assert.equal(order.isZeroValue, false);

    // Payment goes through the provider + webhook path, never a client callback.
    const intent = await provider.createIntent({
      orderId: order.orderId,
      amountInr: order.cashDueInr,
    });
    assert.equal(intent.amountInr, 900);

    const { rawBody, signature } = provider.captureFor(order.orderId, 900);
    const verified = provider.verifyWebhook(rawBody, signature);
    assert.equal(verified.ok, true);
    if (!verified.ok) throw new Error("unreachable");

    const result = await confirmPayment(db, {
      orderId: verified.event.orderId,
      provider: provider.name,
      paymentRef: verified.event.paymentRef,
      amountInr: verified.event.amountInr,
    });

    assert.equal(result.alreadyProcessed, false);
    assert.equal(result.fulfilmentHold, false);

    // §11.5 — ledger assertions, to the sub-paise.
    assert.equal(await balanceOf(db, d.id), 100 - 100 + 45, "D: +100 adjust, -100 redeem, +45 earn");
    assert.equal(await balanceOf(db, c.id), 22.5, "C at L1");
    assert.equal(await balanceOf(db, b.id), 11.25, "B at L2");
    assert.equal(await balanceOf(db, a.id), 5.625, "A at L3");

    // §11.6 — stock, invoice, redeem row.
    const stock = await db.scalar<number>(
      `select stock_qty from products where slug = 'cool-bhaiya'`,
    );
    assert.equal(stock, 9, "stock decremented by 1");

    assert.match(result.invoiceNo!, /^GRH\/\d{4}-\d{2}\/00001$/, "sequential GST invoice");

    const redeemRows = await db.scalar<string>(
      `select count(*)::text from points_ledger
        where order_id = $1 and type = 'REDEEM' and amount_inr = -100`,
      [order.orderId],
    );
    assert.equal(Number(redeemRows), 1);
    await db.close();
  });

  test("no cashback accrues on the points-paid portion", async () => {
    // Total earns must equal 9.375% of ₹900, not of ₹1000.
    const db = await freshDb();
    const { d } = await scenario(db);
    const provider = new StubPaymentProvider();

    const order = await createOrder(db, {
      userId: d.id,
      items: [{ slug: "cool-bhaiya", qty: 1 }],
      requestedPointsInr: 100,
    });
    const { rawBody, signature } = provider.captureFor(order.orderId, 900);
    const v = provider.verifyWebhook(rawBody, signature);
    if (!v.ok) throw new Error("unreachable");
    await confirmPayment(db, {
      orderId: order.orderId, provider: "stub",
      paymentRef: v.event.paymentRef, amountInr: 900,
    });

    const totalEarned = await db.scalar<string>(
      `select coalesce(sum(amount_inr),0)::text from points_ledger
        where order_id = $1 and type in ('EARN_SELF','EARN_REFERRAL')`,
      [order.orderId],
    );
    assert.equal(Number(totalEarned), 84.375, "9.375% of ₹900, not ₹1000");
    await db.close();
  });

  test("invoice numbers are sequential and gap-free", async () => {
    const db = await freshDb();
    const { d } = await scenario(db, 10);
    const provider = new StubPaymentProvider();
    const numbers: string[] = [];

    for (let i = 0; i < 3; i++) {
      const o = await createOrder(db, {
        userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }],
      });
      const { rawBody, signature } = provider.captureFor(o.orderId, 1000);
      const v = provider.verifyWebhook(rawBody, signature);
      if (!v.ok) throw new Error("unreachable");
      const r = await confirmPayment(db, {
        orderId: o.orderId, provider: "stub",
        paymentRef: v.event.paymentRef, amountInr: 1000,
      });
      numbers.push(r.invoiceNo!);
    }

    const seqs = numbers.map((n) => Number(n.split("/")[2]));
    assert.deepEqual(seqs, [1, 2, 3], "GST requires a consecutive series");
    await db.close();
  });
});

describe("§11.8 — duplicate webhook is idempotent", () => {
  test("replaying the same capture credits nobody twice", async () => {
    const db = await freshDb();
    const { a, b, c, d } = await scenario(db);
    const provider = new StubPaymentProvider();

    const order = await createOrder(db, {
      userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }], requestedPointsInr: 100,
    });
    const { rawBody, signature } = provider.captureFor(order.orderId, 900);
    const v = provider.verifyWebhook(rawBody, signature);
    if (!v.ok) throw new Error("unreachable");
    const args = {
      orderId: order.orderId, provider: "stub",
      paymentRef: v.event.paymentRef, amountInr: 900,
    };

    const first = await confirmPayment(db, args);
    assert.equal(first.alreadyProcessed, false);

    // The provider retries. Twice, for good measure.
    const second = await confirmPayment(db, args);
    const third = await confirmPayment(db, args);
    assert.equal(second.alreadyProcessed, true);
    assert.equal(third.alreadyProcessed, true);
    assert.equal(second.ledgerEntries.length, 0);

    assert.equal(await balanceOf(db, d.id), 45, "not double-credited");
    assert.equal(await balanceOf(db, c.id), 22.5);
    assert.equal(await balanceOf(db, b.id), 11.25);
    assert.equal(await balanceOf(db, a.id), 5.625);

    const stock = await db.scalar<number>(
      `select stock_qty from products where slug='cool-bhaiya'`,
    );
    assert.equal(stock, 9, "stock decremented once, not three times");

    const ledgerRows = await db.scalar<string>(
      `select count(*)::text from points_ledger where order_id = $1`, [order.orderId],
    );
    assert.equal(Number(ledgerRows), 5, "1 redeem + 4 earns, exactly once");
    await db.close();
  });

  test("a forged webhook signature is rejected before touching the DB", async () => {
    const db = await freshDb();
    await scenario(db);
    const provider = new StubPaymentProvider();
    const { rawBody } = provider.captureFor("whatever", 900);

    const bad = provider.verifyWebhook(rawBody, "0".repeat(64));
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.reason, "bad_signature");
    await db.close();
  });

  test("a webhook claiming the wrong amount is refused", async () => {
    const db = await freshDb();
    const { d } = await scenario(db);
    const order = await createOrder(db, {
      userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }], requestedPointsInr: 100,
    });
    await assert.rejects(
      () => confirmPayment(db, {
        orderId: order.orderId, provider: "stub", paymentRef: "x", amountInr: 1,
      }),
      (e: Error) => e instanceof OrderError && e.code === "bad_amount",
    );
    assert.equal(await balanceOf(db, d.id), 100, "no ledger movement");
    await db.close();
  });
});

describe("§11.9 — refund clawback", () => {
  test("reverses all four earns, returns the points, restocks", async () => {
    const db = await freshDb();
    const { a, b, c, d } = await scenario(db);
    const provider = new StubPaymentProvider();

    const order = await createOrder(db, {
      userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }], requestedPointsInr: 100,
    });
    const { rawBody, signature } = provider.captureFor(order.orderId, 900);
    const v = provider.verifyWebhook(rawBody, signature);
    if (!v.ok) throw new Error("unreachable");
    await confirmPayment(db, {
      orderId: order.orderId, provider: "stub",
      paymentRef: v.event.paymentRef, amountInr: 900,
    });

    const refund = await refundOrder(db, order.orderId);
    assert.equal(refund.alreadyRefunded, false);

    // D: +100 adjust, -100 redeem, +45 earn, -45 clawback, +100 points returned
    assert.equal(await balanceOf(db, d.id), 100, "D is made whole");
    assert.equal(await balanceOf(db, c.id), 0, "C's L1 earn reversed");
    assert.equal(await balanceOf(db, b.id), 0, "B's L2 earn reversed");
    assert.equal(await balanceOf(db, a.id), 0, "A's L3 earn reversed");

    const stock = await db.scalar<number>(
      `select stock_qty from products where slug='cool-bhaiya'`,
    );
    assert.equal(stock, 10, "restocked");

    const status = await db.scalar<string>(
      `select status from orders where id = $1`, [order.orderId],
    );
    assert.equal(status, "refunded");

    // Append-only: nothing was deleted, the reversals are new rows.
    const rows = await db.scalar<string>(
      `select count(*)::text from points_ledger where order_id = $1`, [order.orderId],
    );
    assert.equal(Number(rows), 10, "5 original + 5 reversing rows, none removed");
    await db.close();
  });

  test("refunding twice is idempotent", async () => {
    const db = await freshDb();
    const { d } = await scenario(db);
    const provider = new StubPaymentProvider();
    const order = await createOrder(db, {
      userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }], requestedPointsInr: 100,
    });
    const { rawBody, signature } = provider.captureFor(order.orderId, 900);
    const v = provider.verifyWebhook(rawBody, signature);
    if (!v.ok) throw new Error("unreachable");
    await confirmPayment(db, {
      orderId: order.orderId, provider: "stub",
      paymentRef: v.event.paymentRef, amountInr: 900,
    });

    await refundOrder(db, order.orderId);
    const again = await refundOrder(db, order.orderId);
    assert.equal(again.alreadyRefunded, true);
    assert.equal(await balanceOf(db, d.id), 100, "not credited twice");

    const stock = await db.scalar<number>(
      `select stock_qty from products where slug='cool-bhaiya'`,
    );
    assert.equal(stock, 10, "not restocked twice");
    await db.close();
  });

  test("balance may go negative after clawback, and is recoverable", async () => {
    // Spec §3.5: the clawback can outrun a spent balance. That's intended.
    const db = await freshDb();
    const { c, d } = await scenario(db);
    const provider = new StubPaymentProvider();

    const order = await createOrder(db, {
      userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }],
    });
    const { rawBody, signature } = provider.captureFor(order.orderId, 1000);
    const v = provider.verifyWebhook(rawBody, signature);
    if (!v.ok) throw new Error("unreachable");
    await confirmPayment(db, {
      orderId: order.orderId, provider: "stub",
      paymentRef: v.event.paymentRef, amountInr: 1000,
    });
    assert.equal(await balanceOf(db, c.id), 25);

    // C spends their referral earnings elsewhere, then D's order is refunded.
    await db.query(
      `insert into points_ledger (user_id, order_id, type, level, amount_inr)
       values ($1, null, 'ADJUST', null, -25)`, [c.id],
    );
    await refundOrder(db, order.orderId);
    assert.equal(await balanceOf(db, c.id), -25, "negative, to be recovered from future earnings");
    await db.close();
  });
});

describe("stock and oversell", () => {
  test("order creation refuses more than available stock", async () => {
    const db = await freshDb();
    const { d } = await scenario(db, 2);
    await assert.rejects(
      () => createOrder(db, { userId: d.id, items: [{ slug: "cool-bhaiya", qty: 3 }] }),
      (e: Error) => e instanceof OrderError && e.code === "insufficient_stock",
    );
    await db.close();
  });

  test("duplicate cart lines are merged before the stock check", async () => {
    const db = await freshDb();
    const { d } = await scenario(db, 2);
    await assert.rejects(
      () => createOrder(db, {
        userId: d.id,
        items: [{ slug: "cool-bhaiya", qty: 2 }, { slug: "cool-bhaiya", qty: 2 }],
      }),
      (e: Error) => e instanceof OrderError && e.code === "insufficient_stock",
    );
    await db.close();
  });

  test("payment on a sold-out design is recorded and flagged, not dropped", async () => {
    // The spec decrements stock at payment time, so two customers can both
    // reach checkout for the last unit. We must not discard a real payment.
    const db = await freshDb();
    const { d } = await scenario(db, 1);
    const provider = new StubPaymentProvider();

    const first = await createOrder(db, { userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }] });
    const second = await createOrder(db, { userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }] });

    for (const o of [first, second]) {
      const { rawBody, signature } = provider.captureFor(o.orderId, 1000);
      const v = provider.verifyWebhook(rawBody, signature);
      if (!v.ok) throw new Error("unreachable");
      await confirmPayment(db, {
        orderId: o.orderId, provider: "stub",
        paymentRef: v.event.paymentRef, amountInr: 1000,
      });
    }

    const stock = await db.scalar<number>(`select stock_qty from products where slug='cool-bhaiya'`);
    assert.equal(stock, 0, "never oversold below zero");

    const held = await db.one<{ fulfilment_hold: boolean; hold_reason: string }>(
      `select fulfilment_hold, hold_reason from orders where id = $1`, [second.orderId],
    );
    assert.equal(held!.fulfilment_hold, true, "second order flagged for admin refund");
    assert.match(held!.hold_reason, /Oversold/);
    await db.close();
  });
});

describe("points double-spend guard (spec gap)", () => {
  test("two open orders cannot both redeem the same balance", async () => {
    // Without available_points(), both orders would redeem ₹100 of a ₹100
    // balance and the customer would end at -₹100 with goods shipped.
    const db = await freshDb();
    const { d } = await scenario(db);

    const first = await createOrder(db, {
      userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }], requestedPointsInr: 100,
    });
    assert.equal(first.pointsRedeemedInr, 100);

    const second = await createOrder(db, {
      userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }], requestedPointsInr: 100,
    });
    assert.equal(second.pointsRedeemedInr, 0, "no points left to commit");
    assert.equal(second.cashDueInr, 1000);
    await db.close();
  });

  test("available points free up if an order never pays", async () => {
    const db = await freshDb();
    const { d } = await scenario(db);
    const o = await createOrder(db, {
      userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }], requestedPointsInr: 100,
    });
    assert.equal(await getAvailablePoints(db, d.id), 0);

    await db.query(`update orders set status='cancelled' where id=$1`, [o.orderId]);
    assert.equal(await getAvailablePoints(db, d.id), 100, "released back");
    await db.close();
  });

  test("points cannot exceed the order value", async () => {
    const db = await freshDb();
    const { d } = await scenario(db);
    await db.query(
      `insert into points_ledger (user_id, order_id, type, level, amount_inr)
       values ($1, null, 'ADJUST', null, 5000)`, [d.id],
    );
    const o = await createOrder(db, {
      userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }], requestedPointsInr: 5000,
    });
    assert.equal(o.pointsRedeemedInr, 1000, "capped at gross");
    assert.equal(o.cashDueInr, 0);
    assert.equal(o.isZeroValue, true, "flagged: must not go to a payment provider");
    await db.close();
  });
});

describe("zero-value orders (REDEMPTION_CAP = none)", () => {
  test("a fully-points order is flagged and the provider refuses it", async () => {
    const db = await freshDb();
    const { d } = await scenario(db);
    await db.query(
      `insert into points_ledger (user_id, order_id, type, level, amount_inr)
       values ($1, null, 'ADJUST', null, 5000)`, [d.id],
    );
    const o = await createOrder(db, {
      userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }], requestedPointsInr: 1000,
    });
    assert.equal(o.isZeroValue, true);

    const provider = new StubPaymentProvider();
    await assert.rejects(
      () => provider.createIntent({ orderId: o.orderId, amountInr: o.cashDueInr }),
      /Zero-value orders are settled internally/,
    );
    await db.close();
  });

  test("settling a zero-value order internally earns no cashback", async () => {
    const db = await freshDb();
    const { a, d } = await scenario(db);
    await db.query(
      `insert into points_ledger (user_id, order_id, type, level, amount_inr)
       values ($1, null, 'ADJUST', null, 5000)`, [d.id],
    );
    const o = await createOrder(db, {
      userId: d.id, items: [{ slug: "cool-bhaiya", qty: 1 }], requestedPointsInr: 1000,
    });

    const r = await confirmPayment(db, {
      orderId: o.orderId, provider: "internal", paymentRef: `internal_zero_${o.orderId}`, amountInr: 0,
    });
    assert.equal(r.alreadyProcessed, false);

    const earns = await db.scalar<string>(
      `select coalesce(sum(amount_inr),0)::text from points_ledger
        where order_id = $1 and type in ('EARN_SELF','EARN_REFERRAL')`,
      [o.orderId],
    );
    assert.equal(Number(earns), 0, "cash base was ₹0 — points cannot print points");
    assert.equal(await balanceOf(db, a.id), 0, "upline earns nothing either");

    const stock = await db.scalar<number>(`select stock_qty from products where slug='cool-bhaiya'`);
    assert.equal(stock, 9, "still fulfilled");
    await db.close();
  });
});
