> **📁 Archived — historical build journal, not current configuration.**
>
> Kept for the record of how the setup evolved. Two things below are no longer true:
>
> - **Upstream DNS.** This entry describes forwarding to Quad9 and Cloudflare. Pi-hole now
>   resolves through **Unbound in full recursive mode**, so queries go to the root servers
>   rather than any third-party resolver.
> - **"Next goal is to make it more secure with https".** Done — but not the way this note
>   assumed. HTTPS is terminated by **Tailscale Serve** on the tailnet interface, not by a
>   public certificate on a forwarded port.
>
> For the current architecture see [`../pi5-homelab.md`](../pi5-homelab.md).

---


## Set up of Pi Hole

- I installed the Pi hole on my rasberry pi and set a static IP address so other devices etc can find it.
- I had to also make the DHCP range shorter on my router so i could set a static IP that other devices wouldnt use.
- I set the DNS server to the pi hole only on my devices as other family member might get annoyed if some website dont display properly...
- Im choosing to go for a more privacy oriented DNS, instead of sending queries to Google. Quad9 and Cloudflare.
- I also enabled live update on the Query Log so its easier to see what get blocked and what not.

### 27/09/2025
- Added phising.army blocklist

(next goal is to make it more secure with https)
