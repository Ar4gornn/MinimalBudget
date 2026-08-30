# Before this is relied on

Not a wishlist. These are the things that, if skipped, mean losing data or losing access —
distinct from features, which can arrive whenever.

## Blocking

- [ ] **Backups running on a schedule, with the artifact copied off the machine.**
      `ops/backup.sh` exists and has been proven to restore, but nothing runs it and nothing
      moves it. Until both are true, a dead disk — or a provider closing the account — loses
      every entry the family has made, with no recovery. This is the only item here whose
      failure is unrecoverable.
      - [ ] cron entry on the host
      - [ ] copy off-device (another machine, or object storage)
      - [ ] one restore actually performed from the off-device copy, not just from the local one

      The scripts now target the production stack by default. Override with
      `MB_COMPOSE_FILE=docker-compose.yml` for local use.

- [ ] **Confirm the VPS gives a real IPv4 with inbound 80 and 443 open.** Caddy's certificate
      challenge needs port 80 reachable; some budget plans are IPv6-only or share an address.
      Decided 2026-08-30: a 4GB VPS rather than a home Raspberry Pi, so CGNAT, dynamic DNS and SD
      card wear no longer apply. The Pi is now the intended off-device backup destination, which
      is a better use for it — "off-site" from a datacenter means your house.

- [ ] **Never run `seed.py` on the instance.** It refuses without `ALLOW_SEED=1` precisely
      because it creates an account whose password is published in the README.

- [ ] **Confirm the service worker registers on the real domain.** Everything else about the
      PWA is verified — manifest, icons, cache headers, CSP, content types — but registration
      itself could not be tested locally: the embedded browser used for verification refuses to
      register any service worker, proven with an empty control script. It needs one check in a
      real browser on the deployed HTTPS address. In DevTools → Application → Service Workers it
      should show as activated, and Manifest should show no errors.

## Worth doing first, not blocking

- [ ] CI running the test suite on push, so a break is caught before it reaches the instance.
- [ ] Uptime check pointed at `/health` — which returns the API's real health, not the SPA shell.
- [ ] Measure Argon2 hashing cost on the VPS once it is up. The defaults assume a server, and a
      4GB shared instance mostly is one, so this is a check rather than an expected problem.
