-- Grihasti — signup attribution + the 5-invite gate (spec §3.2, §3.3, §8).
--
-- This runs as ONE database function on purpose. The spec's pseudocode reads
-- as four separate steps (look up inviter, check remaining, decrement, insert
-- event). Done as four round-trips from the app, two people clicking the same
-- WhatsApp link at the same moment can both observe invites_remaining = 1 and
-- both decrement, taking the inviter to 6 invitees and breaking the branching
-- factor the whole growth model (§14, K = invites x activation) is built on.
--
-- SELECT ... FOR UPDATE serialises signups per-inviter. Under READ COMMITTED
-- the second transaction re-reads the row after the lock is released, so it
-- correctly sees invites_remaining = 0 and falls through to organic.

-- ── Invite code generation ───────────────────────────────────────────────
-- Alphabet deliberately excludes I, O, 0, 1: these codes get read aloud and
-- retyped from screenshots, and 0/O confusion costs a referral.
create or replace function gen_invite_code() returns text
language plpgsql as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..7 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from users where invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- ── Signup ───────────────────────────────────────────────────────────────
-- Returns the new user's id. Attribution is first-touch and write-once; the
-- trigger from 0001 (trg_lock_inviter) enforces immutability thereafter.
--
-- An unknown code, or a code whose owner has no invites left, is NOT an error:
-- per §3.3 the visitor still signs up, just organically (inviter_id = null).
create or replace function signup_with_attribution(
  p_email text,
  p_phone text,
  p_name  text,
  p_ref   text
) returns uuid
language plpgsql as $$
declare
  v_inviter_id uuid;
  v_remaining  int;
  v_user_id    uuid;
begin
  if p_ref is not null and length(trim(p_ref)) > 0 then
    select id, invites_remaining
      into v_inviter_id, v_remaining
      from users
     where invite_code = upper(trim(p_ref))
     for update;

    if v_inviter_id is not null and v_remaining > 0 then
      update users
         set invites_remaining = invites_remaining - 1
       where id = v_inviter_id;
    else
      -- Unknown code, or circle full -> organic signup.
      v_inviter_id := null;
    end if;
  end if;

  insert into users (email, phone, name, inviter_id, invite_code)
  values (
    lower(nullif(trim(p_email), '')),
    nullif(trim(p_phone), ''),
    nullif(trim(p_name),  ''),
    v_inviter_id,
    gen_invite_code()
  )
  returning id into v_user_id;

  if v_inviter_id is not null then
    insert into referral_events (inviter_id, invitee_id)
    values (v_inviter_id, v_user_id);
  end if;

  return v_user_id;
end;
$$;

-- ── Upline resolution (spec §3.2) ────────────────────────────────────────
-- Walk inviter_id upward, nearest ancestor first, capped at p_levels.
-- The cycle guard is defensive: write-once attribution should make cycles
-- impossible, but an infinite loop inside a payment webhook is not a failure
-- mode worth leaving to chance.
create or replace function get_upline(p_user_id uuid, p_levels int default 3)
returns table (level int, user_id uuid)
language plpgsql as $$
declare
  v_current uuid := p_user_id;
  v_next    uuid;
  v_level   int := 0;
  v_seen    uuid[] := array[p_user_id];
begin
  while v_level < p_levels loop
    select inviter_id into v_next from users where id = v_current;
    exit when v_next is null or v_next = any(v_seen);

    v_level  := v_level + 1;
    v_seen   := v_seen || v_next;
    level    := v_level;
    user_id  := v_next;
    return next;

    v_current := v_next;
  end loop;
end;
$$;

-- Balance helper — the ledger is the only source of truth (spec §3.5).
-- Never cache this into a column; a stale balance column is how points
-- programmes end up owing money they cannot reconcile.
create or replace function points_balance(p_user_id uuid)
returns numeric
language sql stable as $$
  select coalesce(sum(amount_inr), 0)::numeric
    from points_ledger
   where user_id = p_user_id;
$$;
