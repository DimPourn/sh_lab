# sh_lab — Raspberry Pi 5 Homelab

**📖 Project site: [dimpourn.github.io/sh_lab](https://dimpourn.github.io/sh_lab/)**

A self-hosted homelab running on a Raspberry Pi 5, built as a personal infrastructure and
security project — practice in deploying, hardening, monitoring and actually *maintaining*
real services with Docker, rather than standing them up once and walking away.

Everything runs behind a private WireGuard mesh (Tailscale). No ports are forwarded on the
router and there are no public inbound listeners.

## Where things are

| Path | What's in it |
|---|---|
| **[`homeLab/pi5-homelab.md`](homeLab/pi5-homelab.md)** | **Current architecture** — services, security posture, incidents and lessons learned, known gaps. Start here. |
| [`docs/`](docs/) | Source for the project site published via GitHub Pages. |
| [`homeLab/archive/`](homeLab/archive/) | Superseded setup notes, kept as a dated build journal. Historical — **not** current configuration. |

## Stack

| Layer | Tools |
|---|---|
| Access / networking | Tailscale (WireGuard), Tailscale Serve, UFW |
| DNS | Pi-hole, Unbound (recursive) |
| Dashboard | Homepage (gethomepage) |
| Metrics | Prometheus, node-exporter, cAdvisor, blackbox-exporter, pihole-exporter |
| Dashboards / alerting | Grafana, Alertmanager, ntfy |
| Logging | Loki, Promtail |
| Password management | Vaultwarden |
| Document management | Paperless-ngx (Postgres, Redis) |
| Smart home | Home Assistant |
| Photos | Immich *(currently offline, pending NAS-backed storage)* |
| Update management | WUD (What's Up Docker) |
| Container runtime | Docker Compose, per-service hardening |

## Access model

- **Tailscale** is the only way anything here is reachable from outside the LAN. Nothing is
  port-forwarded.
- **Tailscale Serve** terminates HTTPS on the tailnet interface and reverse-proxies to
  services bound to `127.0.0.1` — nothing listens on a public-facing wildcard address.
- **UFW** is a second, independent layer on top of the VPN: each Docker bridge subnet is
  allow-listed for only the specific ports it needs. Defense in depth, not "the VPN handles
  it."
- **Segmented Docker networks** rather than one flat bridge, to limit lateral movement
  between unrelated services.

## Security posture

`cap_drop: ALL` with narrow explicit `cap_add`, `no-new-privileges` everywhere, non-root
execution where the base image supports it, and read-only root filesystems where feasible.
Secrets are injected via environment files or mounted read-only rather than committed.
Stateful services are excluded from auto-following image tags, after an auto-updater
corrupted a fresh Paperless deployment.

Full detail — including the three incidents that shaped this and the one consciously
documented exception — is in
**[`homeLab/pi5-homelab.md`](homeLab/pi5-homelab.md)**.

## Known gaps

Tracked honestly in
[the architecture doc](homeLab/pi5-homelab.md#known-gaps--next-steps). The headline one:
**there are no automated backups yet**, which is the single biggest risk in the build and
the next thing being fixed.

## Resources

- **Tailscale:** https://tailscale.com
- **Pi-hole:** https://pi-hole.net
- **Unbound:** https://nlnetlabs.nl/projects/unbound
- **Vaultwarden:** https://github.com/dani-garcia/vaultwarden
- **Paperless-ngx:** https://docs.paperless-ngx.com
- **Home Assistant:** https://www.home-assistant.io
- **Immich:** https://immich.app
- **Prometheus:** https://prometheus.io
- **Grafana:** https://grafana.com
- **Loki:** https://grafana.com/oss/loki
- **Homepage:** https://gethomepage.dev
- **WUD (What's Up Docker):** https://getwud.github.io/wud
- **ntfy:** https://ntfy.sh
