-- Grihasti — self-hosted email-OTP auth (no GoTrue / no vendor auth service).
--
-- WHY NOT PHONE-OTP (spec §7): transactional SMS in India requires TRAI DLT
-- sender-ID and template registration, typically 1-3 weeks. That does not fit
-- a 10-12 Aug launch. Email OTP ships now; `users.phone` stays nullable and a
-- phone channel can be added behind the same interface once DLT clears.

-- Email is the login identifier, so it must be unique. Stored lower-cased.
create unique index if not exists idx_users_email_unique
  on users (lower(email)) where email is not null;

-- ── One-time codes ───────────────────────────────────────────────────────
-- The code itself is never stored. We store a SHA-256 hash, so a database
-- leak does not hand an attacker a set of live login codes.
create table if not exists otp_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  attempts    int not null default 0,
  -- Referral code captured at request time, so attribution survives the
  -- round-trip through the user's inbox even if the cookie is lost.
  ref_code    text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_otp_email_created on otp_codes (lower(email), created_at desc);
create index if not exists idx_otp_expires on otp_codes (expires_at);

-- ── Sessions ─────────────────────────────────────────────────────────────
-- Opaque random token, hashed at rest for the same reason as above.
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text unique not null,
  user_id     uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_sessions_user on sessions (user_id);
create index if not exists idx_sessions_expires on sessions (expires_at);

-- Housekeeping: call from a nightly job. Cheap, and keeps otp_codes from
-- growing without bound during a traffic spike.
create or replace function purge_expired_auth() returns void
language sql as $$
  delete from otp_codes where expires_at < now() - interval '1 day';
  delete from sessions  where expires_at < now();
$$;
