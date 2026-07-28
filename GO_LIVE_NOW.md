# Go live — three commands

Total time: about 10 minutes, most of it waiting for a build.

---

## Command 1 — on your Mac

Push the setup script up to GitHub.

```bash
cd ~/Projects/grihasti && git pull --rebase && git push
```

---

## Command 2 — point the domain

Do this **before** command 3, so the certificate can be issued straight away.

1. Log into Cloudflare
2. Click **grihasti.in**
3. Click **DNS** in the left sidebar
4. Click **Add record**:
   - **Type:** `A`
   - **Name:** `@`
   - **IPv4 address:** `178.105.230.228`
   - **Proxy status:** click the cloud so it's **orange** (Proxied)
   - **Save**
5. Click **Add record** again, identical but **Name:** `www`

---

## Command 3 — on your server

```bash
ssh root@178.105.230.228
```

Then paste this single line:

```bash
curl -fsSL https://raw.githubusercontent.com/Yogi15490/grihasti/main/scripts/server-setup.sh | bash
```

That's it. The script does everything:

- finds which network Caddy is on
- clones the repo to `/root/grihasti`
- generates `.env` with a random database password
- builds and starts Postgres + the app
- waits until the app actually responds
- adds the `grihasti.in` block to workrize's Caddyfile
- **validates the Caddyfile before reloading** — if it's wrong it reverts and stops, so workrize.in cannot be broken
- reloads Caddy without restarting it
- installs a nightly database backup

It prints what it did at each step, and it's safe to run again if anything goes wrong.

**If the clone fails**, the repo is private and the server can't log into GitHub. The script tells you the exact command to run with a token instead.

---

## Then

Open <https://grihasti.in>

Give it a minute or two — the certificate is issued on the first request.

---

## What you'll be able to do immediately

- Browse the 14 designs with live stock
- Sign in (the code appears on screen — no email provider connected yet)
- Place an order and settle it with the dev button
- Watch cashback flow to three referral levels
- Use the admin at `/admin` — the first account to sign in becomes admin

## What won't work yet

- **Real payments** — Razorpay isn't wired in. Deferred by your call.
- **Emailed sign-in codes** — needs the Resend key.
- **Automatic shipping labels** — dispatch works, you type the AWB yourself.
- **Product photos** — placeholder tiles for now.

---

## After this

Every push to `main` deploys itself. You never SSH in again.

```bash
cd ~/Projects/grihasti
npm run verify        # must pass
git add -A && git commit -m "what changed" && git push
```

---

## If something breaks

**Site shows an error** — on the server:

```bash
cd /root/grihasti && docker compose logs --tail 50 web
```

Paste that to me.

**You want to undo the Caddy change** — the script backed it up:

```bash
ls /root/workrize/Caddyfile.bak.*
cp /root/workrize/Caddyfile.bak.<newest> /root/workrize/Caddyfile
docker exec $(docker ps --format '{{.Names}}' | grep -i caddy) caddy reload --config /etc/caddy/Caddyfile
```

**Start the whole thing over:**

```bash
cd /root/grihasti && docker compose down -v && bash scripts/server-setup.sh
```
