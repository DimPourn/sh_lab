#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 01 · PRE-CHECK — run on the Pi BEFORE touching anything.
# Read-only except for: a warm safety backup and the state file it writes.
# Captures the current Docker deployment, monitoring wiring and a baseline,
# and verifies the host is ready for rootless Podman.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=vw-migration.conf
source "$DIR/vw-migration.conf"

PASS=0; FAIL=0; WARN=0
ok()   { echo "  [PASS] $*"; PASS=$((PASS+1)); }
bad()  { echo "  [FAIL] $*"; FAIL=$((FAIL+1)); }
warn() { echo "  [WARN] $*"; WARN=$((WARN+1)); }
hdr()  { echo; echo "── $* ─────────────────────────────"; }

mkdir -p "$(dirname "$VW_STATE")" "$VW_BACKUP_DIR"
: > "$VW_STATE"
save() { echo "$1=\"$2\"" >> "$VW_STATE"; }

# ── 1. current container ────────────────────────────────────────────────────
hdr "1. Current Docker deployment"
if ! docker inspect "$VW_CONTAINER" >/dev/null 2>&1; then
  bad "container '$VW_CONTAINER' not found — set VW_CONTAINER in vw-migration.conf"
  echo; echo "Aborting: nothing to migrate."; exit 1
fi

INSPECT="$(docker inspect "$VW_CONTAINER")"
readarray -t VW_META < <(python3 - "$VW_CONTAINER" <<'PY'
import json, subprocess, sys
d = json.loads(subprocess.check_output(["docker","inspect",sys.argv[1]]))[0]
img   = d["Config"]["Image"]
digest = (d.get("Image") or "")
repod  = d.get("RepoDigests") or json.loads(subprocess.check_output(
         ["docker","image","inspect",img]))[0].get("RepoDigests") or []
ports = d["HostConfig"].get("PortBindings") or {}
pub = []
for cport, binds in (ports or {}).items():
    for b in binds or []:
        pub.append(f"{b.get('HostIp','0.0.0.0')}:{b.get('HostPort')}→{cport}")
mounts = [f"{m['Source']}→{m['Destination']}" for m in d.get("Mounts", [])]
data_src = next((m["Source"] for m in d.get("Mounts", []) if m["Destination"] == "/data"), "")
env_names = [e.split("=",1)[0] for e in d["Config"].get("Env", [])]
user = d["Config"].get("User") or "root(in-container default)"
caps = d["HostConfig"].get("CapDrop") or []
sec  = d["HostConfig"].get("SecurityOpt") or []
labels = d["Config"].get("Labels") or {}
wud = {k:v for k,v in labels.items() if "wud" in k.lower()}
nets = list((d.get("NetworkSettings",{}).get("Networks") or {}).keys())
print(img)
print(repod[0] if repod else "")
print(";".join(pub))
print(data_src)
print(";".join(mounts))
print(",".join(env_names))
print(user)
print(",".join(caps))
print(",".join(sec))
print(json.dumps(wud))
print(",".join(nets))
print(d["State"].get("Status",""))
PY
)
IMG="${VW_META[0]}"; DIGEST="${VW_META[1]}"; PUB="${VW_META[2]}"
DATA_SRC="${VW_META[3]}"; MOUNTS="${VW_META[4]}"; ENVNAMES="${VW_META[5]}"
CUSER="${VW_META[6]}"; CAPS="${VW_META[7]}"; SECOPT="${VW_META[8]}"
WUD_LABELS="${VW_META[9]}"; NETS="${VW_META[10]}"; CSTATE="${VW_META[11]}"

