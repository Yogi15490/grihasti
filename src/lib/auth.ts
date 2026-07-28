/**
 * Grihasti — email-OTP auth. No vendor auth service (see 0003_auth.sql for why).
 *
 * Design notes that matter:
 *  - Codes and session tokens are stored as SHA-256 hashes. A DB leak must not
 *    hand anyone a set of live credentials.
 *  - Code comparison is constant-time.
 *  - Requesting a code NEVER reveals whether the address is registered.
 *  - Attempts are capped per code and requests are rate-limited per address.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Queryable } from "./db";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RATE_LIMIT = 5; // per address per window
export const OTP_RATE_WINDOW_MINUTES = 15;
export const SESSION_TTL_DAYS = 30;
export const SESSION_COOKIE = "grihasti_session";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** 6 digits, uniform, from a CSPRNG. `Math.random()` is not acceptable here. */
export function generateOtp(): string {
  // Rejection-sample to avoid the modulo bias that would make some codes
  // slightly likelier than others.
  while (true) {
    const n = randomBytes(4).readUInt32BE(0);
    if (n < 4_294_000_000) return String(n % 1_000_000).padStart(6, "0");
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export type OtpRequestResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; error: "rate_limited" };

/**
 * Issue an OTP. Returns the plaintext code for the caller to email —
 * it is never persisted and cannot be recovered afterwards.
 */
export async function requestOtp(
  db: Queryable,
  email: string,
  refCode?: string | null,
): Promise<OtpRequestResult> {
  const normalized = email.trim().toLowerCase();

  const { rows } = await db.query<{ n: string }>(
    `select count(*)::text as n from otp_codes
      where lower(email) = $1
        and created_at > now() - ($2 || ' minutes')::interval`,
    [normalized, String(OTP_RATE_WINDOW_MINUTES)],
  );
  if (Number(rows[0]?.n ?? 0) >= OTP_RATE_LIMIT) {
    return { ok: false, error: "rate_limited" };
  }

  const code = generateOtp();
  const { rows: inserted } = await db.query<{ expires_at: Date }>(
    `insert into otp_codes (email, code_hash, expires_at, ref_code)
     values ($1, $2, now() + ($3 || ' minutes')::interval, $4)
     returning expires_at`,
    [normalized, sha256(code), String(OTP_TTL_MINUTES), refCode ?? null],
  );

  return { ok: true, code, expiresAt: inserted[0].expires_at };
}

export type VerifyResult =
  | { ok: true; userId: string; token: string; isNewUser: boolean }
  | { ok: false; error: "invalid" | "expired" | "too_many_attempts" };

/**
 * Verify a code and open a session. Creates the user on first successful
 * verification, routing through signup_with_attribution so the referral gate
 * is applied exactly once, atomically (spec §3.2).
 *
 * `refCode` falls back to whatever was captured when the code was requested,
 * so attribution survives a lost cookie.
 */
export async function verifyOtp(
  db: Queryable,
  email: string,
  code: string,
  refCode?: string | null,
): Promise<VerifyResult> {
  const normalized = email.trim().toLowerCase();

  // Consider EVERY outstanding code for this address, not just the newest.
  //
  // Two reasons. First, `order by created_at desc limit 1` is non-deterministic
  // when two requests land in the same timestamp tick — the wrong row gets
  // picked and a valid code is rejected, which is a login failure the user
  // cannot diagnose. Second, people routinely open the older email after
  // clicking "resend"; any code that is still live should work.
  const { rows } = await db.query<{
    id: string;
    code_hash: string;
    attempts: number;
    ref_code: string | null;
    expired: boolean;
  }>(
    `select id, code_hash, attempts, ref_code, (expires_at < now()) as expired
       from otp_codes
      where lower(email) = $1 and consumed_at is null
      order by created_at desc, id desc
      limit 10`,
    [normalized],
  );

  if (rows.length === 0) return { ok: false, error: "invalid" };

  // Attempts are counted per address, not per code — otherwise requesting a
  // fresh code would reset the brute-force budget.
  const totalAttempts = rows.reduce((n, r) => n + r.attempts, 0);
  if (totalAttempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "too_many_attempts" };
  }

  const supplied = sha256(code.trim());
  const match = rows.find((r) => constantTimeEqual(r.code_hash, supplied));

  if (!match) {
    // Charge the attempt against the newest outstanding code.
    await db.query(`update otp_codes set attempts = attempts + 1 where id = $1`, [
      rows[0].id,
    ]);
    return { ok: false, error: "invalid" };
  }

  // The code is right but past its window. Distinguish this from "wrong code"
  // so the UI can say "request a new one" rather than "that isn't right".
  if (match.expired) return { ok: false, error: "expired" };

  const row = match;

  // Single-use: burn the code before it can be replayed.
  await db.query(`update otp_codes set consumed_at = now() where id = $1`, [row.id]);

  const { rows: existing } = await db.query<{ id: string }>(
    `select id from users where lower(email) = $1`,
    [normalized],
  );

  let userId: string;
  let isNewUser = false;

  if (existing[0]) {
    userId = existing[0].id;
  } else {
    const effectiveRef = refCode ?? row.ref_code ?? null;
    const { rows: created } = await db.query<{ signup_with_attribution: string }>(
      `select signup_with_attribution($1, null, null, $2)`,
      [normalized, effectiveRef],
    );
    userId = created[0].signup_with_attribution;
    isNewUser = true;
  }

  const token = generateSessionToken();
  await db.query(
    `insert into sessions (token_hash, user_id, expires_at)
     values ($1, $2, now() + ($3 || ' days')::interval)`,
    [sha256(token), userId, String(SESSION_TTL_DAYS)],
  );

  return { ok: true, userId, token, isNewUser };
}

/** Resolve a session token to a user, or null. Refreshes last_seen_at. */
export async function getSessionUser(
  db: Queryable,
  token: string | undefined | null,
): Promise<{ userId: string; email: string; inviteCode: string } | null> {
  if (!token) return null;

  const { rows } = await db.query<{
    user_id: string;
    email: string;
    invite_code: string;
  }>(
    `update sessions s
        set last_seen_at = now()
       from users u
      where s.token_hash = $1
        and s.expires_at > now()
        and u.id = s.user_id
      returning s.user_id, u.email, u.invite_code`,
    [sha256(token)],
  );

  const row = rows[0];
  return row
    ? { userId: row.user_id, email: row.email, inviteCode: row.invite_code }
    : null;
}

export async function destroySession(db: Queryable, token: string): Promise<void> {
  await db.query(`delete from sessions where token_hash = $1`, [sha256(token)]);
}

/** Cookie options for the session token. */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
};
