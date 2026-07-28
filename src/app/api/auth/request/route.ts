/**
 * POST /api/auth/request — issue an email OTP.
 *
 * Always responds 200 with the same body, whether or not the address is
 * registered. Distinguishing them turns this endpoint into a free tool for
 * discovering who has an account.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isLocalMode } from "@/lib/localdb";
import { requestOtp, OTP_TTL_MINUTES } from "@/lib/auth";
import { sendMail, otpEmail } from "@/lib/email";
import { REF_COOKIE } from "@/lib/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const ref = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${REF_COOKIE}=`))
    ?.split("=")[1];

  const issued = await requestOtp(await getDb(), email, ref ?? null);

  if (!issued.ok) {
    // Rate limited. Say so plainly — this leaks nothing about the account.
    return NextResponse.json(
      { ok: false, error: "Too many codes requested. Please wait a few minutes." },
      { status: 429 },
    );
  }

  // No email provider configured locally, so the code goes nowhere. Return it
  // to the UI instead — otherwise nobody can sign in without a Resend account,
  // which defeats the point of a zero-setup dev mode. Never in production:
  // isLocalMode() is hard-false there.
  const localBypass = isLocalMode();

  if (!localBypass) {
    const sent = await sendMail({ to: email, ...otpEmail(issued.code, OTP_TTL_MINUTES) });
    if (!sent.ok) {
      console.error("[auth/request] email send failed:", sent.error);
      return NextResponse.json(
        { ok: false, error: "Couldn't send the code. Please try again shortly." },
        { status: 502 },
      );
    }
  } else {
    console.log(`\n  ✉  Sign-in code for ${email}: ${issued.code}\n`);
  }

  return NextResponse.json({
    ok: true,
    message: "If that address is valid, a code is on its way.",
    ...(localBypass ? { devCode: issued.code } : {}),
  });
}
