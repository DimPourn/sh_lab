#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 03 · POST-CHECK — run on the Pi AFTER 02-vw-migrate.sh (and again after the
# monitoring rewire, and once more after a reboot). Verifies:
#   service health · rootless/hardening claims · end-to-end HTTPS path ·
#   Prometheus/blackbox (what Grafana renders) · Homepage wiring · rollback
#   safety. Read-only: changes nothing.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/vw-migration.conf"
[ -f "$VW_STATE" ] && source "$VW_STATE"

PASS=0; FAIL=0; WARN=0
ok()   { echo "  [PASS] $*"; PASS=$((PASS+1)); }
bad()  { echo "  [FAIL] $*"; FAIL=$((FAIL+1)); }
warn() { echo "  [WARN] $*"; WARN=$((WARN+1)); }
hdr()  { echo; echo "── $* ─────────────────────────────"; }

PORT="${VW_HOST_PORT:-}"

# ── 1. unit + container health ───────────────────────────────────────────────
hdr "1. Service health (systemd user unit + podman)"
if systemctl --user is-active --quiet vaultwarden.service; then
  ok "systemd user unit active"
else
  bad "vaultwarden.service not active → journalctl --user -u vaultwarden -e"
fi
HS="$(podman inspect vaultwarden --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)"
[ "$HS" = "healthy" ] && ok "podman healthcheck: healthy" || warn "podman health status: $HS (may need HealthStartPeriod to elapse)"
if [ -n "$PORT" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/alive" || true)
  [ "$CODE" = "200" ] && ok "/alive on 127.0.0.1:$PORT → 200" || bad "/alive returned '$CODE'"
fi
LINGER="$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)"
[ "$LINGER" = "yes" ] && ok "lingering enabled — survives logout/reboot" || bad "lingering OFF: service dies on logout (loginctl enable-linger $(id -un))"

# ── 2. the security claims, verified not assumed ─────────────────────────────
hdr "2. Rootless + hardening verification"
PIDMAIN="$(podman inspect vaultwarden --format '{{.State.Pid}}' 2>/dev/null || echo)"
if [ -n "$PIDMAIN" ] && [ -e "/proc/$PIDMAIN/status" ]; then
  HOSTUID="$(awk '/^Uid:/{print $2}' "/proc/$PIDMAIN/status")"
  if [ "$HOSTUID" = "0" ]; then bad "container process runs as HOST root — not rootless!";
  else ok "container 'root' is host UID $HOSTUID (unprivileged) — user-namespace isolation confirmed"; fi
  CAPEFF="$(awk '/^CapEff:/{print $2}' "/proc/$PIDMAIN/status")"
  [ "$CAPEFF" = "0000000000000000" ] && ok "CapEff = 0 — every Linux capability dropped" \
                                      || warn "CapEff = $CAPEFF (expected all zeros with DropCapability=all)"
  NNP="$(awk '/^NoNewPrivs:/{print $2}' "/proc/$PIDMAIN/status")"
  [ "$NNP" = "1" ] && ok "NoNewPrivs = 1 — privilege escalation blocked" || bad "NoNewPrivs = $NNP"
else
  bad "could not resolve container PID for verification"
fi
docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "vaultwarden" \
  && bad "OLD docker container is RUNNING too — port conflict risk; stop it" \
  || ok "no docker copy running — rootless podman is the only instance"

# ── 3. end-to-end path (what your devices actually use) ──────────────────────
hdr "3. End-to-end HTTPS via Tailscale Serve"
if [ -n "$VW_TAILNET_URL" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$VW_TAILNET_URL/alive" || true)
  [ "$CODE" = "200" ] && ok "$VW_TAILNET_URL/alive → 200 (serve → loopback → podman, full path OK)" \
                      || bad "tailnet URL returned '$CODE' — check 'tailscale serve status'"
else
  warn "VW_TAILNET_URL not set — set it in vw-migration.conf for the end-to-end check"
fi
echo "  [MANUAL] open the Bitwarden app on one device: force a sync, confirm items,"
echo "           add a throwaway entry, delete it. (Client-side proof the DB is live.)"

# ── 4. Prometheus / blackbox — this is what Grafana renders ──────────────────
hdr "4. Prometheus & Grafana visibility ($VW_PROM_URL)"
Q() { curl -fsS "$VW_PROM_URL/api/v1/query" --data-urlencode "query=$1" 2>/dev/null; }
RES="$(Q 'probe_success{instance=~"(?i).*vault.*"}')"
VAL="$(echo "$RES" | python3 -c 'import json,sys
d=json.load(sys.stdin);r=d["data"]["result"]
print("\n".join(f"{m[\"metric\"].get(\"instance\")} = {m[\"value\"][1]}" for m in r) if r else "")' 2>/dev/null)"
if [ -z "$VAL" ]; then
  warn "no probe_success series matching 'vault' — blackbox target not yet rewired (README §Monitoring), or Prometheus unreachable from here"
else
  echo "$VAL" | while read -r line; do
    case "$line" in *"= 1") echo "  [PASS] blackbox probe UP: $line";; *) echo "  [FAIL] blackbox probe DOWN: $line";; esac
  done
  echo "$VAL" | grep -q "= 1" && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
