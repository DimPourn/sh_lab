
### Decided to use Vaultwardens self-host, Bitwarden as my password manager.

- Through Docker I ran Vaultwarden.
-  I also registered a subdomain to make everything a tiny bit more clean and tidy though I went with the free option of DuckDNS.( i am a uni student after all ).
-  With the help of chatgpt, i used a script to automate the update of my ip so i dont have to do it manually.
  ### update 7/10/2025
- set up subdomain with DUCKDNS.
- Got https certificate through LetsEncrypt and made the https version of the site with reverse proxy Caddy.
- Disabled logins for better security.
- Found out i was behind a CGNAT and changed the ipv6 to ipv4 so its compatible with most devices.
