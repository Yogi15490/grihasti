# Step by step — getting grihasti onto GitHub and live

Do these in order. Don't skip. Each block is copy-paste.

Anything in `<angle brackets>` is something you replace.

---

# PHASE 1 — Put the code on GitHub (10 minutes)

## Step 1.1 — Create the empty repo

1. Open <https://github.com/new> in your browser
2. **Repository name:** type `grihasti`
3. **Description:** leave blank
4. Click **Private**
5. **Do NOT tick** "Add a README file"
6. **Do NOT tick** "Add .gitignore"
7. **Do NOT tick** "Choose a license"
8. Click the green **Create repository** button

You'll land on a page saying "Quick setup". Ignore everything on it.

## Step 1.2 — Push your code

In your Mac terminal:

```bash
cd ~/Projects/grihasti
git push -u origin main
```

**If it says `Permission denied (publickey)`** — your Mac isn't set up to talk
to GitHub over SSH. Switch to HTTPS instead:

```bash
git remote set-url origin https://github.com/Yogi15490/grihasti.git
git push -u origin main
```

It'll ask for a username and password. Username is `Yogi15490`. The password
is **not** your GitHub password — it's a token:

1. Go to <https://github.com/settings/tokens/new>
2. **Note:** type `grihasti`
3. **Expiration:** 90 days
4. Tick the **repo** checkbox (the top one — it ticks the sub-boxes too)
5. Scroll down, click **Generate token**
6. Copy the token that appears (starts with `ghp_`) — you only see it once
7. Paste it as the password

## Step 1.3 — Watch the check run

Go to <https://github.com/Yogi15490/grihasti/actions>

You'll see a yellow dot that turns green or red in a few minutes.

**If it's red, that's expected and useful.** Click into it, click the failed
step, copy the error text, and paste it to me. That's the whole point of this
setup — the errors come to me automatically instead of you screenshotting them.

**Stop here if you just wanted the code backed up and checked.** Phases 2 and 3
are only needed when you want grihasti.in actually live.

---

# PHASE 2 — Let GitHub deploy to your server (15 minutes)

This is the bit you asked about. In plain terms: GitHub needs permission to log
into your Hetzner server, the same way you do with `ssh root@...`. You give it
permission by creating a special key and telling GitHub about it.

You'll create a **pair** of keys:

- a **public** key → goes on the server (safe to share)
- a **private** key → goes into GitHub (secret, never share)

## Step 2.1 — Create the key pair

On your Mac:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/grihasti_deploy -N "" -C "github-actions-grihasti"
```

It prints some art. That's normal. You now have two new files.

## Step 2.2 — Put the public key on your server

```bash
cat ~/.ssh/grihasti_deploy.pub | ssh root@178.105.230.228 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && echo ADDED"
```

It should print `ADDED`. It may ask for your server password first.

Check it worked:

```bash
ssh -i ~/.ssh/grihasti_deploy root@178.105.230.228 "echo IT WORKS"
```

If that prints `IT WORKS`, the key is good. Type `exit` if you end up in a
server prompt.

## Step 2.3 — Copy the private key

```bash
pbcopy < ~/.ssh/grihasti_deploy
```

Nothing visible happens — the key is now on your clipboard. Don't copy anything
else until Step 2.5.

## Step 2.4 — Open the secrets page

Go to:

<https://github.com/Yogi15490/grihasti/settings/secrets/actions>

If that 404s, navigate manually: your repo → **Settings** tab → in the left
sidebar find **Secrets and variables** → click it → click **Actions**.

## Step 2.5 — Add the key secret

1. Click the green **New repository secret** button (top right)
2. **Name:** type exactly `SERVER_SSH_KEY`
3. Click in the big **Secret** box
4. Press **Cmd+V** to paste
5. Check the pasted text starts with `-----BEGIN OPENSSH PRIVATE KEY-----`
   and ends with `-----END OPENSSH PRIVATE KEY-----`
6. Click **Add secret**

## Step 2.6 — Add the server address secret

1. Click **New repository secret** again
2. **Name:** type exactly `SERVER_HOST`
3. **Secret:** type `178.105.230.228`
4. Click **Add secret**

You should now see two secrets listed. GitHub hides their values forever —
that's normal and correct.

---

# PHASE 3 — Set up the server (20 minutes)

Only do this when you're ready for grihasti.in to be live.

Your server already runs a program called Caddy that handles web traffic for
workrize.in, coldpressery.in and farmsae.com. Grihasti needs to sit behind that
same Caddy rather than starting its own, or they'd fight over the same ports.

## Step 3.1 — Log into the server

```bash
ssh root@178.105.230.228
```

Everything in Phase 3 runs **on the server**. Your prompt should end in `#`.

