/**
 * Grihasti — contact parsing for the waitlist.
 *
 * Lives here rather than in the server-action module because a "use server"
 * file may only export async functions — every export becomes a callable RPC
 * endpoint. Pure helpers belong outside it.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Indian mobile: optional +91/0 prefix, then 6-9 followed by 9 digits.
const PHONE_RE = /^(?:\+?91|0)?[6-9]\d{9}$/;

export interface Contact {
  kind: "email" | "phone";
  value: string;
}

/** Classify and normalise a waitlist contact. Returns null if it's neither. */
export function normalizeContact(raw: string): Contact | null {
  const v = raw.trim();
  if (EMAIL_RE.test(v)) return { kind: "email", value: v.toLowerCase() };

  const digits = v.replace(/[\s\-()]/g, "");
  if (PHONE_RE.test(digits)) {
    // Store E.164 so a number entered as 09876543210, +919876543210 and
    // 9876543210 all dedupe to one waitlist row.
    return { kind: "phone", value: "+91" + digits.replace(/^(?:\+?91|0)/, "") };
  }
  return null;
}
