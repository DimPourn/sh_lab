# Raspberry Pi homelab

A cybersecurity homelab by Dimitris Pournatzis. I use a Raspberry Pi 5 to practice Linux service hardening, private networking, monitoring, and recovery.

[View the project portfolio](https://dimpourn.github.io/sh_lab/)

## Selected work

- **Observability.** Diagnosed a healthy Prometheus scrape that was missing application telemetry, then added and tested a missing-metrics alert.
- **Linux recovery.** Rebuilt a system file ownership baseline from verified packages and local exceptions. Verified the repair across 29,048 paths and confirmed scheduled jobs ran again.
- **Backup automation.** Added retries for delayed backup copies, verified the transferred archives using checksums, and published transfer freshness as a monitoring metric.

## Website

GitHub Pages serves the static portfolio from `docs/`. It is plain HTML and CSS with self-hosted GSAP and Lenis in `docs/vendor/`, self-hosted fonts, and no third-party requests. It requires no build step.

A strict Content Security Policy is set as a meta tag, because GitHub Pages can't send custom headers. Scripts load only from the site itself, plus one inline script allowed by its hash. If you edit that inline script in `docs/index.html`, update the hash in the policy, or browsers will block it.

`tools/` holds the two scripts that produced generated assets: `trim-fonts.py` trims the fonts, and `og-desk.py` shoots the link-preview card.

Preview it locally with `python3 -m http.server --bind localhost --directory docs 8080`.
