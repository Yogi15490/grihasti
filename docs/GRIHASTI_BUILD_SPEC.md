# GRIHASTI — Master Build Spec
### Single source of truth for building the Rakhi commerce + referral portal
**Domain:** grihasti.in · **Deadline:** portal live ~10–12 Aug 2026, order cutoff 21 Aug, Raksha Bandhan 28 Aug 2026.

> **Purpose of this file:** hand this to a fresh build session (Claude Code / a dev agent) as the complete context to build the app end-to-end. It is self-contained — read top to bottom, then start at §12 "Build order." Nothing here depends on prior conversation.

---

## 0. How to bootstrap from a new session
1. Start a new coding session in the project directory (empty repo is fine).
2. Provide this file as the primary spec.
3. Confirm the tech stack (§4) or swap it, then scaffold per §12 build order.
4. Treat §3 (business rules) and §11 (acceptance test) as non-negotiable — everything else is implementation detail.

---

## 1. Context (why this exists)
Grihasti is a premium Indian home-lifestyle brand launching with a **limited-edition Rakhi drop**: a fixed collection of **14 caricature candle designs** ("The Bhai-Behen Collection"), each an affectionate sibling persona. Buyers **pick the design that's most like their sibling** (no photo upload). Products are **produced in-house and shipped from pre-built stock**.

The portal is the **only** sales channel (no marketplace/WhatsApp checkout) and its defining feature is a **multi-level, lifetime, points-based referral engine** with a **5-invite gate**. Marketing (paid + organic + email/SMS) drives traffic to the portal.

**This is a commerce app + a custom referral/points ledger.** The commerce part is standard; the referral ledger is the differentiator and the part to get exactly right (§3).

---

## 2. Product scope (MVP — in / out)
**In:**
- Waitlist landing + "which sibling?" poll (ships first).
- Catalog of 14 caricature designs + 1 Gift Set SKU, with live stock counts.
- Design detail with scent choice + optional name/message.
- Cart, checkout, Razorpay payment, GST invoice.
- Referral engine: attribution, 5-invite gate, 4-tier lifetime cashback.
- Points ledger: earn / redeem (uncapped) / clawback.
- Referral dashboard (link, invites left, balance, downline, earnings).
- Admin: orders, stock, dispatch (Shiprocket), ledger viewer.

**Out (Diwali+):** photo-based made-to-order caricatures, proof approval, full 6-scent range, custom vessels, multipacks, B2B, subscriptions, mobile app, i18n.

**Launch scents:** 2 only — *Aangan at Dusk*, *Sunday Slow* (chosen at checkout, independent of design).
**Price band:** caricature ₹900 (confirm), Gift Set ~₹850. Values are config, not hardcoded.

---

## 3. CORE BUSINESS RULES (non-negotiable)

### 3.1 Constants
```
INVITE_GATE            = 5        # invites per member (tree branching factor)
UPLINE_LEVELS          = 3        # pay buyer + 3 ancestors = 4 tiers total
BUYER_CASHBACK         = 0.05     # 5% to the buyer on their own order
DECAY                  = 0.5      # each upline level = half the level below
# Derived per-level rates (fraction of accrual base):
#   buyer  L0 = 0.05
#   L1        = 0.025
#   L2        = 0.0125
#   L3        = 0.00625
ACCRUE_ON_CASH_ONLY    = true     # cashback base = cash paid, NOT points-paid portion
POINT_VALUE_INR        = 1        # 1 point = ₹1
REDEMPTION_CAP         = none     # points can cover up to 100% of an order
POINTS_EXPIRY          = none
EARNING_MODE           = lifetime # fires on EVERY paid order, not just the first
GST_RATE               = 0.12     # candles HSN 3406 — confirm current
```

### 3.2 Attribution
- Referral link carries `?ref=<invite_code>`. Store in a cookie pre-auth.
- On signup: if `ref` is valid **and** that inviter has `invites_remaining > 0`, set `new_user.inviter_id = inviter.id` (**write-once, immutable, first-touch**), decrement inviter's `invites_remaining`, and log a `referral_events` row. Otherwise `inviter_id = null` (organic).
- Upline of any user = walk `inviter_id` up to `UPLINE_LEVELS`.

### 3.3 Invite gate
- Every user starts with `invites_remaining = 5`.
- Decrements on each **successful signup** via their link. At 0, the link shows "this circle is full"; the visitor can still sign up organically (null inviter).

### 3.4 Payout (on a confirmed paid order by user U)
```
base = ACCRUE_ON_CASH_ONLY ? order.cash_paid_inr : order.gross_total_inr
rates = [0.05, 0.025, 0.0125, 0.00625]   # index 0 = buyer
# buyer
ledger.insert(U, order, type=EARN_SELF, level=0, amount = base * rates[0])
# upline
ancestor = U.inviter_id ; level = 1
while ancestor != null and level <= UPLINE_LEVELS:
    ledger.insert(ancestor, order, type=EARN_REFERRAL, level, amount = base * rates[level])
    ancestor = user(ancestor).inviter_id ; level += 1
```
- **Lifetime:** every paid order triggers this.
- **Idempotent:** guard so a duplicate payment webhook does not double-credit (unique on `(order_id, user_id, type, level)` or check-before-insert).
- Upline earns **whether or not** they are themselves a customer.
- Max total payout ≈ **9.375%** of the accrual base (bounded by the cap at L3).