[ "$CSTATE" = "running" ] && ok "container is running" || bad "container state: $CSTATE"
ok "image: $IMG"
if [ -n "$DIGEST" ]; then ok "pinned digest: $DIGEST"; save VW_IMAGE_DIGEST "$DIGEST";
else warn "no repo digest found — migrate will pin whatever 'docker inspect' resolves"; fi
echo "  ports:   ${PUB:-<none>}"
echo "  /data:   ${DATA_SRC:-<not found>}"
echo "  mounts:  $MOUNTS"
echo "  user:    $CUSER   cap_drop: [$CAPS]   security_opt: [$SECOPT]"
echo "  networks: $NETS"
echo "  env vars (names only): $ENVNAMES"
echo "  wud labels: $WUD_LABELS"
save VW_IMAGE "$IMG"; save VW_PUBLISH "$PUB"; save VW_DATA_SRC "$DATA_SRC"
save VW_CONTAINER_USER "$CUSER"; save VW_NETWORKS "$NETS"

HOST_PORT="$(echo "$PUB" | grep -oE '127\.0\.0\.1:[0-9]+' | head -1 | cut -d: -f2)"
if [ -n "${HOST_PORT:-}" ]; then ok "loopback publish found → host port $HOST_PORT"; save VW_HOST_PORT "$HOST_PORT";
else warn "no 127.0.0.1 publish detected — record the real binding manually before migrating"; fi
[ -n "$DATA_SRC" ] && ok "data dir: $DATA_SRC" || bad "could not locate /data bind mount"

