#!/usr/bin/env bash
# Double-click this to give grihasti.in its own front door - the fourth floor
# in the building, after Stonaria, Workrize and lifetrack.
#
# Two halves. It STOPS between them.
#
#   PART 1  Runs the full grihasti gate, pushes, waits for CI to deploy, and
#           PROVES the new gate serves the site. Nothing is routed to it, so
#           nothing visible changes and there is nothing to undo.
#   PART 2  Points the building guard at it. Asks first. One line, and the
#           rollback is the same line back.
#
# NOTE ON STYLE: no apostrophes or backticks outside a heredoc. macOS bash
# 3.2 rejects the WHOLE file when it dislikes a quote.
cd "$(dirname "$0")"
SERVER="${SERVER:-root@178.105.230.228}"

die() { printf "\n   STOPPED: %s\n\n" "$1"; \
        read -n 1 -s -r -p "Press any key to close this window."; exit 1; }

echo "============================================"
echo "  GRIHASTI - give it its own floor"
echo "============================================"
echo
echo "Today grihasti-web sits inside WORKRIZE network so the guard can"
echo "reach it. Afterwards it has a gate of its own on the corridor."
echo
echo "No Cloudflare on this domain - it takes a Let's Encrypt certificate"
echo "at the guard, and that does not change."
echo

# ── PART 1 — ship the gate, idle ─────────────────────────────────────────
echo "PART 1 - ship the gate, with nobody routed to it"
echo

if [ -f .git/index.lock ]; then
  pgrep -x git >/dev/null 2>&1 && die "a git process is running."
  [ -n "$(find .git/index.lock -mmin +1 2>/dev/null)" ] \
    || die "a fresh git lock. Wait a minute and run this again."
  rm -f .git/index.lock && echo "   (cleared a stale git lock)"
fi

if [ -z "$(git status --porcelain)" ]; then
  echo "   nothing to push - already shipped"
else
  echo "   running the hard gate: boundaries, types, next build, tests."
  echo "   This is the slow one. Give it a few minutes."
  echo
  npm run verify || die "the Grihasti gate failed. Nothing was committed."
  echo
  git add -A || die "could not stage"
  git commit -q -F - <<"MSG"
Grihasti becomes a floor: its own gate on the corridor

Until now this project had no front door of its own. Its web container
joined WORKRIZE compose network so that Workrize Caddy - the front door for
the whole machine - could reach grihasti-web:3000 by name. The comment at
the top of docker-compose.yml explained why, and it was sound: a second
Caddy would have fought the first for ports 80 and 443.

That stopped being true on 6 August 2026, when the machine was reorganised
into a building. A guard at /root/edge owns 80 and 443 and belongs to no
site. Nothing has to live inside a neighbour stack any more.

THE COLLISION THIS CLOSES IS NOT THEORETICAL. Compose publishes the SERVICE
NAME as a network alias, and this project service is called `web`. So is
Workrize. While both sit on workrize_default the bare name `web` resolves
there to whichever container Docker prefers - and that is exactly how every
visitor to workrize.in was handed Stonaria application for seven days in
July. The `legacy` network stays on `web` only for the crossover and comes
off in a follow-up commit.

The gate is in this file rather than an overlay on purpose: CI deploys with
a plain `docker compose up -d`, so a gate defined anywhere else would not
exist after the next push, and the guard would be pointing at nothing.

Also corrects PROJECT_STATE, which claimed this site was behind Cloudflare
and served by a shared Caddy. Neither was true.
MSG
  [ $? -eq 0 ] || die "the commit failed."
  git push -q || die "the push failed."
  echo "   pushed. CI is deploying."
fi

echo
echo "   waiting for the gate to appear on the server (up to 4 minutes)..."
found=no
for i in $(seq 1 24); do
  if ssh -o ConnectTimeout=10 "$SERVER" \
       "docker ps --format '{{.Names}}' | grep -qx grihasti-gate" 2>/dev/null; then
    found=yes; break
  fi
  sleep 10
  printf "."
done
echo
if [ "$found" != "yes" ]; then
  echo "   The gate has not appeared. CI may still be running, or it failed."
  echo "   Check the Actions tab on GitHub. Nothing has been routed anywhere,"
  echo "   so grihasti.in is exactly as it was."
  die "gate not up yet"
fi
echo "   the gate is up."

