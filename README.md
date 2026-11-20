# Raspberry Pi homelab

A personal infrastructure project by Dimitris Pournatzis. I use a Raspberry Pi 5 to get hands-on experience with Linux administration, container operations, private networking, monitoring, and recovery.

[View the project portfolio](https://dimpourn.github.io/sh_lab/)

## Selected work

- **Observability.** Diagnosed a healthy Prometheus scrape that was missing application telemetry, then added and tested a missing-metrics alert.
- **Linux recovery.** Rebuilt a system file ownership baseline from verified packages and local exceptions. Verified the repair across 29,048 paths and confirmed scheduled jobs ran again.
- **Backup automation.** Added retries for delayed backup copies, verified the transferred archives using checksums, and published transfer freshness as a monitoring metric.

## Website

GitHub Pages serves the static portfolio from `docs/`. The Descent tour uses local fonts and a bundled Three.js scene. It requires no build step.

Preview it locally with `python3 -m http.server --bind localhost --directory docs 8080`.
