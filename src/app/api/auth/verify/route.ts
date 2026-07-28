/**
 * POST /api/auth/verify — exchange an OTP for a session.
 *
 * On first successful verification the user is created via
 * signup_with_attribution, so the referral gate is applied exactly once and
 * atomically (spec §3.2, §3.3).
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyOtp, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { promoteFirstUserToAdmin } from "@/lib/localdb";
import { REF_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();
  if (!email || !code) {
    return NextResponse.json(
      { ok: false, error: "Email and code are both required." },
      { status: 400 },
    );
  }

  const ref =
    req.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${REF_COOKIE}=`))
      ?.split("=")[1] ?? null;

  const db = await getDb();
  const result = await verifyOtp(db, email, code, ref);

  // Local mode only: the first account becomes an admin, so /admin is reachable
  // without hand-editing the database. No-op in production.
  if (result.ok) await promoteFirstUserToAdmin(db);

  if (!result.ok) {
    const status = result.error === "too_many_attempts" ? 429 : 400;
    const message =
      result.error === "expired"
        ? "That code has expired. Request a new one."
        : result.error === "too_many_attempts"
          ? "Too many incorrect attempts. Request a new code."
          : "That code isn't right.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  const res = NextResponse.json({ ok: true, isNewUser: result.isNewUser });
  res.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions);
  // Attribution is now permanent on the user row; the cookie has done its job.
  res.cookies.set(REF_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
