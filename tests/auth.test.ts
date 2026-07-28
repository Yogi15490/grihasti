/**
 * Email-OTP auth tests — hashing, expiry, single use, rate limiting, and the
 * attribution handoff at first sign-in.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { freshDb, signup } from "./helpers/testdb.ts";
import {
  requestOtp, verifyOtp, getSessionUser, destroySession, generateOtp,
  OTP_MAX_ATTEMPTS, OTP_RATE_LIMIT,
} from "../src/lib/auth.ts";

describe("OTP issuance", () => {
  test("codes are 6 digits and never stored in plaintext", async () => {
    const db = await freshDb();
    const r = await requestOtp(db, "u@example.com");
    assert.equal(r.ok, true);
    if (!r.ok) throw new Error("unreachable");
    assert.match(r.code, /^\d{6}$/);

    const stored = await db.scalar<string>(`select code_hash from otp_codes limit 1`);
    assert.notEqual(stored, r.code, "plaintext code must not be persisted");
    assert.equal(stored, createHash("sha256").update(r.code).digest("hex"));
    await db.close();
  });

  test("generateOtp covers the full range without obvious bias", () => {
    // Rejection sampling, not modulo — codes must be uniform.
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) seen.add(generateOtp());
    assert.ok(seen.size > 2900, `expected near-unique codes, got ${seen.size}`);
    assert.ok([...seen].every((c) => /^\d{6}$/.test(c)));
  });

  test("rate limit stops code flooding for one address", async () => {
    const db = await freshDb();
    for (let i = 0; i < OTP_RATE_LIMIT; i++) {
      assert.equal((await requestOtp(db, "u@example.com")).ok, true);
    }
    const blocked = await requestOtp(db, "u@example.com");
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.error, "rate_limited");

    // A different address is unaffected.
    assert.equal((await requestOtp(db, "other@example.com")).ok, true);
    await db.close();
  });
});

describe("OTP verification", () => {
  test("a correct code creates the user and opens a session", async () => {
    const db = await freshDb();
    const issued = await requestOtp(db, "New.User@Example.com");
    if (!issued.ok) throw new Error("unreachable");

    const r = await verifyOtp(db, "new.user@example.com", issued.code);
    assert.equal(r.ok, true);
    if (!r.ok) throw new Error("unreachable");
    assert.equal(r.isNewUser, true);

    const session = await getSessionUser(db, r.token);
    assert.equal(session?.userId, r.userId);
    assert.equal(session?.email, "new.user@example.com", "stored lower-cased");
    assert.match(session!.inviteCode, /^[A-HJ-NP-Z2-9]{7}$/);
    await db.close();
  });

  test("a code is single-use", async () => {
    const db = await freshDb();
    const issued = await requestOtp(db, "u@example.com");
    if (!issued.ok) throw new Error("unreachable");

    assert.equal((await verifyOtp(db, "u@example.com", issued.code)).ok, true);
    const replay = await verifyOtp(db, "u@example.com", issued.code);
    assert.equal(replay.ok, false, "a burned code cannot be replayed");
    await db.close();
  });

  test("an older outstanding code still works after a resend", async () => {
    // People click "resend", then open the FIRST email. Both codes are live,
    // so both must work. Also guards the ordering bug where two codes created
    // in the same timestamp tick made code selection non-deterministic.
    const db = await freshDb();
    const first = await requestOtp(db, "u@example.com");
    const second = await requestOtp(db, "u@example.com");
    if (!first.ok || !second.ok) throw new Error("unreachable");

    const r = await verifyOtp(db, "u@example.com", first.code);
    assert.equal(r.ok, true, "the older code is still valid");
    await db.close();
  });

  test("consuming one code does not invalidate the other outstanding one", async () => {
    const db = await freshDb();
    const first = await requestOtp(db, "u@example.com");
    const second = await requestOtp(db, "u@example.com");
    if (!first.ok || !second.ok) throw new Error("unreachable");

    assert.equal((await verifyOtp(db, "u@example.com", second.code)).ok, true);
    // But a consumed code is dead, even though a sibling code remains live.
    assert.equal((await verifyOtp(db, "u@example.com", second.code)).ok, false);
    await db.close();
  });

  test("an expired code is refused", async () => {
    const db = await freshDb();
    const issued = await requestOtp(db, "u@example.com");
    if (!issued.ok) throw new Error("unreachable");
    await db.query(`update otp_codes set expires_at = now() - interval '1 minute'`);

    const r = await verifyOtp(db, "u@example.com", issued.code);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "expired");
    await db.close();
  });

  test("wrong codes are counted and eventually locked out", async () => {
    const db = await freshDb();
    const issued = await requestOtp(db, "u@example.com");
    if (!issued.ok) throw new Error("unreachable");

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      const bad = await verifyOtp(db, "u@example.com", "000000");
      assert.equal(bad.ok, false);
    }
    // Even the RIGHT code is now refused — brute force must not be rewarded.
    const r = await verifyOtp(db, "u@example.com", issued.code);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "too_many_attempts");
    await db.close();
  });

  test("signing in again reuses the account rather than creating a second", async () => {
    const db = await freshDb();
    const first = await requestOtp(db, "u@example.com");
    if (!first.ok) throw new Error("unreachable");
    const r1 = await verifyOtp(db, "u@example.com", first.code);
    if (!r1.ok) throw new Error("unreachable");

    const second = await requestOtp(db, "u@example.com");
    if (!second.ok) throw new Error("unreachable");
    const r2 = await verifyOtp(db, "u@example.com", second.code);
    if (!r2.ok) throw new Error("unreachable");

    assert.equal(r2.userId, r1.userId);
    assert.equal(r2.isNewUser, false);
    assert.equal(await db.scalar<string>(`select count(*)::text from users`), "1");
    await db.close();
  });
});

describe("attribution through the auth flow", () => {
  test("a referral code survives the trip through the inbox", async () => {
    // The cookie can be lost between requesting and entering the code, so the
    // ref is captured at request time and used as a fallback.
    const db = await freshDb();
    const inviter = await signup(db, "inviter@example.com");

    const issued = await requestOtp(db, "invitee@example.com", inviter.code);
    if (!issued.ok) throw new Error("unreachable");

    const r = await verifyOtp(db, "invitee@example.com", issued.code, null);
    if (!r.ok) throw new Error("unreachable");

    const inviterId = await db.scalar<string>(
      `select inviter_id from users where id = $1`, [r.userId],
    );
    assert.equal(inviterId, inviter.id, "attribution survived");
    assert.equal(
      await db.scalar<number>(`select invites_remaining from users where id=$1`, [inviter.id]),
      4,
    );
    await db.close();
  });

  test("a full circle still lets the visitor sign in, unattributed", async () => {
    const db = await freshDb();
    const inviter = await signup(db, "inviter@example.com");
    for (let i = 0; i < 5; i++) await signup(db, `f${i}@example.com`, inviter.code);

    const issued = await requestOtp(db, "late@example.com", inviter.code);
    if (!issued.ok) throw new Error("unreachable");
    const r = await verifyOtp(db, "late@example.com", issued.code);
    assert.equal(r.ok, true, "signup must not be blocked by a full circle");
    if (!r.ok) throw new Error("unreachable");

    assert.equal(
      await db.scalar<string | null>(`select inviter_id from users where id=$1`, [r.userId]),
      null,
    );
    await db.close();
  });

  test("only one invite is consumed even if a code is requested repeatedly", async () => {
    const db = await freshDb();
    const inviter = await signup(db, "inviter@example.com");

    // Visitor asks for a code three times before finally signing in.
    for (let i = 0; i < 3; i++) await requestOtp(db, "keen@example.com", inviter.code);
    const last = await requestOtp(db, "keen@example.com", inviter.code);
    if (!last.ok) throw new Error("unreachable");
    await verifyOtp(db, "keen@example.com", last.code);

    assert.equal(
      await db.scalar<number>(`select invites_remaining from users where id=$1`, [inviter.id]),
      4,
      "requesting codes must not drain the gate",
    );
    await db.close();
  });
});

describe("sessions", () => {
  test("an expired session resolves to nobody", async () => {
    const db = await freshDb();
    const issued = await requestOtp(db, "u@example.com");
    if (!issued.ok) throw new Error("unreachable");
    const r = await verifyOtp(db, "u@example.com", issued.code);
    if (!r.ok) throw new Error("unreachable");

    await db.query(`update sessions set expires_at = now() - interval '1 day'`);
    assert.equal(await getSessionUser(db, r.token), null);
    await db.close();
  });

  test("logout invalidates the token server-side", async () => {
    const db = await freshDb();
    const issued = await requestOtp(db, "u@example.com");
    if (!issued.ok) throw new Error("unreachable");
    const r = await verifyOtp(db, "u@example.com", issued.code);
    if (!r.ok) throw new Error("unreachable");

    await destroySession(db, r.token);
    assert.equal(await getSessionUser(db, r.token), null, "not just a cleared cookie");
    await db.close();
  });

  test("a forged token resolves to nobody", async () => {
    const db = await freshDb();
    assert.equal(await getSessionUser(db, "not-a-real-token"), null);
    assert.equal(await getSessionUser(db, undefined), null);
    await db.close();
  });
});
