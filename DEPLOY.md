# Grihasti — deployment

Same pattern as workrize: GitHub is the source of truth, CI gates every push,
`main` deploys itself over SSH to the Hetzner box. The server is a read-only
deploy target — never edit files on it.

Grihasti becomes the fourth site on the existing box, alongside workrize.in,
coldpressery.in and farmsae.com.

---

## Part 1 — GitHub (do this once, on your Mac)

The repo is already initialised and committed locally, with the remote set.
Two things left, both needing your GitHub account:

**1. Create the empty repo** at <https://github.com/new>

- Owner: `Yogi15490`
- Name: `grihasti`
- **Private**
- Do **not** add a README, .gitignore or licence — the repo already has them

**2. Push**

```bash
cd ~/Projects/grihasti
git push -u origin main
```

That triggers CI immediately. Watch it at
<https://github.com/Yogi15490/grihasti/actions>.

**Expect the first run to go red.** The app has never been through a production
compile, and `next build` is stricter than the dev server. That's the point of
having CI — it finds these instead of you finding them in a browser. Paste any
failure to me and I'll fix it.

---

## Part 2 — GitHub secrets

Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `SERVER_HOST` | `178.105.230.228` |
| `SERVER_SSH_KEY` | The same deploy private key workrize uses |

Reuse the workrize key — it's the same box and the same access.

---

## Part 3 — Server, one-time setup

The existing Caddy owns ports 80/443, so grihasti does **not** run its own.
Both stacks join a shared Docker network and Caddy proxies across it.

SSH in (`ssh root@178.105.230.228`), then:

**1. Create the shared network**

```bash
docker network create edge 2>/dev/null || echo "already exists"
```

**2. Put the existing Caddy on it**

Edit `/root/workrize/docker-compose.yml`. Add to the `caddy` service:

```yaml
    networks: [default, edge]
```

and at the bottom of the file:

```yaml
networks:
  edge:
    external: true
```

**3. Add the grihasti site block** to `/root/workrize/Caddyfile`:

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

> Uses Caddy's automatic TLS like farmsae/coldpressery. If you'd rather use a
> Cloudflare origin cert as workrize.in does, add
> `tls /etc/caddy/grihasti-origin.crt /etc/caddy/grihasti-origin.key` and mount
> those files — but automatic is fine behind Cloudflare proxying.

**4. Clone grihasti and write its `.env`**

```bash
cd /root
git clone git@github.com:Yogi15490/grihasti.git
cd grihasti
```

Create `/root/grihasti/.env` — never commit this file:

```bash
DB_NAME=grihasti
DB_USER=grihasti
DB_PASSWORD=<generate a long random password>

NEXT_PUBLIC_SITE_URL=https://grihasti.in
GST_RATE=0.18

# Fill in as they arrive — see docs/GO_LIVE_ACCOUNTS.md
RESEND_API_KEY=
EMAIL_FROM="Grihasti <hello@grihasti.in>"
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=
NEXT_PUBLIC_META_PIXEL_ID=
```

Generate the password with `openssl rand -base64 32`.

**5. Bring it up**

```bash
cd /root/grihasti && docker compose up -d --build
cd /root/workrize && docker compose up -d   # picks up the Caddyfile + network
```

**6. Point DNS.** In Cloudflare, `grihasti.in` A record → `178.105.230.228`,
proxied (orange cloud).

---

## After that, deploys are automatic

```
push to main → CI runs boundary check, typecheck, build, tests, migrations
             → if green, SSH to the box, git pull, docker compose up -d --build
             → migrations apply on container start, then the server boots
```

Nothing manual. If CI is red, nothing deploys.

---

## Migrations

`scripts/migrate.mjs` runs automatically on every container start. It applies
`db/migrations/*.sql` in order and records each in a `schema_migrations` table,
so re-running is a no-op.

Two rules:

- **Never edit an applied migration.** The runner warns if a checksum changes
  but won't re-run it, so your database and your files silently diverge. Add a
  new numbered migration instead.
- **Migrations are append-only, like the ledger they protect.**

---

## Backups — do this before taking a real order

The points ledger records money owed to customers. Losing it doesn't erase the
liability, it just makes it uncomputable.

```bash
# On the server, add to root's crontab:
15 3 * * * cd /root/grihasti && docker compose exec -T db \
  pg_dump -U grihasti grihasti | gzip > /var/backups/grihasti-$(date +\%F).sql.gz
```

`scripts/backup.sh` and `scripts/restore-drill.sh` do this properly, including
offsite copy and a verified restore. **Run the restore drill once before
launch** — an untested backup is a hypothesis.

---

## Rollback

```bash
cd /root/grihasti
git log --oneline -5
git checkout <good-sha>
docker compose up -d --build
```

Note this rolls back *code*, not schema. Migrations are forward-only; a rollback
past a schema change needs a new migration to undo it.
