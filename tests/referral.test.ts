import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePayout,
  computeClawback,
  balance,
  redeemable,
  RATES,
  type LedgerEntry,
} from "../src/lib/referral.ts";

test("RATES follow the halving series", () => {
  assert.deepEqual(RATES, [0.05, 0.025, 0.0125, 0.00625]);
});

test("spec §3.6 worked example — ₹1000 paid ₹900 cash + ₹100 points", () => {
  const entries = computePayout({
    buyerId: "D",
    orderId: "o1",
    grossTotalInr: 1000,
    cashPaidInr: 900, // base is cash-paid only
    upline: ["C", "B", "A"],
  });
  const by = (u: string) => entries.find((e) => e.userId === u)!.amountInr;
  assert.equal(by("D"), 45); // 5% of 900
  assert.equal(by("C"), 22.5); // 2.5%
  assert.equal(by("B"), 11.25); // 1.25%
  assert.equal(by("A"), 5.625); // 0.625%
  // upline total = 39.375, grand total on cash base = 84.375
  assert.equal(balance(entries), 84.375);
});

test("full-cash ₹1000 order pays 50/25/12.5/6.25", () => {
  const e = computePayout({
    buyerId: "D",
    orderId: "o2",
    grossTotalInr: 1000,
    cashPaidInr: 1000,
    upline: ["C", "B", "A"],
  });
  assert.deepEqual(
    e.map((x) => x.amountInr),
    [50, 25, 12.5, 6.25],
  );
});

test("short chain pays only existing levels", () => {
  const e = computePayout({
    buyerId: "B",
    orderId: "o3",
    grossTotalInr: 1000,
    cashPaidInr: 1000,
    upline: ["A"], // only one ancestor
  });
  assert.equal(e.length, 2); // buyer + L1
  assert.deepEqual(e.map((x) => x.amountInr), [50, 25]);
});

test("upline capped at 3 even if chain is deeper", () => {
  const e = computePayout({
    buyerId: "E",
    orderId: "o4",
    grossTotalInr: 1000,
    cashPaidInr: 1000,
    upline: ["D", "C", "B", "A"], // 4 ancestors
  });
  assert.equal(e.length, 4); // buyer + 3 only
  assert.ok(!e.some((x) => x.userId === "A")); // A (4 up) not paid
});

test("clawback reverses earns and returns redeemed points", () => {
  const earns = computePayout({
    buyerId: "D",
    orderId: "o1",
    grossTotalInr: 1000,
    cashPaidInr: 900,
    upline: ["C", "B", "A"],
  });
  const cb = computeClawback("D", "o1", earns, 100);
  // net of earns + clawbacks for the earn portion = 0
  const earnNet = balance([...earns, ...cb.filter((c) => c.level !== null)]);
  assert.equal(earnNet, 0);
  // buyer also gets their 100 points back
  const pointsReturn = cb.find((c) => c.level === null)!;
  assert.equal(pointsReturn.amountInr, 100);
});

test("redeemable respects balance, no cap", () => {
  assert.equal(redeemable(500, 200), 200); // capped by balance
  assert.equal(redeemable(1000, 5000), 1000); // no program cap
  assert.equal(redeemable(-5, 100), 0);
});

test("bounded total payout ≈ 9.375% of base", () => {
  const e = computePayout({
    buyerId: "X",
    orderId: "o5",
    grossTotalInr: 1000,
    cashPaidInr: 1000,
    upline: ["a", "b", "c"],
  });
  assert.equal(balance(e) / 1000, 0.09375);
});
