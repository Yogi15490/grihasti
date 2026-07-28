# Grihasti

Rakhi commerce + referral portal for **grihasti.in** — a limited-edition drop of 14 caricature candle designs, sold through a portal whose core is a multi-level, lifetime, points-based referral engine with a 5-invite gate.

**The full spec is the source of truth:** [`docs/GRIHASTI_BUILD_SPEC.md`](docs/GRIHASTI_BUILD_SPEC.md). Business rules are §3; acceptance test is §11; build order is §12.

## Status

| Area | State |
|---|---|
| Referral + points core (`src/lib/referral.ts`) | ✅ pure logic, unit-tested |
| Schema + migrations (0001–0007) | ✅ written, applied in tests |
| Signup attribution + 5-invite gate | ✅ atomic SQL function, integration-tested |
| Email-OTP auth (own sessions) | ✅ implemented — needs Resend key to send |
| Waitlist landing + poll | ✅ wired to DB, consent captured |
| Ledger idempotency guard | ✅ fixed (see *Spec deviations*) |
| **Order pipeline: create → pay → payout → refund** | ✅ complete, provider-agnostic |
| GST invoicing (gap-free, per FY) | ✅ implemented |
| Atomic stock + oversell handling | ✅ implemented |
| **Referral dashboard** (link, invites, downline, earnings) | ✅ service + tests |
| **Admin** (orders, stock, dispatch, ledger, audit) | ✅ service + tests |
| **Auth routes + session + `?ref=` capture** | ✅ wired |
| **Storefront** — catalog, detail, cart, checkout, confirmation | ✅ built |
| **Account pages** — login, referral dashboard, orders, ledger | ✅ built |
| **Admin pages** — orders, dispatch, refunds, stock | ✅ built |
| Backup + restore drill | ✅ scripted — **drill not yet run against a real host** |
| Razorpay adapter | ⏸ deferred by request — stub provider in its place |
| Shiprocket API client | ⛔ next (dispatch recording already works) |

Tests: **89 passing** (unit + integration against real Postgres).

### Verification status — read this before deploying

| Check | Status |
|---|---|
| `npm test` — 89 tests | ✅ passing |
| `tsc --noEmit` — 42 files | ✅ clean |
| `node scripts/check-boundaries.mjs` | ✅ no server/client violations |
| `next build` | ⚠️ **never successfully run** |

`next build` could not be executed in the sandbox this was written in — the build worker takes `SIGBUS` under both webpack and Turbopack, which is a container memory limit, not a code fault. The type-check and the boundary audit together cover most of what the build would catch, but **not all of it**.

**Run `npm run build` on a real machine before deploying.** Expect to fix one or two small things; that is normal for UI never put through a production compile.

`npm run verify` runs the boundary check, the type-check and the full suite together.

### §11 acceptance test coverage

| Step | Status |
|---|---|
| 1. Organic signup → code + 5 invites | ✅ |
| 2. Referred signup → attribution, decrement, event | ✅ |
| 3. Chain A→B→C→D | ✅ |
| 4. D orders ₹1,000, pays ₹900 + ₹100 points | ✅ |
| 5. Ledger: 45 / 22.50 / 11.25 / 5.625, nothing on points | ✅ |
| 6. Stock −1, GST invoice, REDEEM −100 | ✅ |
| 7. Dispatch → tracking, status `dispatched` | ✅ via admin service |
| 8. Duplicate webhook → no double credit | ✅ |
| 9. Refund → clawback all four, return points, restock | ✅ |
| 10. 6th invite → circle full, organic still allowed | ✅ |

**All 10 pass today** against the stub payment provider. Step 7 records dispatch (AWB, courier, status, audit trail); the Shiprocket API client that *fetches* an AWB is separate and still to build — deliberately, so dispatch works by hand if Shiprocket is down mid-season.

The Razorpay adapter is deferred by choice, not blocked.

## What you need to arrange

Accounts, KYC and credentials that need a human: **[`docs/GO_LIVE_ACCOUNTS.md`](docs/GO_LIVE_ACCOUNTS.md)**. Razorpay KYC is the critical path.

## Architecture decision: portable by default

The app talks to Postgres through `src/lib/db.ts` and nothing else — no Supabase SDK, no PostgREST, no vendor auth service. Supabase is used purely as a hosted Postgres for launch.

This is deliberate. Migrating to a self-hosted Hetzner/Docker Postgres later is a `DATABASE_URL` change plus a `pg_dump`/`pg_restore` — no application code moves. The decision on where to host is therefore reversible, and doesn't have to be made under deadline pressure.