## Step 3.2 — Create the shared network

```bash
docker network create edge || echo "already exists — fine"
```

## Step 3.3 — Put Caddy on that network

```bash
nano /root/workrize/docker-compose.yml
```

Find the `caddy:` section. Under it, at the same indentation as `restart:` and
`ports:`, add this line:

```yaml
    networks: [default, edge]
```

Then go to the very bottom of the file and add:

```yaml
networks:
  edge:
    external: true
```

Save: **Ctrl+O**, then **Enter**, then **Ctrl+X**.

## Step 3.4 — Tell Caddy about grihasti.in

```bash
nano /root/workrize/Caddyfile
```

Go to the very bottom and add:

```
grihasti.in, www.grihasti.in {
	tls {
		client_auth {
			mode require_and_verify
			trust_pool file /etc/caddy/cf-origin-pull-ca.pem
		}
	}
	reverse_proxy grihasti-web:3000
}
```

Save: **Ctrl+O**, **Enter**, **Ctrl+X**.

## Step 3.5 — Get the code onto the server

```bash
cd /root
git clone https://github.com/Yogi15490/grihasti.git
cd grihasti
```

It'll ask for your username and the token from Step 1.2.

## Step 3.6 — Create the secrets file

First generate a database password:

```bash
openssl rand -base64 32
```

Copy the line it prints. Then:

```bash
nano /root/grihasti/.env
```

Paste this in, replacing `PASTE_PASSWORD_HERE` with what you just copied:

```
DB_NAME=grihasti
DB_USER=grihasti
DB_PASSWORD=PASTE_PASSWORD_HERE

NEXT_PUBLIC_SITE_URL=https://grihasti.in
GST_RATE=0.18

RESEND_API_KEY=
EMAIL_FROM="Grihasti <hello@grihasti.in>"
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=
NEXT_PUBLIC_META_PIXEL_ID=
```

Save: **Ctrl+O**, **Enter**, **Ctrl+X**.

The empty ones get filled in as those accounts arrive — see
`docs/GO_LIVE_ACCOUNTS.md`. The site runs without them; only email sign-in and
payments need them.

## Step 3.7 — Start it

```bash
cd /root/grihasti && docker compose up -d --build
```

First build takes a few minutes. Then restart Caddy so it picks up the changes:

```bash
cd /root/workrize && docker compose up -d
```

Check it's running:

```bash
docker ps | grep grihasti
```

You should see `grihasti-web` and `grihasti-db`.

## Step 3.8 — Point the domain

1. Log into Cloudflare
2. Select **grihasti.in**
3. Go to **DNS**
4. Add a record:
   - **Type:** A
   - **Name:** `@`
   - **IPv4 address:** `178.105.230.228`
   - **Proxy status:** Proxied (orange cloud ON)
5. Save
6. Add a second record the same way, but **Name:** `www`

Wait a couple of minutes, then open <https://grihasti.in>

---

# From now on

You never touch the server again. Your loop is:

```bash
cd ~/Projects/grihasti
# ... changes happen ...
npm run verify     # must pass
git add -A
git commit -m "what changed"
git push
```

Push → GitHub checks it → if green, it deploys itself. If red, nothing deploys
and the error is waiting in the Actions tab for me to read.

---

# If something goes wrong

**`git push` says permission denied** → see the HTTPS fallback in Step 1.2.

**Actions tab shows red** → click the run, click the red step, copy the error,
paste it to me.

**grihasti.in shows an error page** → on the server run:

```bash
cd /root/grihasti && docker compose logs --tail 50 web
```

Copy what it prints and paste it to me.

**You want to start the local database over** → on your Mac:

```bash
cd ~/Projects/grihasti && rm -rf .local-db && npm run dev
```