# ── 2. service health baseline ──────────────────────────────────────────────
hdr "2. Service health baseline"
if [ -n "${HOST_PORT:-}" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${HOST_PORT}/alive" || true)
  [ "$CODE" = "200" ] && ok "/alive on loopback returns 200" || bad "/alive returned '$CODE'"
fi
if [ -n "$VW_TAILNET_URL" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$VW_TAILNET_URL/alive" || true)
  [ "$CODE" = "200" ] && ok "tailnet HTTPS $VW_TAILNET_URL/alive returns 200" \
                      || warn "tailnet URL check returned '$CODE' (set VW_TAILNET_URL?)"
fi

# ── 3. monitoring baseline (how does Prometheus see vaultwarden TODAY?) ─────
hdr "3. Monitoring baseline (Prometheus @ $VW_PROM_URL)"
TGT_JSON="$(curl -fsS "$VW_PROM_URL/api/v1/targets" 2>/dev/null || true)"
if [ -z "$TGT_JSON" ]; then
  warn "Prometheus API not reachable from here — Grafana/blackbox baseline skipped"
else
  echo "$TGT_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin)
hits=[t for t in d["data"]["activeTargets"] if "vault" in json.dumps(t).lower()]
if not hits: print("  [WARN] no active Prometheus target mentions vaultwarden")
for t in hits:
    print(f"  [INFO] job={t[\"labels\"].get(\"job\")} instance={t[\"labels\"].get(\"instance\")} health={t[\"health\"]}")
' | tee -a /dev/stderr | grep -q INFO && ok "found vaultwarden target(s) above — note the instance URL" \
                                       || warn "no vaultwarden target found; is it probed under another name?"
  PS="$(curl -fsS "$VW_PROM_URL/api/v1/query" --data-urlencode \
        'query=probe_success{instance=~"(?i).*vault.*"}' 2>/dev/null || true)"
  echo "  probe_success now: $(echo "$PS" | python3 -c 'import json,sys;d=json.load(sys.stdin);print([ (r["metric"].get("instance"),r["value"][1]) for r in d["data"]["result"]] or "none")' 2>/dev/null)"
  save VW_PROM_BASELINE "$(echo "$PS" | tr -d '\n' | head -c 500)"
fi

# ── 4. Homepage wiring ──────────────────────────────────────────────────────
hdr "4. Homepage wiring"
if [ -n "$VW_HOMEPAGE_CONFIG" ] && [ -f "$VW_HOMEPAGE_CONFIG/services.yaml" ]; then
  if grep -qi "vault" "$VW_HOMEPAGE_CONFIG/services.yaml"; then
    ok "vaultwarden entry found in services.yaml"
    if grep -A6 -i "vault" "$VW_HOMEPAGE_CONFIG/services.yaml" | grep -qE '^\s*(server|container):'; then
      warn "entry uses the DOCKER integration (server:/container:) — it will stop working after migration; switch it to a plain 'siteMonitor' URL (see README §Homepage)"
      save VW_HOMEPAGE_DOCKER_INTEGRATION "yes"
    else
      ok "entry appears URL-based — should survive migration if the port stays the same"
    fi
  else warn "no vaultwarden entry found in services.yaml"; fi
else
  warn "VW_HOMEPAGE_CONFIG not set/found — Homepage checks skipped"
fi

# ── 5. rootless podman readiness ────────────────────────────────────────────
hdr "5. Rootless Podman readiness"
if command -v podman >/dev/null; then
  PV="$(podman version --format '{{.Client.Version}}' 2>/dev/null || podman --version | grep -oE '[0-9]+\.[0-9]+' | head -1)"
  ok "podman installed: $PV"
  save VW_PODMAN_VERSION "$PV"
  MAJ="${PV%%.*}"; MIN="$(echo "$PV" | cut -d. -f2)"
  if [ "$MAJ" -gt 4 ] || { [ "$MAJ" -eq 4 ] && [ "$MIN" -ge 4 ]; }; then
    ok "Quadlet supported (podman ≥ 4.4)"
    save VW_QUADLET "yes"
  else
    warn "podman < 4.4: no Quadlet — README appendix A covers 'podman generate systemd' fallback"
    save VW_QUADLET "no"
  fi
else
  bad "podman not installed (sudo apt install podman uidmap slirp4netns)"
fi
grep -q "^$(id -un):" /etc/subuid && ok "subuid range present" || bad "no subuid range for $(id -un) — add with: sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 $(id -un)"
grep -q "^$(id -un):" /etc/subgid && ok "subgid range present" || bad "no subgid range for $(id -un)"
LINGER="$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || echo no)"
[ "$LINGER" = "yes" ] && ok "lingering enabled (service survives logout/reboot)" \
                      || warn "lingering off — migrate step enables it (loginctl enable-linger)"

# ── 6. warm safety backup + space ───────────────────────────────────────────
hdr "6. Warm safety backup"
if [ -n "$DATA_SRC" ] && [ -d "$DATA_SRC" ]; then
  SIZE_KB=$(du -sk "$DATA_SRC" | cut -f1); FREE_KB=$(df -k --output=avail "$VW_BACKUP_DIR" | tail -1)
  [ "$FREE_KB" -gt $((SIZE_KB * 3)) ] && ok "disk space OK (data ${SIZE_KB}K, free ${FREE_KB}K)" \
                                       || bad "low disk space for backups"
  TS="$(date +%Y%m%d-%H%M%S)"
  WARM="$VW_BACKUP_DIR/vaultwarden-warm-$TS.tar.gz"
  if sudo tar -czf "$WARM" -C "$(dirname "$DATA_SRC")" "$(basename "$DATA_SRC")" 2>/dev/null \
     || tar -czf "$WARM" -C "$(dirname "$DATA_SRC")" "$(basename "$DATA_SRC")"; then
    sha256sum "$WARM" | tee "$WARM.sha256" >/dev/null
    ok "warm backup: $WARM (a cold, consistent backup is taken again during migration)"
  else bad "backup failed — fix before migrating"; fi
else
  bad "data dir unknown — cannot back up"
fi

# ── summary ──────────────────────────────────────────────────────────────────
echo; echo "═══ PRE-CHECK SUMMARY: $PASS pass · $WARN warn · $FAIL fail ═══"
echo "State written to: $VW_STATE"
[ "$FAIL" -eq 0 ] && echo "→ OK to proceed with 02-vw-migrate.sh" \
                  || echo "→ Resolve FAILs before migrating."
exit "$FAIL"
