# Raspberry Pi 5 Homelab

A self-hosted homelab running on a Raspberry Pi 5, built as a personal infrastructure/security project. Everything below is exposed only over a private WireGuard mesh (Tailscale) — there is no public inbound port on this box.

## Hardware

- Raspberry Pi 5, Argon case
- Currently booting from SD card; migration to a dedicated NVMe SSD (WD Black SN770) is in progress to remove SD-card wear and I/O contention as a reliability bottleneck

## Network & access model

- **Tailscale (WireGuard mesh VPN)** is the only way anything on this box is reachable outside the LAN. No ports are forwarded on the router.
- **Tailscale Serve** terminates HTTPS on the tailnet interface and reverse-proxies to services bound to `127.0.0.1` — nothing listens on a public-facing wildcard address.
- **Host firewall (UFW)** is a second, independent layer on top of the VPN: each internal Docker bridge subnet is explicitly allow-listed for only the specific ports it needs to reach (e.g. the monitoring stack's subnet is allowed to hit Home Assistant's metrics port; nothing else is). Defense in depth, not just "the VPN handles it."
- **Docker network segmentation**: services are split across multiple isolated bridge networks (a monitoring network, a reverse-proxy-facing network, etc.) instead of one flat network, to limit lateral movement between unrelated services.

## Services