**Consequence, worth knowing:** because the client never talks to the database directly, RLS is *not* the authorization boundary. Every query runs server-side under one role, and authorization is enforced in app code. Don't add a client-side DB path without revisiting that.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL at minimum
psql "$DATABASE_URL" -f db/migrations/0001_init.sql   # ...through 0006, in order
npm run dev
```

## Tests

```bash
npm test
```

Two layers:

- **Unit** (`tests/referral.test.ts`, `tests/cart.test.ts`) — pure money math. Asserts the §3.6 worked example (₹1,000 → ₹45 / 22.50 / 11.25 / 5.625 on a ₹900 cash base), the bounded 9.375% payout, level cap, short chains, redemption, clawback.
- **Integration** (`tests/attribution.test.ts`) — runs every migration against real Postgres (PGlite, in-process WASM build of PG18) and asserts attribution, the invite gate, upline resolution and ledger idempotency. Covers §11 steps 1, 2, 3, 10 and part of 8.

`node scripts/prove-null-hole.mjs` demonstrates the ledger bug that migration 0004 fixes.

## Spec deviations (deliberate, not drift)

1. **`numeric(12,4)`, not `(10,2)`** for ledger amounts. §3.6 requires ₹5.625 at L3; two decimals rounds it to 5.63 and makes §11 step 5 unpassable.
2. **`NULLS NOT DISTINCT`** on the ledger idempotency index. §6's plain `unique (order_id, user_id, type, level)` does not guard `REDEEM`/`CLAWBACK` rows, whose `level` is NULL — Postgres treats NULLs as distinct. A retried Razorpay webhook would debit the customer twice for points spent once. Proven by `scripts/prove-null-hole.mjs`; fixed in `0004`.
3. **Email-OTP, not phone-OTP**, for launch. Phone requires TRAI DLT sender-ID and template registration (1–3 weeks), which does not fit a 10–12 Aug launch. `users.phone` stays nullable; phone slots in behind the same interface later.
4. **GST default 18%, not 12%.** §3.1 flags "confirm current" and the 12% slab was collapsed in the Sept 2025 restructure. Config-driven — **confirm with a CA before go-live**.
5. **Attribution is one SQL function**, not four app-level steps, so concurrent clicks on the same link can't both pass the gate.

6. **Points double-spend guard.** §3.5 writes the `REDEEM` row only at payment confirmation, so two unpaid orders could each redeem the same balance. `available_points()` nets off points committed to open orders. Migration 0007.
7. **Partial idempotency index.** `NULLS NOT DISTINCT` applies to *every* indexed column including `order_id`, which would have capped each user at one lifetime `ADJUST` row. The guard is partial on `order_id is not null`.
8. **Oversell is recorded, not refused.** Because §8 decrements stock at payment time, two customers can both reach checkout for the last unit. We never discard a real payment — the order is marked paid and flagged `fulfilment_hold` for admin refund.

## Payments

Razorpay is deferred by choice. The pipeline is built against the `PaymentProvider` interface in `src/lib/payments/provider.ts` and tested with `StubPaymentProvider`, which implements the same HMAC-signed webhook contract. Adding Razorpay is one new file implementing three methods; the order service, the ledger and every test above stay untouched.

## Open questions (still need answers)

- **Shipping charges are absent from the spec.** No line item, no `orders` column, no answer on whether cashback accrues on shipping. Currently gross = sum of item prices only.
- **Self-referral is unmitigated.** Nothing stops one person opening five accounts to farm 9.375% of their own orders.
- **Zero-value orders** are settled internally (see `isZeroValueOrder`), a deliberate narrow exception to webhook-authority. Confirm you're happy with that rather than capping redemption at ~90%.

## Structure

```
docs/            GRIHASTI_BUILD_SPEC.md (source of truth) · GO_LIVE_ACCOUNTS.md
db/migrations/   0001 schema · 0002 seed · 0003 auth · 0004 ledger guard
                 0005 attribution · 0006 waitlist consent · 0007 orders/payments
                 0008 downline + admin
src/lib/         db.ts (the only vendor-aware file) · auth.ts · session.ts
                 referral.ts · orders.ts · dashboard.ts · admin.ts · catalog.ts
                 cart.ts · cartStorage.ts · email.ts · payments/
src/app/         App Router — shop, cart, checkout, order, account, admin, login
                 api/auth/* · actions/* (server actions)
scripts/         backup.sh · restore-drill.sh · prove-null-hole.mjs
                 check-boundaries.mjs
tests/           unit + integration (helpers/testdb.ts spins up real Postgres)
```

## Operations

```bash
# nightly, cron
DATABASE_URL=... RCLONE_REMOTE=b2:grihasti-backups ./scripts/backup.sh

# before go-live, and after every migration
ADMIN_DATABASE_URL=... ./scripts/restore-drill.sh
```

The restore drill asserts the restored ledger matches the row count *and* net balance recorded at backup time, and that the idempotency guard survived the round-trip. **It has not yet been run against a real host — do that before launch.**

## Build order

Follow §12. Week 1 remaining: catalog + atomic stock → cart → Razorpay + webhook → GST invoice → Meta pixel. Week 2: payout wiring → redemption at checkout → referral dashboard → admin → Shiprocket → full §11 acceptance test.
