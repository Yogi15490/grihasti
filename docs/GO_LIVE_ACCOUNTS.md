# Grihasti — accounts & credentials you need to arrange

Everything below needs a human with your identity documents, bank details or company records. None of it can be done from the code side.

**Target:** portal live 10–12 Aug 2026 · order cutoff 21 Aug · Raksha Bandhan 28 Aug.

Ordered by lead time, longest first. The first three are the ones that can actually miss the launch date.

---

## Tier 1 — start today, these have real lead times

### 1. Razorpay account (KYC-gated) — **the critical path**

The single item most likely to delay launch. Activation requires document review, and a rejected or queried submission restarts the clock.

You will need:

- **PAN** — business PAN for a company/LLP, personal PAN for a sole proprietor
- **GSTIN** — you are issuing GST invoices, so this must exist and match the business name
- **Bank account in the business name** + cancelled cheque or a bank statement
- **Business proof** — incorporation certificate, partnership deed, or for a proprietorship: Udyam/MSME registration, shop & establishment licence, or a GST certificate
- **Address proof** for the registered business address
- **Website live with policies visible** — see item 3. Razorpay checks this before activating.

What I need from you afterwards: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

> Start with **test mode keys** — those are available immediately, without KYC. I can build and verify the entire payment path on test keys while activation is pending. Only the final switch needs live keys.

### 2. GST registration + a CA sign-off on the rate

If you don't already have a GSTIN, this alone can take one to three weeks and blocks Razorpay too.

Separately, and importantly: **I need the correct GST rate confirmed.** The spec says 12% for candles (HSN 3406), but the 12% slab was collapsed in the September 2025 restructure, so that rate is probably no longer valid. I've defaulted to 18% and made it configuration, but the number goes on every invoice you issue — please have your CA confirm it. Getting this wrong is a tax problem, not a software problem.

Also confirm with them: the **invoice number series format**. I'm generating `GRH/2026-27/00001`, sequential and gap-free per financial year. If your CA wants a different prefix or series, it's a one-line change — but tell me before you issue invoice #1, not after.

### 3. Domain, DNS and the legal pages

- **grihasti.in** — registrar login, so DNS can point at the host
- **Email domain authentication** — SPF, DKIM and DMARC records. Without these, sign-in codes land in spam and customers simply cannot log in. This needs DNS access and 24–48 hours to propagate.
- **Policy pages** — Razorpay requires these live before activation, and they're a legal requirement anyway:
  - Terms & Conditions
  - Privacy Policy (must cover the referral programme's data use)
  - Refund & Cancellation Policy
  - Shipping Policy (dispatch timelines, especially the 21 Aug cutoff)
  - Contact page with a real address and phone number

I can draft all five from your business details — say the word. But **you must have them reviewed**; I'm not a lawyer and these carry real obligations.

### 4. Shiprocket account

- Business KYC, GSTIN, bank details
- **Pickup address registered and verified** — courier serviceability is checked against it
- Plan chosen (their free tier has per-shipment pricing; volume plans are cheaper if you expect a few hundred orders)

What I need: `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`.

---

## Tier 2 — needed before launch, but fast to set up

### 5. Database host

Supabase, free or Pro tier. Sign in with GitHub, create a project in the **Mumbai (ap-south-1)** region, and send me the connection string from Project Settings → Database.

Free tier will handle launch volume. The reason to consider Pro (~$25/mo) is **point-in-time recovery** — worth it for a ledger that records money owed to customers.

What I need: `DATABASE_URL`, plus `ADMIN_DATABASE_URL` for the restore drill.

### 6. Vercel account

Sign in with GitHub, import the repo, add the domain. Free tier is fine to start; the Pro tier ($20/mo) matters mainly for commercial-use terms and better analytics.

You'll also need a **GitHub account** with a repository for this code — it isn't in version control yet, and Vercel deploys from a repo.

### 7. Resend (transactional email)

Powers sign-in codes and order confirmations. Free tier covers 3,000 emails/month, which is ample.

Requires verifying **grihasti.in** by adding DNS records — same DNS access as item 3, do them together.

What I need: `RESEND_API_KEY`, and confirmation of the from-address (I've assumed `hello@grihasti.in`).

### 8. Meta Business account + Pixel

For the paid traffic driving the launch.

- Meta Business Suite account
- Pixel created; I need `NEXT_PUBLIC_META_PIXEL_ID`
- Conversions API token if you want server-side tracking (recommended — browser pixels are increasingly blocked)
- **Domain verified in Business Manager** — more DNS records, do them with items 3 and 7

### 9. Backup destination

Somewhere off the database host to store nightly dumps. Backblaze B2 or Cloudflare R2, roughly ₹50–100/month at this volume.

What I need: bucket name and credentials for `RCLONE_REMOTE`.

This is not optional. The points ledger is the record of what you owe customers — if it's lost, the liability doesn't vanish, you just can't compute it.

---

## Tier 3 — deferred, not needed for launch

### 10. SMS / phone-OTP (MSG91 or similar)

Deferred deliberately. Phone-OTP in India requires **TRAI DLT registration** — a sender ID and pre-approved message templates — which typically takes one to three weeks and does not fit this timeline. Login is email-OTP for launch.

If you want phone login later, start DLT registration now, since it's the lead time that matters, not the code.

### 11. Business decisions I still need from you

Not accounts, but they block finishing the build:

- **Shipping charges.** The spec doesn't mention them at all — no line item, no field, no answer on whether referral cashback accrues on shipping. Right now the order total is just the sum of item prices. Free shipping baked into the ₹900 is simplest; tell me if not.
- **Final prices.** Spec says ₹900 caricature / ₹850 gift set, marked "confirm".
- **Real stock quantities per design.** Current seed numbers are placeholders pending your production pilot. This matters — it drives sold-out states on a limited-edition drop.
- **Who gets admin access.** Send me the email addresses; admin is granted per-account.

---

## What I need, as a checklist

Copy this into `.env.local` as things arrive. I can build against everything else while the Razorpay KYC clears.

```
DATABASE_URL=                  # Tier 2, item 5
ADMIN_DATABASE_URL=            # Tier 2, item 5
RESEND_API_KEY=                # Tier 2, item 7
EMAIL_FROM=                    # Tier 2, item 7
RAZORPAY_KEY_ID=               # Tier 1, item 1 — test keys are fine to start
RAZORPAY_KEY_SECRET=           # Tier 1, item 1
RAZORPAY_WEBHOOK_SECRET=       # Tier 1, item 1
SHIPROCKET_EMAIL=              # Tier 1, item 4
SHIPROCKET_PASSWORD=           # Tier 1, item 4
NEXT_PUBLIC_META_PIXEL_ID=     # Tier 2, item 8
META_CAPI_TOKEN=               # Tier 2, item 8
RCLONE_REMOTE=                 # Tier 2, item 9
GST_RATE=                      # Tier 1, item 2 — CA-confirmed
```

---

## Suggested order of attack

**This week:** Razorpay KYC submission · GST rate confirmed with your CA · domain DNS access gathered · Supabase + Vercel + GitHub created (30 minutes total) · Resend domain verification started.

**Next week:** Shiprocket KYC + pickup address · policy pages drafted and reviewed · Meta pixel + domain verification · backup bucket · real stock numbers from the production pilot.

**Before go-live:** swap Razorpay to live keys · run the restore drill against the real database · one live test order end-to-end, then refund it.

The only genuine risk to 10–12 Aug is Razorpay activation. Everything else is either fast or already handled — and I can build and test the full payment flow on test keys while you wait.
