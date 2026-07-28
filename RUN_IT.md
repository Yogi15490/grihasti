# Run Grihasti locally

Three commands. No database, no accounts, no configuration.

```bash
cd ~/Projects/grihasti
npm install
npm run dev
```

Open **http://localhost:3000**

On first boot the app creates an embedded Postgres in `.local-db/`, applies all
eight migrations and seeds the 14 designs plus the gift set. You'll see:

```
✓ Local database created in .local-db/ — 8 migrations applied.
```

---

## Walk the whole thing in five minutes

**1. Landing + poll** — `/`
Pick a sibling, tick the consent box, join the waitlist.

**2. Sign in** — `/login`
Enter any email. There's no email provider connected locally, so the code is
shown on screen and pre-filled. Click through.

> The first account to sign in becomes an **admin**. Use your own email.

**3. Shop** — `/shop`
Live stock from the database. Sold-out and "only N left" states are real.

**4. Buy something** — pick a design → add to cart → `/cart` → checkout.
Fill in an address, place the order.

**5. Settle it** — on the confirmation page, click **"Mark as paid (dev)"**.
No payment provider is wired up yet, so this stands in for the Razorpay webhook.
It runs the identical code path: stock decrement, GST invoice, cashback to
three levels, points ledger.

**6. Your circle** — `/account`
Cashback balance, share link, invite count, downline, ledger history.

**7. Admin** — `/admin`
Order list, dispatch with an AWB, refunds, stock editor.

---

## See the referral engine work

The whole point of the build. Copy your share link from `/account`, then:

1. Open a **private/incognito window** and paste the link.
2. Sign in with a different email — you've now been referred.
3. Buy something and settle it.
4. Back in your first window, refresh `/account`.

You'll see the cashback arrive: the buyer gets 5%, you get 2.5% as their
inviter, and it halves again for each level above you, three levels up.

Repeat with a third and fourth email to see the full A→B→C→D chain, and a sixth
to watch the invite gate close ("this circle is full" — they can still sign up,
just unattributed).

---

## Starting over

```bash
rm -rf .local-db
```

Next `npm run dev` rebuilds it clean.

---

## What's not real yet

- **Payments.** Razorpay is deferred by choice. The "Mark as paid (dev)" button
  stands in, and it refuses to run in production.
- **Shipping labels.** Dispatch records an AWB you type in; the Shiprocket API
  client that fetches one automatically isn't built.
- **Email.** Codes appear on screen instead of in your inbox until a Resend key
  is configured.
- **Product photos.** Placeholder tiles — the design names on a gradient.

---

## Going to a real URL

The local database is for development only; it's hard-disabled in production.
For a deployed site you need a `DATABASE_URL`, a GitHub repo and a Vercel
project — see [`docs/GO_LIVE_ACCOUNTS.md`](docs/GO_LIVE_ACCOUNTS.md).

Nothing in the app code changes. `DATABASE_URL` being present is the only
switch.