### 3.5 Points ledger
- **Append-only.** Never mutate/delete rows. Balance = `SUM(amount_inr)` for the user.
- Types: `EARN_SELF`, `EARN_REFERRAL` (with `level`), `REDEEM` (negative), `CLAWBACK` (negative), `ADJUST` (±).
- Earn is written **only after verified payment** (not on order create).
- Redemption at checkout: `cash_due = gross − points_redeemed`; write a `REDEEM` row on payment confirmation. Cashback then accrues on `cash_due` (see 3.1).
- **Refund/cancel → CLAWBACK:** reverse that order's buyer + upline EARN rows (insert equal negatives); return any redeemed points (insert positive). Balance may go negative; recover from future earnings.

### 3.6 Worked example (encode as a test — see §11)
Order ₹1,000, paid ₹900 cash + ₹100 points. `base = 900`.
Buyer +₹45 · L1 +₹22.50 · L2 +₹11.25 · L3 +₹5.625. The ₹100 points portion earns nothing.

---

## 4. Tech stack (assumed — confirm or swap)
| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js (App Router) on Vercel | Marketing landing + store |
| DB + Auth | Supabase (Postgres + phone-OTP auth) | Postgres hosts the ledger |
| Referral/points logic | Custom (SQL + serverless/edge functions) | The differentiator |
| Payments | Razorpay | UPI/cards/netbanking; webhook-driven |
| Shipping | Shiprocket | Pan-India couriers, labels, tracking |
| Email/SMS | (e.g.) Resend + MSG91 | Transactional + campaign |
| Admin | Internal pages or Retool | Keep lean |

Fallback if no strong dev: Shopify for catalog/checkout + a custom referral microservice via webhooks (more moving parts).

---

## 5. Environment & integrations
Required env vars / accounts: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `NEXT_PUBLIC_SITE_URL=https://grihasti.in`, email/SMS provider keys, `META_PIXEL_ID`.
DNS: point grihasti.in to Vercel; set up transactional email domain (SPF/DKIM).

---

## 6. Data model (Postgres DDL)
```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  email text,
  name text,
  inviter_id uuid references users(id),         -- write-once, first-touch
  invite_code text unique not null,
  invites_remaining int not null default 5,
  created_at timestamptz default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  type text not null check (type in ('caricature','giftset')),
  description text,
  price_inr numeric(10,2) not null,
  stock_qty int not null default 0,
  scent_options text[] default '{Aangan at Dusk,Sunday Slow}',
  images jsonb,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  status text not null default 'created'
    check (status in ('created','paid','dispatched','delivered','cancelled','refunded')),
  gross_total_inr numeric(10,2) not null,
  points_redeemed_inr numeric(10,2) not null default 0,
  cash_paid_inr numeric(10,2) not null default 0,
  razorpay_order_id text,
  razorpay_payment_id text,
  gst_invoice_no text,
  shipping_address jsonb,
  awb_tracking text,
  created_at timestamptz default now(),
  paid_at timestamptz
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  product_id uuid not null references products(id),
  qty int not null default 1,
  unit_price_inr numeric(10,2) not null,
  scent text,
  name_message text
);

create table points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  order_id uuid references orders(id),
  type text not null check (type in ('EARN_SELF','EARN_REFERRAL','REDEEM','CLAWBACK','ADJUST')),
  level int,                                   -- 0 buyer, 1..3 upline
  amount_inr numeric(10,2) not null,           -- +earn / -redeem / -clawback
  created_at timestamptz default now(),
  unique (order_id, user_id, type, level)      -- idempotency guard
);

create table referral_events (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references users(id),
  invitee_id uuid not null references users(id),
  created_at timestamptz default now()
);

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  contact text not null,                        -- phone or email
  poll_choice text,                             -- product slug voted
  ref_code text,
  created_at timestamptz default now()
);

create index on users(inviter_id);
create index on points_ledger(user_id);
create index on orders(user_id);
create index on order_items(order_id);
```
Balance: `select coalesce(sum(amount_inr),0) from points_ledger where user_id = :id;`

---

## 7. Pages / screens
1. **Waitlist landing** (`/`, pre-launch) — capture + "which sibling?" poll; honours `?ref=`.
2. **Collection** (`/shop`) — 14 designs + Gift Set, live stock, "sold out" states.
3. **Design detail** (`/shop/[slug]`) — images, scent picker, name/message field, add-to-cart (hidden if stock 0).
4. **Cart** (`/cart`) — items, points slider, referral attribution preserved.
5. **Checkout** (`/checkout`) — address, Razorpay, points redemption, GST.
6. **Order confirmation** (`/order/[id]`) — summary + share/refer prompt (unique link).
7. **Account · Referral** (`/account`) — link, invites remaining (of 5), balance, downline, earnings.
8. **Account · Orders** — history + tracking.
9. **Admin** (`/admin`) — orders, stock, dispatch, ledger/referral viewer.

