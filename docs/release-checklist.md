# Before this is relied on

Not a wishlist. These are the things that, if skipped, mean losing data or losing access —
distinct from features, which can arrive whenever.

## Blocking

- [ ] **Backups running on a schedule, with the artifact copied off the machine.**
      `ops/backup.sh` exists and has been proven to restore, but nothing runs it and nothing
      moves it. Until both are true, a dead SD card or disk loses every entry the family has
      made, with no recovery. This is the only item here whose failure is unrecoverable.
      - [ ] cron entry on the host
      - [ ] copy off-device (another machine, or object storage)
      - [ ] one restore actually performed from the off-device copy, not just from the local one

- [ ] **Confirm the host is reachable from the public internet.** Family members are on other
      continents, so a home connection has to accept inbound traffic. Check for CGNAT before
      anything else — if the ISP hands out a shared address, port forwarding cannot work and a
      tunnel is required instead. See the hosting notes in the README.

- [ ] **Postgres not on an SD card.** Database write patterns wear flash out, and the failure is
      corruption rather than a clean stop. Use an external SSD.

## Worth doing first, not blocking

- [ ] CI running the test suite on push, so a break is caught before it reaches the instance.
- [ ] Uptime check pointed at `/health` — which returns the API's real health, not the SPA shell.
- [ ] Measure Argon2 hashing cost on the target hardware and tune if a login is slow. The
      defaults assume a server; a Raspberry Pi is not one.
