# HANDOFF — instructions for Claude Code running on the Pi

Continue work started in another Claude Code session (cloud, repo-only — it
had no access to this Pi). Verify everything against this machine before
acting: that session could only read the repo, not the box.

## What already happened

- Repo: `DimPourn/sh_lab`, branch `claude/homelab-network-viz-ve2m2v` (the
  site redesign on it is already merged to main and deployed — don't touch
  `docs/`).
- This directory (`homeLab/podman-vaultwarden/`) is a NEW, **not-yet-executed**
  migration kit: move Vaultwarden from Docker Compose to rootless Podman
  (Quadlet) as a least-privilege experiment. Contents:
  - `vw-migration.conf` — edit first
  - `01-vw-precheck.sh` — read-only audit + baseline + warm backup
  - `02-vw-migrate.sh` — guided: cold backup w/ sqlite integrity check →
    copy data → Quadlet unit → smoke test
  - `vaultwarden.container` — Quadlet template (placeholders filled by 02)
  - `03-vw-postcheck.sh` — verifies rootless UID mapping, CapEff=0,
    NoNewPrivs=1, `/alive`, tailnet HTTPS end-to-end, Prometheus
    probe_success, Homepage config, rollback backup integrity
  - `README.md` — the runbook. READ IT FIRST, especially §Monitoring and
    §Homepage.

## This machine (from the repo docs — confirm on the box)

Pi 5, Docker Compose stack, zero public ports. Tailscale Serve terminates
HTTPS on the tailnet and proxies to services on `127.0.0.1`. UFW allow-lists
individual docker subnets per port. Monitoring: Prometheus +
blackbox-exporter + Grafana + Alertmanager/ntfy, logs via Loki/Promtail,
dashboard = Homepage (gethomepage). WUD tracks updates; stateful services
carry an opt-out label. Vaultwarden today: docker container, `/data` bind
mount, published on `127.0.0.1:<port>`, HTTPS via Tailscale Serve.

## The task, in order — do not skip ahead

1. Read `README.md` in this directory fully.
2. Discover the real values (`docker inspect vaultwarden`,
   `tailscale serve status`, locate the Homepage config dir and the compose
   file) and fill in `vw-migration.conf` accordingly. Don't guess — inspect.
3. Run `01-vw-precheck.sh`. Show the user the full output and STOP for
   approval if there is any FAIL. Note the podman version it reports: if
   < 4.4 (bookworm ships 4.3), use README Appendix A (generate-systemd
   fallback) instead of Quadlet.
4. With the user's go-ahead, run `02-vw-migrate.sh` (it prompts at each
   phase; the cold backup + sqlite integrity check must pass or abort). The
   `127.0.0.1` port MUST stay identical so Tailscale Serve config is
   untouched.
5. Rewire monitoring per README §Monitoring: blackbox target → the tailnet
   HTTPS `/alive` URL; add Pi-hole DNS handling for `*.ts.net` (forward to
   `100.100.100.100` or a local record → `tailscale ip -4`); add UFW rules
   allowing the monitoring subnet AND Homepage's subnet → `<pi tailnet ip>`
   port 443. Update the Homepage `services.yaml` vaultwarden tile to
   `siteMonitor` with the tailnet URL (its docker-integration form dies).
   Update the Grafana panel/variable only if it filters on the old instance
   URL.
6. Run `03-vw-postcheck.sh`; everything should PASS except known gaps
   (cAdvisor metrics gone — optional podman-exporter later). Have the user
   confirm a Bitwarden client force-sync + add/delete a test item, and that
   the Grafana uptime panel and Homepage tile are green.
7. After the user's OK: reboot, run `03-vw-postcheck.sh` again to prove
   linger/autostart.

## Hard rules

- Do NOT delete the old docker container, its data dir, or any backup;
  retire only (restart policy off / compose profile "retired"). Rollback
  must stay two commands:
  `systemctl --user stop vaultwarden && docker start vaultwarden`.
- Never print secret VALUES (env file, admin token); names only. The env
  file stays `chmod 600`. `state/` and backups are gitignored — keep them
  out of git.
- Vaultwarden is stateful: no AutoUpdate on the unit, and it keeps its WUD
  opt-out policy (updates manual: `podman pull` + `systemctl --user restart`).
- UFW/DNS changes: additive allow rules only, matching the existing
  per-subnet pattern; show the user each rule before applying.
- If a probe works from the host but not from a container, that's the known
  INC-03 pattern (firewall/DNS layer) — check UFW and Pi-hole first.
- Commit any config/doc updates to the same branch,
  `claude/homelab-network-viz-ve2m2v` — never to main without asking.