Auth: phone-OTP (Supabase). Account created at checkout or on referral-link click.

---

## 8. Key flows (pseudocode)
**Signup + attribution**
```
ref = cookie('ref')
inviter = ref ? users.byCode(ref) : null
if inviter and inviter.invites_remaining > 0:
    user.inviter_id = inviter.id
    inviter.invites_remaining -= 1
    referral_events.insert(inviter.id, user.id)
else:
    user.inviter_id = null
user.invite_code = uniqueCode()
user.invites_remaining = 5
```
**Checkout → payment**
```
gross = sum(items.unit_price * qty)
points_redeemed = min(requested, balance(user))         # no cap
cash_due = gross - points_redeemed
razorpay.createOrder(cash_due)                          # order.status='created'
# on verified webhook:
order.status='paid'; order.cash_paid_inr=cash_due; order.points_redeemed_inr=points_redeemed
generateGstInvoice(order)
decrementStock(items)                                   # atomic, see below
if points_redeemed>0: ledger.insert(user, order, REDEEM, null, -points_redeemed)
runPayout(order)                                        # §3.4
```
**Atomic stock decrement**
```
update products set stock_qty = stock_qty - :qty
  where id = :id and stock_qty >= :qty;   -- 0 rows affected => oversold => fail order
```
**Refund**
```
for each EARN row of order: ledger.insert(row.user, order, CLAWBACK, row.level, -row.amount)
if order.points_redeemed_inr>0: ledger.insert(order.user, order, CLAWBACK, null, +order.points_redeemed_inr)
order.status='refunded'; restock(items)
```

---

## 9. Admin (internal)
Orders list/filter by status; view items + name/message + address; one-click Shiprocket dispatch (label + AWB → status `dispatched` + notify customer); stock editor per design with low-stock flag; per-user ledger + downline viewer for support.

---

## 10. Non-functional
- **Payments are webhook-authoritative** — never mark paid from the client. Verify Razorpay signature.
- **Idempotency** on the payment webhook (unique ledger constraint) — duplicate events must not double-credit.
- **Concurrency** — stock decrement must be atomic (no oversell); use the conditional UPDATE above.
- **Security** — Supabase RLS: users read only their own orders/ledger; admin role gated; service key server-side only.
- **GST** — sequential invoice numbering, correct HSN, config rate.
- **Auditability** — append-only ledger is the system of record for all points.
- **Privacy/consent** — waitlist + marketing opt-in.

---

## 11. Acceptance test (must pass — the definition of done)
1. User A signs up organically → gets `invite_code` + `invites_remaining=5`.
2. A shares link → B signs up via it → `B.inviter_id=A`, `A.invites_remaining=4`, `referral_events` row exists.
3. B → C → D sign up via links (chain A→B→C→D).
4. D orders a design ₹1,000, pays ₹900 cash + ₹100 points.
5. **Ledger asserts:** D `EARN_SELF` +45; C `EARN_REFERRAL L1` +22.50; B `L2` +11.25; A `L3` +5.625; no earn on the ₹100 points portion.
6. Stock for that design −1; GST invoice generated; `REDEEM` −100 row on D.
7. Admin dispatches via Shiprocket → D has tracking; status `dispatched`.
8. Duplicate payment webhook for D's order → **no** double credit (idempotent).
9. Refund D's order → `CLAWBACK` reverses all four earns and returns D's 100 points; stock restocked.
10. A attempts a 6th invite signup → link shows "circle full"; visitor can still join organically (null inviter).

---

## 12. Build order (2-week board)
**Week 1 — foundation to first paid order**
Scaffold (Next.js/Vercel/Supabase) → DDL migration (§6) → phone-OTP auth → **waitlist landing + poll (ship first)** → catalog + design detail + atomic stock → cart → Razorpay + webhook → GST invoice → signup attribution + invite gate → Meta pixel.
*Exit:* sign up via referral link and place a verified paid order.

**Week 2 — engine, dashboard, dispatch**
Payout function (§3.4) → points ledger (earn/redeem/clawback, append-only) → points redemption at checkout → referral dashboard + share → admin orders/stock → Shiprocket dispatch → analytics events → run the full §11 acceptance test.
*Exit:* cashback flows to 3 levels, points redeem, admin dispatches. **Go-live ~10–12 Aug.**

---

## 13. Analytics / events
signup (organic vs referred), activation (invite→paid), invites used, referral shares, referred-order %, points earned vs redeemed (liability), sell-through by design, dispatch on-time, Meta pixel + Conversions API.

---

## 14. Reference figures (from planning)
- Bounded referral cost ≈ **9.375%** of revenue; blended product margin ~47% → **~37–38% effective** after referral.
- Growth dial **K = invites × activation** (5 × activation). K>1 grows, =1 linear.
- The 14 designs, scent library, pricing model, and marketing sequences live in the companion Grihasti docs; only the constants in §3 are needed to build.

*End of spec. Start at §12.*
