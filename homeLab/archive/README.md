# Archive

Superseded setup notes, kept as a dated build journal rather than deleted — the path from
"port-forward a subdomain and hope" to "no inbound listeners at all" is part of what this
project is about.

**Nothing in this folder describes the current configuration.** Each file opens with a banner
saying what changed. For the live architecture, see [`../pi5-homelab.md`](../pi5-homelab.md).

| File | Covers | Superseded by |
|---|---|---|
| [`pi_Hole.md`](pi_Hole.md) | First Pi-hole install, static IP, DHCP range, blocklists | Unbound recursive resolution; HTTPS via Tailscale Serve |
| [`Bitwarden.md`](Bitwarden.md) | Vaultwarden behind Caddy + DuckDNS + Let's Encrypt | Tailscale Serve; no public DNS name, no forwarded ports |
| [`uptime-kuma.md`](uptime-kuma.md) | Uptime Kuma monitoring and ntfy alerts | Prometheus + blackbox-exporter + Grafana + Alertmanager |