echo
ssh "$SERVER" "bash -s" <<"REMOTE"
set -uo pipefail
echo "=== what is running ==="
docker ps --format '{{.Names}}\t{{.Status}}' | grep grihasti | sed 's/^/    /'

echo
echo "=== is the gate on the corridor? ==="
docker network inspect edge --format '{{range .Containers}}{{.Name}} {{end}}' \
  | tr ' ' '\n' | grep . | sed 's/^/    /'

echo
echo "=== PROVING THE FLOOR WORKS BEFORE ANYTHING IS ROUTED TO IT ==="
out=$(docker run --rm --network edge curlimages/curl:latest \
        -sI -H "Host: grihasti.in" http://grihasti-gate:8080/ 2>&1 | head -4)
echo "$out" | sed 's/^/    /'
echo
if echo "$out" | grep -qE "HTTP/[0-9.]+ 200"; then
  echo "    GOOD: the gate serves the site."
elif echo "$out" | grep -qE "HTTP/[0-9.]+ 30[178]"; then
  echo "    STOP. That is a REDIRECT - the loop, caught early."
  echo "    Do NOT continue."
  exit 1
else
  echo "    STOP. Not a 200. A 502 means the gate cannot reach web:3000."
  exit 1
fi
REMOTE

[ $? -eq 0 ] || die "Part 1 did not pass. Nothing was routed anywhere."

# ── PART 2 — the cutover ─────────────────────────────────────────────────
echo
echo "============================================"
echo "PART 2 - point the guard at the gate"
echo "============================================"
echo
printf "Type  yes  to continue, or anything else to stop here: "
read -r answer
if [ "$answer" != "yes" ]; then
  echo
  echo "Stopped. The gate is running and idle, which is harmless."
  read -n 1 -s -r -p "Press any key to close this window."
  exit 0
fi

echo
ssh "$SERVER" "bash -s" <<"REMOTE"
set -uo pipefail
CONF=/root/edge/conf.d/grihasti.caddy
[ -f "$CONF" ] || { echo "no $CONF"; exit 1; }

echo "=== 1. repointing ==="
cp "$CONF" "$CONF.before-floor"
sed -i 's/reverse_proxy grihasti-web:3000/reverse_proxy grihasti-gate:8080/' "$CONF"
if grep -q 'grihasti-gate:8080' "$CONF"; then
  echo "    guard now targets grihasti-gate:8080"
else
  echo "    EDIT DID NOT APPLY - restoring and stopping"
  mv "$CONF.before-floor" "$CONF"
  exit 1
fi

echo
echo "=== 2. reloading the guard ==="
cd /root/edge && ./reload.sh || {
  echo "    RELOAD REFUSED. Restoring."
  mv "$CONF.before-floor" "$CONF"
  ./reload.sh
  exit 1
}

echo
echo "=== 3. checking - and grihasti CAN be checked from here ==="
for i in 1 2 3; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://grihasti.in/ 2>/dev/null)
  echo "    https://grihasti.in/ -> ${code:-no answer}"
  [ "$code" = "200" ] && break
  sleep 4
done
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://stonaria.com/ 2>/dev/null)
echo "    https://stonaria.com/ -> ${code:-no answer}"

if [ "$code" != "200" ]; then
  echo "    Stonaria is not answering. Restoring grihasti and stopping."
  mv "$CONF.before-floor" "$CONF"
  cd /root/edge && ./reload.sh
  exit 1
fi
REMOTE

status=$?
echo
if [ $status -ne 0 ]; then
  echo "Part 2 failed and put the guard back. grihasti.in is served the old"
  echo "way, as it was. Send the output to Claude."
  read -n 1 -s -r -p "Press any key to close this window."
  exit 1
fi

cat <<"NOTE"
--------------------------------------------
Open https://grihasti.in in a private window and click through the shop,
the cart and sign-in. This one CAN be curled, and was above - but a 200 on
the homepage is not the same as checkout working.

STILL OWED, in a day or two:
  Take `legacy` off `web` in docker-compose.yml - the last thing keeping a
  grihasti container inside Workrize network, and the name collision with
  Workrize own `web` service. One line, then ship normally.

TO ROLL BACK, in a SERVER window:

  cp /root/edge/conf.d/grihasti.caddy.before-floor /root/edge/conf.d/grihasti.caddy
  cd /root/edge && ./reload.sh
--------------------------------------------
NOTE
echo
read -n 1 -s -r -p "Press any key to close this window."
