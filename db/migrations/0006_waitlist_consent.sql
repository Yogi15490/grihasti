-- Grihasti — waitlist consent + dedupe (spec §10 privacy/consent).
--
-- The waitlist feeds marketing email/SMS, so opt-in has to be recorded at the
-- point of collection, not assumed. DPDP (India) expects consent to be
-- demonstrable — an unticked box in a screenshot is not a record.

alter table waitlist add column if not exists marketing_consent boolean not null default false;
alter table waitlist add column if not exists consent_at timestamptz;
alter table waitlist add column if not exists contact_kind text
  check (contact_kind in ('email','phone'));

-- One row per contact. Someone re-voting should update their pick, not create
-- a duplicate that we then email twice.
create unique index if not exists idx_waitlist_contact on waitlist (lower(contact));

create index if not exists idx_waitlist_poll on waitlist (poll_choice);
