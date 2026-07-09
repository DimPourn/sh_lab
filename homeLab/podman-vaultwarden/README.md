# Vaultwarden → rootless Podman (Quadlet) migration

Moves **one** service — Vaultwarden — from the Docker Compose stack to
**rootless Podman** managed by systemd (Quadlet), as a contained experiment in
removing the root-daemon attack surface. Everything else stays on Docker.

**What this buys:** no root daemon in the path, no root-equivalent
`docker.sock` exposure for this service, and container-root mapped to an
unprivileged host UID — a real upgrade for the single most sensitive service
in the lab. Existing hardening (`cap_drop: ALL`, `no-new-privileges`,
loopback-only publish) carries over 1:1 in the Quadlet unit.

**What deliberately does not change:** the host port on `127.0.0.1`, so
**Tailscale Serve keeps working untouched**, and clients notice nothing.

---

## Order of operations

| Step | Script | What it does |
|---|---|---|
| 1 | `01-vw-precheck.sh` | Read-only audit + warm backup + baseline. Writes `state/discovered.env`. |
| 2 | `02-vw-migrate.sh` | Guided: stop docker → cold backup (+ sqlite integrity check) → copy data → install Quadlet → start → smoke test. Prompts before each phase. |
| 3 | *manual* | Rewire monitoring + Homepage (below) — the one part that can't be scripted blind. |
| 4 | `03-vw-postcheck.sh` | Verifies health, the security claims (`CapEff=0`, `NoNewPrivs=1`, host UID ≠ 0), end-to-end HTTPS, Prometheus probe (= Grafana), Homepage config, rollback safety. |
| 5 | reboot the Pi | Then run `03` again — proves lingering + Quadlet autostart. |

First edit `vw-migration.conf` (tailnet URL, Homepage config path, compose file
path), then: `bash 01-vw-precheck.sh`.

---

## §Monitoring — blackbox / Prometheus / Grafana

**The trap (see incident INC-03):** blackbox-exporter runs *inside* a Docker
network. Today it reaches Vaultwarden either by Docker DNS name
(`http://vaultwarden/…`) or a bridge IP. After migration the container is gone
from Docker's networks, and the new one publishes **only on host loopback**,
which containers cannot reach. The probe will go red even though the service
is perfectly healthy — "works from A, not B" strikes again.

**The fix — probe the real front door.** Point the blackbox HTTP probe at the
tailnet HTTPS URL instead of an internal address:

```yaml
# prometheus.yml (blackbox job) — replace the old vaultwarden target with:
- targets:
    - https://<your-host>.<tailnet>.ts.net/alive   # same URL your devices use
```

This is *better* monitoring than before: it exercises the full user path
(Tailscale Serve → loopback → Vaultwarden) instead of a side door.

Two prerequisites, both matching the existing per-subnet allow-list pattern:

1. **DNS**: the blackbox container must resolve `*.ts.net`. If Pi-hole is the
   container DNS, add a conditional forward for `ts.net` → `100.100.100.100`
   (MagicDNS), or a local DNS record pointing the hostname at the Pi's
   tailnet IP (`tailscale ip -4`).
2. **UFW**: allow the monitoring subnet → the Pi's tailnet IP on 443:
   `sudo ufw allow from <monitoring-subnet> to <pi-tailscale-ip> port 443 proto tcp`

Then reload Prometheus and run `03-vw-postcheck.sh` — its §4 passes when
`probe_success` for the new instance is `1`, which is exactly the series the
Grafana uptime panel renders. If the panel/variable filters on the **old**
instance URL, update it to the new one once.

### §Metrics — the cAdvisor gap

cAdvisor only watches Docker, so vaultwarden's CPU/RAM graphs go dark after
the move. Uptime (blackbox), logs and alerts keep working. To restore
resource metrics later, run
[prometheus-podman-exporter](https://github.com/containers/prometheus-podman-exporter)
as a user service and add it as a scrape target — optional, not required for
this migration.

### §Logs

The Quadlet unit logs to the **user journal**:
`journalctl --user -u vaultwarden`. If Promtail should keep collecting them,
add a `journal` scrape job (Promtail supports `scrape_configs: - job_name:
journal`) — the Docker log driver path no longer applies to this container.

---

## §Homepage

Homepage probes from inside **its** container too, so the same reachability
rule applies. Additionally, if the tile used the Docker integration it breaks
outright (the container is no longer in Docker). Replace the entry with a
plain URL check against the tailnet endpoint:

```yaml
# services.yaml
- Apps:
    - Vaultwarden:
        icon: vaultwarden.svg
        href: https://<your-host>.<tailnet>.ts.net
        siteMonitor: https://<your-host>.<tailnet>.ts.net/alive
        description: password manager · rootless podman
```

(Same DNS/UFW prerequisites as §Monitoring; the Homepage container's subnet
needs the 443 allow rule as well.)

---

## §Updates — WUD no longer applies

WUD watches the Docker API and cannot see this container — which for a
stateful service is **by policy** anyway (INC-01). Updates are now deliberate
and manual:

```bash
podman pull docker.io/vaultwarden/server:latest   # or a pinned tag
systemctl --user restart vaultwarden
```

Take a backup first; the unit intentionally sets no `AutoUpdate=`.

---

## §Rollback

The original data dir and the stopped Docker container are left intact.

```bash
systemctl --user stop vaultwarden          # stop the podman copy
docker start vaultwarden                    # old container, old data, old port
```

Worst case, restore the verified cold backup
(`vw-migration-backups/vaultwarden-cold-*.tar.gz`, sha256-checked and sqlite
integrity-checked at creation). Keep the Docker side for 1–2 weeks of clean
operation before deleting it.

---

## Appendix A — podman < 4.4 (no Quadlet)

Raspberry Pi OS *bookworm* ships podman 4.3, which predates Quadlet
(*trixie* ships 5.x — preferred). On 4.3 use the generator instead:

```bash
podman run -d --name vaultwarden \
  --env-file ~/vaultwarden/vaultwarden.env \
  -v ~/vaultwarden/data:/data \
  -p 127.0.0.1:<PORT>:80 \
  --cap-drop=all --security-opt no-new-privileges \
  docker.io/vaultwarden/server@sha256:<digest>
podman generate systemd --new --files --name vaultwarden
mkdir -p ~/.config/systemd/user && mv container-vaultwarden.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now container-vaultwarden
loginctl enable-linger $USER
```

`03-vw-postcheck.sh` works the same either way (adjust the unit name if using
the generated `container-vaultwarden.service`).