fi
PENDING="$(Q 'ALERTS{alertstate="firing",alertname=~"(?i).*(vault|blackbox|probe).*"}' \
  | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["data"]["result"]))' 2>/dev/null || echo "?")"
[ "$PENDING" = "0" ] && ok "no firing alerts mention vaultwarden/probe" \
                     || warn "firing alerts related to probes: $PENDING — check Alertmanager/ntfy"
echo "  [MANUAL] Grafana: open the uptime/blackbox dashboard — the vaultwarden panel"
echo "           reads these same series, so PASS above = green panel. If the panel"
echo "           filters by the OLD instance URL, update its query/variable to the new one."
echo "  [NOTE ] cAdvisor no longer sees this container (it left Docker). Resource graphs"
echo "          for vaultwarden go dark unless you add prometheus-podman-exporter (README §Metrics)."

# ── 5. Homepage ───────────────────────────────────────────────────────────────
hdr "5. Homepage wiring"
if [ -n "$VW_HOMEPAGE_CONFIG" ] && [ -f "$VW_HOMEPAGE_CONFIG/services.yaml" ]; then
  BLOCK="$(grep -A8 -i 'vault' "$VW_HOMEPAGE_CONFIG/services.yaml" || true)"
  if [ -z "$BLOCK" ]; then
    warn "no vaultwarden entry in services.yaml"
  elif echo "$BLOCK" | grep -qE '^\s*(server|container):'; then
    bad "Homepage still uses the docker integration for vaultwarden — tile is dead; switch to siteMonitor (README §Homepage)"
  else
    ok "Homepage entry is URL-based"
    echo "$BLOCK" | grep -oE 'https?://[^" ]+' | sed 's/^/  target: /'
    echo "  [MANUAL] open Homepage and confirm the vaultwarden tile shows UP —"
    echo "           remember Homepage probes from INSIDE its container: it cannot reach"
    echo "           host 127.0.0.1; the URL must be the tailnet HTTPS one (README §Homepage)."
  fi
else
  warn "VW_HOMEPAGE_CONFIG not set — Homepage config check skipped"
fi

# ── 6. rollback safety net still intact ──────────────────────────────────────
hdr "6. Rollback safety"
LATEST="$(ls -1t "$VW_BACKUP_DIR"/vaultwarden-cold-*.tar.gz 2>/dev/null | head -1)"
if [ -n "$LATEST" ] && sha256sum -c "$LATEST.sha256" >/dev/null 2>&1; then
  ok "cold backup present + checksum verifies: $LATEST"
else
  warn "no verified cold backup found in $VW_BACKUP_DIR"
fi
[ -n "${VW_DATA_SRC:-}" ] && [ -d "$VW_DATA_SRC" ] && ok "original docker data dir untouched: $VW_DATA_SRC" \
                                                   || warn "original data dir missing — rollback would need the tar backup"

echo; echo "═══ POST-CHECK SUMMARY: $PASS pass · $WARN warn · $FAIL fail ═══"
echo "Re-run this script: (a) after rewiring blackbox/Homepage, (b) after a reboot."
exit "$FAIL"
