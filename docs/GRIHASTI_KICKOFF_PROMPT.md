# Grihasti — New-Session Kickoff Prompt

*Paste the block below into a fresh coding session (Claude Code / dev agent) with `GRIHASTI_BUILD_SPEC.md` present in the project folder, or paste the spec's contents alongside it.*

---

You are building a commerce + referral web app for Grihasti (grihasti.in), a Rakhi product launch. The complete spec is in GRIHASTI_BUILD_SPEC.md — read it fully before writing any code, then begin at §12 "Build order."

Context: hard deadline — portal live ~10–12 Aug 2026, order cutoff 21 Aug, Raksha Bandhan 28 Aug. It's a limited-edition drop of 14 fixed caricature-candle designs, sold only through this portal, whose defining feature is a multi-level, lifetime, points-based referral engine with a 5-invite gate.

Stack (confirm, or propose a swap before scaffolding): Next.js (App Router) on Vercel + Supabase (Postgres + phone-OTP auth) + Razorpay + Shiprocket.

Non-negotiables — do not reinterpret these:
- §3 business rules: cashback rates, 5-invite gate, accrue-on-cash-paid, lifetime earning, append-only ledger, payment-webhook-authoritative, idempotent payout, atomic stock decrement.
- §6 schema (DDL) and §8 flows are the contract.
- §11 acceptance test is the definition of done — implement it as an automated end-to-end test and make all 10 steps pass.

How I want you to work:
1. Confirm the stack and list any env vars/accounts you need from me (§5).
2. Scaffold the repo and run the §6 DDL as a migration.
3. Follow the §12 Week-1 order; ship the waitlist landing + poll first.
4. Build the referral engine (§3.4) and points ledger with tests early — it's the risky core, not an afterthought.
5. After each epic, run the relevant part of the §11 test and report status.
6. Flag any ambiguity or spec gap instead of guessing.

Start by reading the spec and giving me: your stack confirmation, the env vars you need, and your first-day plan.
