/**
 * Grihasti — capture ?ref= into a cookie before signup (spec §3.2).
 *
 * Attribution is first-touch, so the FIRST referral code a visitor arrives with
 * wins and later ones must not overwrite it. Someone who clicks Priya's link,
 * browses for a week, then arrives via Amit's link is still Priya's referral —
 * she did the work of bringing them in.
 */

import { NextResponse, type NextRequest } from "next/server";

const REF_COOKIE = "grihasti_ref";
const MAX_AGE = 90 * 24 * 60 * 60; // survives a waitlist-to-launch gap

export function middleware(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref");
  const res = NextResponse.next();

  if (ref && !req.cookies.get(REF_COOKIE)) {
    // Codes are 7 chars from a fixed alphabet; anything else is noise or an
    // injection attempt and is not worth storing.
    const clean = ref.trim().toUpperCase();
    if (/^[A-HJ-NP-Z2-9]{7}$/.test(clean)) {
      res.cookies.set(REF_COOKIE, clean, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: MAX_AGE,
      });
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
