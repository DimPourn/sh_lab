# Personal Homelab project
## Overview:
Homelab setup for me to practice creating, securing and maintaining services with the help of Docker and Rasberry Pi
## Key Tools:
- **Vaultwarden** (password manager)
- **Caddy** (Reverse Proxy)
- **Rasberry Pi 5** (Pi-Hole)
- **Docker** (Container)


## Uptime Kuma Setup
**Setup Date:** December 15, 2025  
**Host:** Raspberry Pi 5 (pi5)  
**Docker Network Mode:** Host  
**Access Method:** Tailscale


### Services Monitored
- **Pi-hole**
- **Unbound**
- **Vaultwarden**
- **Immich**
- **Tailscale**

## Docker Compose Configuration

### Uptime Kuma Setup
```yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    volumes:
      - ./data:/app/data
    network_mode: "host"  # Critical for accessing localhost services
    restart: unless-stopped
```

## Notification Setup

### Ntfy Configuration
**Service:** ntfy.sh (public instance)  
**Method:** Push notifications via mobile app  

#### Alert Behavior
- **Down Notification:** Immediate alert when service fails
- **Up Notification:** Alert when service recovers
- **All monitors:** Notifications enabled by default
- **Critical services:** Vaultwarden, SSH, DNS get priority


## Resources

- **Uptime Kuma:** https://github.com/louislam/uptime-kuma
- **Ntfy:** https://ntfy.sh
- **Tailscale:** https://tailscale.com
- **Pi-hole:** https://pi-hole.net
- **Unbound:** https://nlnetlabs.nl/projects/unbound
- **Vaultwarden:** https://github.com/dani-garcia/vaultwarden
- **Immich:** https://immich.app
