"use server";

import { query } from "@/lib/db";
import { DESIGNS } from "@/data/designs";
// Pure helpers live outside this file: every export from a "use server" module
// becomes a callable RPC endpoint, and non-async exports are a hard error.
import { normalizeContact } from "@/lib/contact";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const VALID_SLUGS = new Set(DESIGNS.map((d) => d.slug));

/**
 * Join the waitlist + record the "which sibling?" poll vote (spec §2, §7.1).
 *
 * `ref` is carried from ?ref= so the referral loop is seeded pre-launch. Note
 * it is stored as a raw string only — no invite is consumed and no attribution
 * is written here. Attribution happens once, at real signup, inside
 * signup_with_attribution (§3.2 first-touch, write-once). Burning an invite on
 * a waitlist join would let anyone drain a sharer's 5 invites without ever
 * creating an account.
 */
export async function joinWaitlist(formData: FormData): Promise<ActionResult> {
  const rawContact = String(formData.get("contact") ?? "");
  const rawChoice = String(formData.get("poll_choice") ?? "").trim();
  const ref = String(formData.get("ref") ?? "").trim() || null;
  const consent = String(formData.get("consent") ?? "") === "true";

  const contact = normalizeContact(rawContact);
  if (!contact) {
    return { ok: false, error: "Please enter a valid phone number or email." };
  }

  // Never trust a slug from the client into the DB.
  const pollChoice = rawChoice && VALID_SLUGS.has(rawChoice) ? rawChoice : null;

  try {
    await query(
      `insert into waitlist (contact, contact_kind, poll_choice, ref_code,
                             marketing_consent, consent_at)
       values ($1, $2, $3, $4, $5, case when $5 then now() else null end)
       on conflict (lower(contact)) do update
         set poll_choice = coalesce(excluded.poll_choice, waitlist.poll_choice),
             ref_code    = coalesce(waitlist.ref_code, excluded.ref_code),
             -- Consent latches on; a later re-submit never silently revokes it,
             -- and never silently grants it either.
             marketing_consent = waitlist.marketing_consent or excluded.marketing_consent,
             consent_at  = coalesce(waitlist.consent_at, excluded.consent_at)`,
      [
        contact.value,
        contact.kind,
        pollChoice,
        ref ? ref.toUpperCase().slice(0, 16) : null,
        consent,
      ],
    );
    return { ok: true };
  } catch (e) {
    // Don't leak SQL detail to the client.
    console.error("[joinWaitlist]", e);
    return { ok: false, error: "Couldn't save that — please try again." };
  }
}

/** Live poll tallies, for "most-voted sibling" social proof on the landing page. */
export async function getPollResults(): Promise<Record<string, number>> {
  try {
    const { rows } = await query<{ poll_choice: string; n: string }>(
      `select poll_choice, count(*)::text as n
         from waitlist
        where poll_choice is not null
        group by poll_choice`,
    );
    return Object.fromEntries(rows.map((r) => [r.poll_choice, Number(r.n)]));
  } catch {
    // Landing page must render even if the DB is unreachable.
    return {};
  }
}
