#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 02 · MIGRATE — guided move of Vaultwarden from Docker to rootless Podman
# (Quadlet). Prompts before every irreversible-looking step. Requires
# 01-vw-precheck.sh to have run first (uses its discovered state).
# Rollback at any point: systemctl --user stop vaultwarden &&
#   docker start vaultwarden   (original data dir is never modified).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/vw-migration.conf"
[ -f "$VW_STATE" ] || { echo "No state file — run 01-vw-precheck.sh first."; exit 1; }
source "$VW_STATE"

step() { echo; echo "══ $* ══"; }
confirm() { read -r -p "$1 [y/N] " a; [[ "$a" =~ ^[Yy]$ ]] || { echo "Stopped (nothing broken — rerun to resume)."; exit 1; }; }

: "${VW_HOST_PORT:?precheck did not find a loopback port; set VW_HOST_PORT in state file}"
: "${VW_DATA_SRC:?precheck did not find the /data mount}"
IMAGE_REF="${VW_IMAGE_DIGEST:-$VW_IMAGE}"

echo "Migration plan:"
echo "  image       : $IMAGE_REF"
echo "  publish     : 127.0.0.1:$VW_HOST_PORT → 80   (identical to today: Tailscale Serve untouched)"
echo "  old data    : $VW_DATA_SRC   (left untouched, becomes the rollback copy)"
echo "  new home    : $VW_NEW_HOME"
confirm "Proceed?"

# ── 1. stop docker container + cold (consistent) backup ─────────────────────
step "1/6 Stop Docker container + cold backup"
if [ -n "$VW_COMPOSE_FILE" ]; then
  docker compose -f "$VW_COMPOSE_FILE" stop "$VW_CONTAINER"
else
  docker stop "$VW_CONTAINER"
fi
TS="$(date +%Y%m%d-%H%M%S)"
COLD="$VW_BACKUP_DIR/vaultwarden-cold-$TS.tar.gz"
sudo tar -czf "$COLD" -C "$(dirname "$VW_DATA_SRC")" "$(basename "$VW_DATA_SRC")" \
  || tar -czf "$COLD" -C "$(dirname "$VW_DATA_SRC")" "$(basename "$VW_DATA_SRC")"
sha256sum "$COLD" | tee "$COLD.sha256"
if command -v sqlite3 >/dev/null; then
  TMPDB="$(mktemp -d)"; tar -xzf "$COLD" -C "$TMPDB"
  DB="$(find "$TMPDB" -name 'db.sqlite3' | head -1)"
  if [ -n "$DB" ] && [ "$(sqlite3 "$DB" 'PRAGMA integrity_check;')" = "ok" ]; then
    echo "  sqlite integrity_check on the backup copy: ok"
  else
    echo "  !! sqlite integrity check FAILED on backup — do not proceed"; exit 1
  fi
  rm -rf "$TMPDB"
else
  echo "  (sqlite3 not installed on host — integrity check skipped; apt install sqlite3 to enable)"
fi
echo "  cold backup: $COLD"

# ── 2. copy data into the rootless home ─────────────────────────────────────
step "2/6 Copy data → $VW_NEW_HOME/data"
mkdir -p "$VW_NEW_HOME"
sudo rsync -a "$VW_DATA_SRC/" "$VW_NEW_HOME/data/" || rsync -a "$VW_DATA_SRC/" "$VW_NEW_HOME/data/"
sudo chown -R "$(id -u):$(id -g)" "$VW_NEW_HOME/data" 2>/dev/null || true
# map ownership for the container's user-namespace:
#  - container runs as root inside  → host user must own the files (already does)
#  - container runs as UID N inside → files must map to subuid N
case "$VW_CONTAINER_USER" in
  root*|"" ) echo "  container user is root-in-container → host-user ownership is correct" ;;
  * ) UIDN="${VW_CONTAINER_USER%%:*}"
      echo "  container user is $VW_CONTAINER_USER → mapping ownership via podman unshare"
      podman unshare chown -R "$UIDN:$UIDN" "$VW_NEW_HOME/data" ;;
esac

# ── 3. environment file (secrets never pass through this script) ────────────
step "3/6 Environment file"
ENVF="$VW_NEW_HOME/vaultwarden.env"
if [ ! -f "$ENVF" ]; then
  docker inspect "$VW_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -vE '^(PATH|HOME|HOSTNAME|TERM|ROCKET_PROFILE)=' > "$ENVF"
  chmod 600 "$ENVF"
  echo "  wrote $ENVF from the container's current env (chmod 600) — review it now:"
  grep -oE '^[A-Z0-9_]+' "$ENVF" | sed 's/^/    /'
  confirm "Env file looks right (names above; values not shown)?"
else
  echo "  $ENVF already exists — keeping it"
fi

# ── 4. install the Quadlet unit ──────────────────────────────────────────────
step "4/6 Install Quadlet unit"
if [ "${VW_QUADLET:-yes}" != "yes" ]; then
  echo "  podman < 4.4 detected: use README appendix A (podman generate systemd) instead."
  exit 1
fi
QDIR="$HOME/.config/containers/systemd"
mkdir -p "$QDIR"
sed -e "s|__IMAGE__|$IMAGE_REF|" \
    -e "s|__PORT__|$VW_HOST_PORT|" \
    -e "s|__HOME__|$VW_NEW_HOME|" \
    "$DIR/vaultwarden.container" > "$QDIR/vaultwarden.container"
echo "  installed → $QDIR/vaultwarden.container"
loginctl enable-linger "$(id -un)" 2>/dev/null || sudo loginctl enable-linger "$(id -un)"
systemctl --user daemon-reload

# ── 5. start + smoke test ────────────────────────────────────────────────────
step "5/6 Start under systemd (rootless podman)"
systemctl --user start vaultwarden.service
sleep 4
systemctl --user --no-pager --lines 6 status vaultwarden.service || true
for i in $(seq 1 15); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${VW_HOST_PORT}/alive" || true)
  [ "$CODE" = "200" ] && break; sleep 2
done
if [ "${CODE:-}" != "200" ]; then
  echo "  !! /alive not healthy after start — check: journalctl --user -u vaultwarden -e"
  echo "  Rollback: systemctl --user stop vaultwarden && docker start $VW_CONTAINER"
  exit 1
fi
echo "  /alive → 200 under rootless podman ✔"

# ── 6. retire (don't delete) the docker side ─────────────────────────────────
step "6/6 Retire the Docker container"
echo "  Keeping the old container + data for rollback. To prevent accidental"
echo "  restarts (e.g. docker compose up -d bringing it back on the same port):"
if [ -n "$VW_COMPOSE_FILE" ]; then
  echo "   → edit $VW_COMPOSE_FILE: comment the vaultwarden service out, or give it"
  echo "     profiles: [\"retired\"] so plain 'up -d' skips it. Also remove/ignore its WUD labels."
else
  docker update --restart=no "$VW_CONTAINER"
  echo "   → set restart policy to 'no' on the old container"
fi
echo
echo "DONE. Now run 03-vw-postcheck.sh, update the blackbox/Homepage wiring"
echo "(README §Monitoring, §Homepage), and after 1–2 weeks of clean operation:"
echo "  docker rm $VW_CONTAINER  and archive $VW_DATA_SRC"
