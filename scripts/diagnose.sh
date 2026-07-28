#!/usr/bin/env bash
#
# Grihasti — one-shot diagnostics. Run ON THE SERVER as root:
#
#   bash /root/grihasti/scripts/diagnose.sh
#
# Prints everything needed to work out why the site isn't loading, in one go.
# Read-only: changes nothing.

DOMAIN="${DOMAIN:-grihasti.in}"
APP_DIR="${APP_DIR:-/root/grihasti}"
WORKRIZE_DIR="${WORKRIZE_DIR:-/root/workrize}"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
hdr()  { printf '\n\033[1m── %s ─────────────────────────\033[0m\n' "$*"; }

hdr "1. Containers"
if docker ps --filter name=grihasti --format '{{.Names}}' | grep -q grihasti-web; then
  docker ps --filter name=grihasti --format '  {{.Names}}  {{.Status}}'
  ok "grihasti containers are running"
else
  bad "grihasti-web is NOT running"
  echo "  All containers:"
  docker ps --format '    {{.Names}}  {{.Status}}'
  echo ""
  echo "  Last 30 log lines:"
  (cd "$APP_DIR" 2>/dev/null && docker compose logs --tail 30 web 2>&1 | sed 's/^/    /')
fi

hdr "2. Does the app answer inside the container?"
if docker exec grihasti-web node -e \
    "fetch('http://127.0.0.1:3000/login').then(r=>{console.log('  HTTP',r.status);process.exit(r.ok?0:1)}).catch(e=>{console.log('  ',e.message);process.exit(1)})" 2>/dev/null; then
  ok "App responds on port 3000"
else
  bad "App is NOT responding on port 3000 — this is an app problem, not a network one"
  (cd "$APP_DIR" && docker compose logs --tail 40 web 2>&1 | sed 's/^/    /')
fi

hdr "3. Networking — can Caddy see grihasti?"
CADDY="$(docker ps --format '{{.Names}}' | grep -i caddy | head -1)"
if [ -z "$CADDY" ]; then
  bad "No Caddy container running"
else
  ok "Caddy container: $CADDY"
  CADDY_NETS="$(docker inspect "$CADDY" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
  WEB_NETS="$(docker inspect grihasti-web --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null)"
  echo "    Caddy networks : $CADDY_NETS"
  echo "    grihasti-web   : $WEB_NETS"

  SHARED=""
  for n in $CADDY_NETS; do
    case " $WEB_NETS " in *" $n "*) SHARED="$n";; esac
  done

  if [ -n "$SHARED" ]; then
    ok "Both on shared network: $SHARED"
    if docker exec "$CADDY" wget -q -T 5 -O /dev/null http://grihasti-web:3000/login 2>/dev/null; then
      ok "Caddy CAN reach grihasti-web:3000"
    else
      bad "Caddy CANNOT reach grihasti-web:3000 (DNS or firewall inside Docker)"
    fi
  else
    bad "NO SHARED NETWORK — Caddy cannot possibly reach grihasti-web"
    warn "Fix: set WORKRIZE_NETWORK in $APP_DIR/.env to one of Caddy's networks,"
    warn "     then: cd $APP_DIR && docker compose up -d"
  fi
fi

hdr "4. Caddyfile"
if grep -q "$DOMAIN" "$WORKRIZE_DIR/Caddyfile" 2>/dev/null; then
  ok "Caddyfile has a $DOMAIN block:"
  grep -A 10 "^$DOMAIN" "$WORKRIZE_DIR/Caddyfile" | sed 's/^/    /'
else
  bad "Caddyfile has NO $DOMAIN block — run scripts/server-setup.sh"
fi

hdr "5. Certificate status"
if [ -n "$CADDY" ]; then
  CERTLOG="$(docker logs "$CADDY" 2>&1 | grep -i "$DOMAIN" | grep -iE "certificate|acme|obtain|error|fail" | tail -10)"
  if [ -n "$CERTLOG" ]; then
    echo "$CERTLOG" | sed 's/^/    /'
  else
    warn "No certificate log lines mentioning $DOMAIN yet"
  fi
fi

hdr "6. Recent Caddy errors"
if [ -n "$CADDY" ]; then
  docker logs "$CADDY" --since 30m 2>&1 | grep -iE "error|warn" | tail -15 | sed 's/^/    /' \
    || echo "    (none)"
fi

hdr "7. DNS — where does $DOMAIN point?"
MYIP="$(curl -s -4 --max-time 5 ifconfig.me 2>/dev/null)"
echo "    This server: ${MYIP:-unknown}"
for h in "$DOMAIN" "www.$DOMAIN"; do
  RES="$(getent hosts "$h" 2>/dev/null | awk '{print $1}' | tr '\n' ' ')"
  if [ -n "$RES" ]; then
    echo "    $h -> $RES"
  else
    bad "$h does not resolve"
  fi
done
warn "Cloudflare-proxied domains resolve to Cloudflare IPs (104.x / 172.67.x)."
warn "That is CORRECT — it does not mean DNS is wrong."

hdr "8. Local HTTPS handshake test"
if [ -n "$MYIP" ]; then
  echo "    Pretending to be Cloudflare, without a client certificate:"
  RESULT="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
    --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" -k 2>&1)"
  echo "    -> $RESULT"
  echo ""
  warn "If that failed with a TLS/handshake error, the cause is almost certainly"
  warn "Cloudflare 'Authenticated Origin Pulls' being OFF for this zone."
  warn "The Caddyfile requires a client certificate; Cloudflare only sends one"
  warn "when that setting is enabled per-zone. See GO_LIVE_NOW.md."
fi

printf '\n\033[1mCopy everything above and paste it back.\033[0m\n\n'