### Core infrastructure
- **Pi-hole** — network-wide DNS ad/tracker blocking (StevenBlack's unified hosts list, phishing.army, plus malware and telemetry lists — roughly 1.2M domains blocked)
- **Unbound** — recursive DNS resolver sitting behind Pi-hole as its sole upstream. Queries are resolved from the root servers down rather than forwarded, so no third-party resolver holds a complete log of the household's DNS traffic. Unlike everything else here it runs **on the host as an apt package, not in a container** — so it sits outside the per-container hardening described below, and it is patched through OS package updates rather than tracked by WUD
- **WUD (What's Up Docker)** — tracks and applies container image updates, with stateful services explicitly opted out of auto-following image tags (see *Incidents* below)

### Personal apps
- **Vaultwarden** — self-hosted, Bitwarden-compatible password manager
- **Paperless-ngx** — document management and archival, with OCR (Greek + English), backed by Postgres + Redis
- **Home Assistant** — smart home hub, using host networking for LAN device discovery
- **Immich** — self-hosted photo/video library (currently offline, pending dedicated NAS-backed storage)

### Observability stack
- **Prometheus** — central metrics store, scraping every service in the stack
- **Grafana** — dashboards for host metrics, per-container resource usage, container logs, DNS, and smart-home stats, embedded live into the dashboard front end
- **Alertmanager** — alert routing, bridged to a push-notification channel (ntfy) rather than relying on someone staring at a dashboard
- **Loki + Promtail** — centralized log aggregation across all containers
- **node-exporter / cAdvisor / blackbox-exporter / pihole-exporter** — metric sources for host resources, per-container resource usage, HTTP/TCP endpoint uptime, and DNS respectively

### Dashboard
- **Homepage (gethomepage)** — single-pane-of-glass landing page with live embedded Grafana panels and native service widgets

## Security posture

- **Zero inbound public listeners** — every service sits behind a WireGuard-based mesh VPN requiring per-device key authentication; nothing is reachable from the open internet
- **Defense in depth** — the firewall layer is scoped independently of the VPN, so a misconfigured container can't accidentally expose a port beyond its intended internal audience
- **Least privilege on containers** — `cap_drop: ALL` with a narrow, explicit `cap_add` only where a service genuinely needs it, `no-new-privileges` everywhere, non-root execution via UID/GID mapping wherever the base image supports it, read-only root filesystems where feasible
- **Network segmentation** — multiple isolated Docker networks instead of a single flat network, to contain the blast radius of any one compromised container
- **Secrets kept out of configs and version control** — credentials and API tokens are injected via environment files or mounted as dedicated read-only secret files (e.g. a metrics scrape job authenticates via a `bearer_token_file` rather than a token embedded in a checked-in config)
- **Supply-chain-aware automation** — automatic container updates are useful but not applied blindly: after a real incident (below), every stateful/data-bearing service is explicitly excluded from auto-following image tags, so patch automation can't silently corrupt a database

## Incidents & lessons learned

Real problems hit and fixed during this build — kept here because the debugging process is more informative than a clean success story.

**1. An auto-updater silently corrupted a brand-new deployment.**
While standing up Paperless-ngx, the update-tracker watches Docker's live event stream, not just its schedule — it grabbed the Postgres and Redis containers within seconds of creation and pushed them to non-standard tags it misjudged as "newer" (a pre-release database beta, a legacy-architecture cache build), corrupting the deployment before it held any real data. Root cause: tag comparators can't reliably tell a stable release from a beta/RC/legacy-arch tag across every image's own versioning convention. Fix: any new stateful service now gets an explicit auto-update opt-out label *before* its first deploy, not after.

**2. A reverse-proxied service returning 400 errors turned out to be three unrelated bugs stacked on top of each other.**
Diagnosis peeled back, in order: (a) the app didn't trust its own reverse proxy's forwarded headers, (b) fixing that exposed a silent Bluetooth-integration retry loop that was quietly preventing the web server from restarting cleanly, with no visible crash, and (c) a genuine port collision between the VPN's own listener and the app's wildcard bind on the same port. Each fix revealed the next problem rather than solving it outright — a reminder not to declare victory after the first plausible-looking fix.

**3. Cross-service metrics scraping failed with no application-level error at all.**
Wiring a service's metrics into the monitoring stack, requests timed out intermittently. The application config, DNS, and container health were all fine — the actual cause was the host firewall: one Docker subnet had correctly been allow-listed to reach the target port, but a second, unrelated subnet needed the same access and had simply been missed when the rule was written. A good example of "works from container A, not container B" almost always meaning the network/firewall layer, not the app.

## Stack summary

| Layer | Tools |
|---|---|
| Access / networking | Tailscale (WireGuard), Tailscale Serve, UFW |
| Reverse proxy / dashboard | Homepage (gethomepage) |
| Metrics | Prometheus, node-exporter, cAdvisor, blackbox-exporter, pihole-exporter |
| Dashboards / alerting | Grafana, Alertmanager, ntfy |
| Logging | Loki, Promtail |
| DNS | Pi-hole, Unbound (recursive) |
| Password management | Vaultwarden |
| Document management | Paperless-ngx (Postgres, Redis) |
| Smart home | Home Assistant |
| Photos | Immich |
| Update management | WUD (What's Up Docker) |
| Container runtime | Docker Compose, per-service hardening (capabilities, non-root, read-only fs) |

## Known gaps & next steps

Written down deliberately. A doc that implies everything is finished is less useful than one
that says where the weak points are — and these are the next things being worked on.

| Gap | Why it matters | Planned fix |
|---|---|---|
| **No backups** | The biggest risk in the whole build. Root storage is still an SD card, and Vaultwarden (SQLite), Paperless-ngx (Postgres) and Home Assistant all hold data that can't be regenerated. SD failure is a *when*, not an *if*. | Restic to a local target plus an offsite bucket, driven by **database-aware pre-hooks** (`pg_dump`, `sqlite3 .backup`) — snapshotting a live database file restores as corruption, so the dump has to happen first. Then one timed restore drill onto a spare card, to turn the recovery time from a guess into a measured number. |
| **The stack isn't reproducible from this repo** | The architecture is documented in prose, but no compose files are committed. A rebuild after an SD failure would be from memory. | Commit the compose files, with secrets encrypted at rest via SOPS + age so nothing sensitive lands in git history. |
| **Pi-hole is a single point of DNS failure** | Every device pointed at it loses name resolution while the Pi reboots. | A secondary resolver — either a second Pi-hole, or a plain upstream as DHCP's secondary, accepting that it bypasses filtering during failover. |
| **No image vulnerability scanning** | Update automation tracks which images are *newer*, not which are *safer*. An image can be perfectly up to date and still carry known CVEs. | Trivy on a schedule, with findings routed into the Alertmanager → ntfy path that already exists. |
| **Docker socket exposure** | WUD, cAdvisor and Homepage's Docker widgets each need access to the Docker socket, and write access to it is effectively root on the host — which undercuts the per-container `cap_drop: ALL` hardening described above. | Route them through a read-only `docker-socket-proxy`, scoping each consumer to only the API endpoints it actually needs. |
| **Immich is offline** | The photo library is down pending storage capacity. | Bring it back once the NVMe migration and NAS-backed storage are in place. |
