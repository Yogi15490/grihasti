/**
 * Integration tests — signup attribution, the 5-invite gate, upline resolution
 * and ledger idempotency, against real Postgres.
 *
 * Covers acceptance-test steps 1, 2, 3, 8 (partial) and 10 from spec §11.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { freshDb, signup, balanceOf, type TestDb } from "./helpers/testdb.ts";

describe("§11.1 — organic signup", () => {
  test("gets an invite code and 5 invites", async () => {
    const db = await freshDb();
    const a = await signup(db, "a@example.com");

    const row = await db.one<{ inviter_id: string | null; invites_remaining: number; invite_code: string }>(
      `select inviter_id, invites_remaining, invite_code from users where id = $1`,
      [a.id],
    );

    assert.equal(row!.inviter_id, null, "organic signup has no inviter");
    assert.equal(row!.invites_remaining, 5);
    assert.match(row!.invite_code, /^[A-HJ-NP-Z2-9]{7}$/, "code avoids I/O/0/1");
    await db.close();
  });

  test("invite codes are unique across many signups", async () => {
    const db = await freshDb();
    for (let i = 0; i < 60; i++) await signup(db, `u${i}@example.com`);
    const n = await db.scalar<string>(
      `select count(distinct invite_code)::text from users`,
    );
    assert.equal(Number(n), 60);
    await db.close();
  });
});

describe("§11.2 — referred signup", () => {
  test("sets inviter, decrements the gate, logs the event", async () => {
    const db = await freshDb();
    const a = await signup(db, "a@example.com");
    const b = await signup(db, "b@example.com", a.code);

    const bRow = await db.one<{ inviter_id: string }>(
      `select inviter_id from users where id = $1`, [b.id],
    );
    assert.equal(bRow!.inviter_id, a.id, "B.inviter_id = A");

    const remaining = await db.scalar<number>(
      `select invites_remaining from users where id = $1`, [a.id],
    );
    assert.equal(remaining, 4, "A.invites_remaining = 4");

    const events = await db.scalar<string>(
      `select count(*)::text from referral_events where inviter_id = $1 and invitee_id = $2`,
      [a.id, b.id],
    );
    assert.equal(Number(events), 1, "referral_events row exists");
    await db.close();
  });

  test("invite code is case- and whitespace-insensitive", async () => {
    // People retype these from screenshots and WhatsApp forwards.
    const db = await freshDb();
    const a = await signup(db, "a@example.com");
    const b = await signup(db, "b@example.com", `  ${a.code.toLowerCase()} `);

    const inviter = await db.scalar<string>(
      `select inviter_id from users where id = $1`, [b.id],
    );
    assert.equal(inviter, a.id);
    await db.close();
  });

  test("unknown code falls through to organic, does not error", async () => {
    const db = await freshDb();
    const b = await signup(db, "b@example.com", "NOTACODE");
    const inviter = await db.scalar<string | null>(
      `select inviter_id from users where id = $1`, [b.id],
    );
    assert.equal(inviter, null);
    await db.close();
  });

  test("attribution is immutable once set (trg_lock_inviter)", async () => {
    const db = await freshDb();
    const a = await signup(db, "a@example.com");
    const c = await signup(db, "c@example.com");
    const b = await signup(db, "b@example.com", a.code);

    await assert.rejects(
      () => db.query(`update users set inviter_id = $1 where id = $2`, [c.id, b.id]),
      /immutable/i,
      "first-touch attribution must not be rewritable",
    );
    await db.close();
  });
});

describe("§11.3 — chain A->B->C->D and upline resolution", () => {
  async function chain(db: TestDb) {
    const a = await signup(db, "a@example.com");
    const b = await signup(db, "b@example.com", a.code);
    const c = await signup(db, "c@example.com", b.code);
    const d = await signup(db, "d@example.com", c.code);
    return { a, b, c, d };
  }

  test("get_upline returns C, B, A in order for D", async () => {
    const db = await freshDb();
    const { a, b, c, d } = await chain(db);

    const { rows } = await db.query<{ level: number; user_id: string }>(
      `select level, user_id from get_upline($1, 3) order by level`, [d.id],
    );
    assert.deepEqual(
      rows.map((r) => [r.level, r.user_id]),
      [[1, c.id], [2, b.id], [3, a.id]],
    );
    await db.close();
  });

  test("upline is capped at 3 even in a deeper chain", async () => {
    const db = await freshDb();
    const { d } = await chain(db);
    const e = await signup(db, "e@example.com",
      await db.scalar<string>(`select invite_code from users where id = $1`, [d.id]));
    const f = await signup(db, "f@example.com",
      await db.scalar<string>(`select invite_code from users where id = $1`, [e.id]));

    const n = await db.scalar<string>(
      `select count(*)::text from get_upline($1, 3)`, [f.id],
    );
    assert.equal(Number(n), 3, "never pays beyond L3");
    await db.close();
  });

  test("upline of an organic user is empty", async () => {
    const db = await freshDb();
    const a = await signup(db, "a@example.com");
    const n = await db.scalar<string>(`select count(*)::text from get_upline($1, 3)`, [a.id]);
    assert.equal(Number(n), 0);
    await db.close();
  });
});

describe("§11.10 — the 5-invite gate", () => {
  test("6th invitee is refused the referral but still joins organically", async () => {
    const db = await freshDb();
    const a = await signup(db, "a@example.com");

    for (let i = 1; i <= 5; i++) await signup(db, `inv${i}@example.com`, a.code);

    const remaining = await db.scalar<number>(
      `select invites_remaining from users where id = $1`, [a.id],
    );
    assert.equal(remaining, 0, "circle is full");

    const sixth = await signup(db, "sixth@example.com", a.code);
    const inviter = await db.scalar<string | null>(
      `select inviter_id from users where id = $1`, [sixth.id],
    );
    assert.equal(inviter, null, "6th joins organically, not attributed to A");

    const stillZero = await db.scalar<number>(
      `select invites_remaining from users where id = $1`, [a.id],
    );
    assert.equal(stillZero, 0, "gate never goes negative");

    const events = await db.scalar<string>(
      `select count(*)::text from referral_events where inviter_id = $1`, [a.id],
    );
    assert.equal(Number(events), 5, "exactly 5 referral events, never 6");
    await db.close();
  });

  test("the sixth user still gets a working link of their own", async () => {
    // A full circle must not be a dead end — that would stall growth (§14).
    const db = await freshDb();
    const a = await signup(db, "a@example.com");
    for (let i = 1; i <= 5; i++) await signup(db, `inv${i}@example.com`, a.code);

    const sixth = await signup(db, "sixth@example.com", a.code);
    const seventh = await signup(db, "seventh@example.com", sixth.code);

    const inviter = await db.scalar<string>(
      `select inviter_id from users where id = $1`, [seventh.id],
    );
    assert.equal(inviter, sixth.id);
    await db.close();
  });

  test("gate cannot be driven below zero by the DB check constraint", async () => {
    const db = await freshDb();
    const a = await signup(db, "a@example.com");
    await db.query(`update users set invites_remaining = 0 where id = $1`, [a.id]);
    await assert.rejects(
      () => db.query(`update users set invites_remaining = -1 where id = $1`, [a.id]),
      /invites_remaining/,
    );
    await db.close();
  });
});

describe("§11.8 — ledger idempotency (the NULL hole)", () => {
  async function orderFixture(db: TestDb) {
    const d = await signup(db, "d@example.com");
    const p = await db.scalar<string>(
      `insert into products (slug, name, type, price_inr, stock_qty)
       values ('cool-bhaiya','The Cool Bhaiya','caricature',900,10) returning id`,
    );
    const o = await db.scalar<string>(
      `insert into orders (user_id, status, gross_total_inr, points_redeemed_inr, cash_paid_inr)
       values ($1,'paid',1000,100,900) returning id`, [d.id],
    );
    return { userId: d.id, orderId: o, productId: p };
  }

  test("duplicate EARN_SELF is rejected", async () => {
    const db = await freshDb();
    const { userId, orderId } = await orderFixture(db);
    const ins = `insert into points_ledger (user_id, order_id, type, level, amount_inr)
                 values ($1,$2,'EARN_SELF',0,45)`;
    await db.query(ins, [userId, orderId]);
    await assert.rejects(() => db.query(ins, [userId, orderId]), /duplicate key/i);
    await db.close();
  });

  test("duplicate REDEEM (level IS NULL) is rejected — this is the spec §6 bug", async () => {
    // With the spec's plain `unique (...)`, Postgres treats NULL levels as
    // distinct and this second insert would SUCCEED, double-debiting the
    // customer's points on a replayed webhook.
    const db = await freshDb();
    const { userId, orderId } = await orderFixture(db);
    const ins = `insert into points_ledger (user_id, order_id, type, level, amount_inr)
                 values ($1,$2,'REDEEM',null,-100)`;
    await db.query(ins, [userId, orderId]);
    await assert.rejects(() => db.query(ins, [userId, orderId]), /duplicate key/i);

    assert.equal(await balanceOf(db, userId), -100, "debited exactly once");
    await db.close();
  });

  test("duplicate points-return CLAWBACK (level IS NULL) is rejected", async () => {
    const db = await freshDb();
    const { userId, orderId } = await orderFixture(db);
    const ins = `insert into points_ledger (user_id, order_id, type, level, amount_inr)
                 values ($1,$2,'CLAWBACK',null,100)`;
    await db.query(ins, [userId, orderId]);
    await assert.rejects(() => db.query(ins, [userId, orderId]), /duplicate key/i);
    await db.close();
  });

  test("the guard does not block repeated off-order ADJUST rows", async () => {
    // The index is partial on order_id for exactly this reason: support must
    // be able to correct a balance more than once in a user's lifetime.
    const db = await freshDb();
    const a = await signup(db, "a@example.com");
    const ins = `insert into points_ledger (user_id, order_id, type, level, amount_inr)
                 values ($1, null, 'ADJUST', null, $2)`;
    await db.query(ins, [a.id, 100]);
    await db.query(ins, [a.id, -30]);
    await db.query(ins, [a.id, 5]);
    assert.equal(await balanceOf(db, a.id), 75, "three corrections all applied");
    await db.close();
  });

  test("distinct levels for the same order/user/type still coexist", async () => {
    const db = await freshDb();
    const { userId, orderId } = await orderFixture(db);
    // A user can legitimately hold EARN_REFERRAL at two levels only in a cycle,
    // which attribution forbids — but the constraint must not over-block.
    await db.query(
      `insert into points_ledger (user_id, order_id, type, level, amount_inr)
       values ($1,$2,'EARN_REFERRAL',1,22.5), ($1,$2,'EARN_REFERRAL',2,11.25)`,
      [userId, orderId],
    );
    assert.equal(await balanceOf(db, userId), 33.75);
    await db.close();
  });
});

describe("ledger precision (§3.6)", () => {
  test("stores ₹5.625 without rounding to 5.63", async () => {
    // numeric(10,2) from spec §6 would silently corrupt the L3 figure and make
    // the acceptance test unpassable. Schema uses numeric(12,4).
    const db = await freshDb();
    const a = await signup(db, "a@example.com");
    const o = await db.scalar<string>(
      `insert into orders (user_id, gross_total_inr, cash_paid_inr)
       values ($1,1000,900) returning id`, [a.id],
    );
    await db.query(
      `insert into points_ledger (user_id, order_id, type, level, amount_inr)
       values ($1,$2,'EARN_REFERRAL',3,5.625)`, [a.id, o],
    );
    assert.equal(await balanceOf(db, a.id), 5.625);
    await db.close();
  });
});
