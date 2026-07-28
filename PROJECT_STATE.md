# Grihasti — Project State (cross-session handover)

**Read this file first in ANY Claude session before touching code.**

Sister project to workrize; same box, same conventions, same deploy pattern.

## Non-negotiable session protocol

1. ONE session works on this repo at a time. Finish, checkpoint, then switch.
2. Session start ritual: `cd ~/Projects/grihasti && git pull && git status`
   — must say "up to date" and clean before any work.
3. All change happens on the Mac clone, then: `npm run verify` → commit → push.
   CI deploys. NEVER edit files on the server; it is a read-only deploy target.
4. **`npm run verify` is a hard gate before ANY push.** It runs the boundary
   check, the type check, `next build` and the full test suite. Chain pushes
   behind it with `&&`, never `;`.
5. `next build` is in that gate for a reason: typecheck alone passes on code
   that fails to compile. A non-async export from a `"use server"` module got
   to the browser once because the gate didn't include the build.
6. Migrations are append-only. Never edit an applied one — add a new numbered
   file. The runner warns on checksum drift but will not re-run.
7. The points ledger is append-only and is the system of record for money owed
   to customers. Corrections are new `ADJUST` rows, never edits.
8. Update this file's "Current state" whenever features ship.

## Infrastructure

- Live: https://grihasti.in (Next.js, via Cloudflare, shared Caddy)
- Server: Hetzner 178.105.230.228 — same box as workrize.in, coldpressery.in,
  farmsae.com. `ssh -o ServerAliveInterval=60 root@178.105.230.228`
- Stack: `/root/grihasti`, docker compose (db=postgres16, web=Next standalone)
- **No own Caddy** — the workrize stack's Caddy owns 80/443 and proxies
  `grihasti.in` → `grihasti-web:3000` over the shared external `edge` network
- Deploy: push to main → CI → SSH → `git pull && docker compose up -d --build`
- Migrations run automatically on container start (`scripts/migrate.mjs`)
- GitHub: Yogi15490/grihasti (private) — the single source of truth
- Secrets in server `/root/grihasti/.env` only
- Local dev needs NO database: embedded PGlite when `DATABASE_URL` is unset

## The spec is the contract

`docs/GRIHASTI_BUILD_SPEC.md`. §3 business rules and §11 acceptance test are
non-negotiable. All 10 acceptance steps pass today against a stub payment
provider.

## Current state (28 Jul 2026)

**Done**
- Referral + points engine: attribution, 5-invite gate, 4-tier lifetime
  cashback, append-only ledger, clawback. 98 tests.
- Order pipeline: create → pay → payout → refund. Provider-agnostic.
- GST invoicing, gap-free per financial year.
- Atomic stock decrement with oversell hold.
- Email-OTP auth, own sessions. No vendor auth service.
- Storefront, cart, checkout, account/referral dashboard, admin.
- Zero-setup local dev (`npm run dev`, no database needed).
- Docker + compose + CI + SSH deploy.

**Not done**
- Razorpay adapter (deferred by choice — `PaymentProvider` interface + stub
  in its place; adding it is one file)
- Shiprocket API client (dispatch recording works; AWB is typed by hand)
- Meta pixel events
- Product photography — placeholder tiles

**Deliberate spec deviations** — see README "Spec deviations". The important
one: §6's ledger unique constraint does not guard `REDEEM`/`CLAWBACK` rows
because their `level` is NULL and Postgres treats NULLs as distinct. Migration
0004 fixes it. `node scripts/prove-null-hole.mjs` demonstrates it; CI runs it.

## Blocking business decisions

- **Shipping charges** — absent from the spec entirely. Site currently says
  "Shipping is on us" and cashback accrues on item prices only.
- **GST rate** — defaulted to 18%; the 12% slab in the spec was collapsed in
  the Sept 2025 restructure. Needs CA confirmation before invoice #1.
- **Real stock quantities** per design — seed numbers are placeholders.
- **Self-referral** — nothing stops one person opening five accounts.

## Deadline

Portal live ~10–12 Aug 2026 · order cutoff 21 Aug · Raksha Bandhan 28 Aug.
Razorpay KYC is the critical path — see `docs/GO_LIVE_ACCOUNTS.md`.
