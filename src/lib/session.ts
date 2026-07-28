/**
 * Grihasti — server-side session access for App Router pages and actions.
 *
 * Authorization lives here and in app code, NOT in row-level security: the
 * client never talks to Postgres directly (see db.ts). Every page that renders
 * user data must call requireUser(), and every admin page requireAdmin().
 */

import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE } from "./auth.ts";
import { getDb } from "./db.ts";

export interface SessionUser {
  userId: string;
  email: string;
  inviteCode: string;
}

/** Current user, or null. Safe to call on public pages. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(await getDb(), token);
}

/** Current user, or throw. Use on any page rendering personal data. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/** Current user, or throw unless they are an admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  const db = await getDb();
  const { rows } = await db.query<{ is_admin: boolean }>(
    `select is_admin from users where id = $1`,
    [user.userId],
  );
  if (!rows[0]?.is_admin) throw new Error("FORBIDDEN");
  return user;
}

export const REF_COOKIE = "grihasti_ref";

/**
 * Referral code captured from ?ref= before signup (spec §3.2).
 * 90 days: long enough to survive a waitlist-to-launch gap, since someone who
 * clicks a friend's link in July should still be attributed in August.
 */
export const refCookieOptions = {
  httpOnly: false, // read by the poll component to show "referred by a friend"
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 90 * 24 * 60 * 60,
};
