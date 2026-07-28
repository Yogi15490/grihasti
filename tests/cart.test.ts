import { test } from "node:test";
import assert from "node:assert/strict";
import {
  subtotal,
  applyPoints,
  gstSplit,
  orderSummary,
  type CartLine,
} from "../src/lib/cart.ts";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  slug: "cool-bhaiya",
  name: "The Cool Bhaiya",
  unitPriceInr: 900,
  qty: 1,
  ...over,
});

test("subtotal sums line totals", () => {
  assert.equal(subtotal([line(), line({ qty: 2, unitPriceInr: 850 })]), 900 + 1700);
});

test("applyPoints caps at balance and subtotal, no program cap", () => {
  assert.deepEqual(applyPoints(900, 100, 500), { pointsRedeemed: 100, cashDue: 800 });
  assert.deepEqual(applyPoints(900, 1000, 500), { pointsRedeemed: 500, cashDue: 400 }); // capped by balance
  assert.deepEqual(applyPoints(900, 5000, 9999), { pointsRedeemed: 900, cashDue: 0 }); // capped by subtotal
  assert.deepEqual(applyPoints(900, -5, 500), { pointsRedeemed: 0, cashDue: 900 });
});

test("gstSplit backs out 12% from an inclusive ₹900", () => {
  const { net, gst } = gstSplit(900, 0.12);
  assert.equal(net, 803.57);
  assert.equal(gst, 96.43);
  assert.equal(net + gst, 900);
});

test("orderSummary ties it together (₹900 order, ₹100 points)", () => {
  const s = orderSummary([line()], 100, 500);
  assert.equal(s.subtotalInr, 900);
  assert.equal(s.pointsRedeemed, 100);
  assert.equal(s.cashDueInr, 800); // this is the cashback base downstream
  assert.equal(s.netInr + s.gstInr, 900);
});

test("gstSplit at the 18% default (spec §3.1 12% slab was collapsed in 2025)", () => {
  const { net, gst } = gstSplit(900, 0.18);
  assert.equal(net, 762.71);
  assert.equal(gst, 137.29);
  assert.equal(net + gst, 900);
});

test("100% points redemption leaves ₹0 cash due — Razorpay cannot take this", () => {
  // REDEMPTION_CAP = none (§3.1) makes this reachable. The checkout flow needs
  // an explicit zero-payment branch; it must not be handed to Razorpay.
  const s = orderSummary([line()], 900, 5000);
  assert.equal(s.pointsRedeemed, 900);
  assert.equal(s.cashDueInr, 0);
});

test("a fully-points order accrues zero cashback (points cannot print points)", () => {
  const s = orderSummary([line()], 900, 5000);
  assert.equal(s.cashDueInr * 0.05, 0);
});
