/**
 * POST /api/auth/logout — destroy the session server-side, not just the cookie.
 * Clearing the cookie alone would leave a valid token in the sessions table.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const token = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];

  if (token) {
    await destroySession(await getDb(), token);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
