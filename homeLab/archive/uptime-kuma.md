> **📁 Archived — historical build journal, not current configuration.**
>
> Uptime Kuma was the first monitoring layer on this box. It has since been **replaced by
> the Prometheus stack**: endpoint/uptime probing is now done by **blackbox-exporter**,
> scraped by Prometheus, with dashboards in Grafana and alert routing through
> **Alertmanager**.
>
> One piece did survive: alerts still land on **ntfy** as phone push notifications. Only the
> thing *generating* them changed.
>
> For the current architecture see [`../pi5-homelab.md`](../pi5-homelab.md).

---

# Uptime Kuma

**Setup date:** December 15, 2025
**Host:** Raspberry Pi 5 (pi5)
**Docker network mode:** host
**Access:** Tailscale

## Services monitored

- Pi-hole
- Unbound
- Vaultwarden
- Immich
- Tailscale

## Compose configuration

```yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    volumes:
      - ./data:/app/data
    network_mode: "host"  # needed to reach services bound to localhost
    restart: unless-stopped
```

## Notifications

**Service:** ntfy
**Method:** push notifications to the mobile app

- **Down:** immediate alert when a service fails
- **Up:** alert when it recovers
- Notifications enabled on all monitors by default
- Vaultwarden, SSH and DNS treated as priority

## Why it was replaced

Uptime Kuma answers "is it up?" well, but not "why is it slow, and what changed?" Moving to
Prometheus + Grafana + Loki gave time-series history, per-container resource usage and
centralized logs in one place, with blackbox-exporter covering the up/down checks Kuma was
doing. Running both would have meant two alerting paths for the same events.
