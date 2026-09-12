---
name: 'MinimalBudget'
type: architecture-spine
purpose: build-substrate
altitude: feature
paradigm: 'layered service application with the database as the isolation authority'
scope: 'MinimalBudget v1 — React SPA, FastAPI JSON API, Postgres with row-level security'
status: final
created: '2026-08-29'
updated: '2026-09-08'
binds: [epic-27-recipes, slice-1-foundation-auth, slice-2-categories-entries, slice-3-savings-budgets, slice-4-dashboard, slice-5-client, slice-6-ship, epic-10-unit-prices, epic-11-inventory, epic-22-calendar, epic-23-habits, epic-24-mood]
sources: [docs/brief.md, docs/prd.md]
companions: [docs/architecture.md]
---

# Architecture Spine — MinimalBudget

## Design Paradigm

Layered service application. Three backend layers, one direction of dependency, plus a database
layer that is not merely storage but the **authority on data isolation**.

| Layer | Package | Owns |
| --- | --- | --- |
| HTTP | `app/api/` | Routing, request/response schemas, status codes. No SQL, no business rules. |
| Service | `app/services/` | Business rules, aggregation queries. |
| Model | `app/models/` | SQLAlchemy ORM entities and their constraints. |
| Database | `migrations/` | Schema, CHECK constraints, grants, and the RLS policies that enforce isolation. |

```mermaid
graph TD
  C[React SPA] -->|JSON over HTTP, Bearer JWT| A[app/api routers]
  A --> S[app/services]
  S --> M[app/models]
  M --> D[(Postgres — RLS forced)]
  A -.->|never| M
  A -.->|never| D
  S -.->|never| A
```

Dependencies point downward only. A router may not import a model; a service may not import a
router; nothing below the HTTP layer knows a request exists.

## Invariants & Rules

### AD-1 — Postgres RLS is the isolation authority

- **Binds:** all
- **Prevents:** one slice enforcing tenancy with `WHERE user_id = ?` and another forgetting to,
  producing a cross-user leak that no test of the second slice would catch.
- **Rule:** every user-scoped table carries a non-null `user_id` and has both `ENABLE ROW LEVEL
  SECURITY` and `FORCE ROW LEVEL SECURITY`, with `USING` and `WITH CHECK` policies covering all
  four commands. Application-level `WHERE user_id` filters are defence in depth and are never the
  only thing standing between two users. The obligation is mechanised by AD-24, not left to
  discipline.

### AD-2 — Two database roles, and the runtime role is not the owner

- **Binds:** all
- **Prevents:** the application connecting as the schema owner, which silently bypasses the very
  policies AD-1 installs.
- **Rule:** the owner role owns the schema and runs Alembic migrations. The runtime role has
  `SELECT, INSERT, UPDATE, DELETE` on user-scoped tables, `EXECUTE` on the function named in
  AD-19, no DDL, and no `BYPASSRLS`. `FORCE ROW LEVEL SECURITY` is set so even the owner is
  subject to its own policies. The application connects only as the runtime role.

### AD-3 — Tenancy is established once per request, inside the transaction, through a bound parameter

- **Binds:** all
- **Prevents:** a pooled connection carrying one user's identity into the next user's request; and
  a JWT claim being string-interpolated into SQL because the obvious statement takes no parameter.
- **Rule:** every request opens exactly one transaction and, before any other statement, executes
  `SELECT set_config('app.user_id', :uid, true)` with `:uid` **bound**, never interpolated.
  `SET LOCAL` is forbidden — it accepts no parameter, and a plain `SET` would outlive the
  transaction on a pooled connection. The JWT `sub` claim is parsed and validated as a UUID before
  it reaches this call. Policies read `current_setting('app.user_id', true)`, and every policy
  treats a NULL or unset setting as matching nothing.

### AD-4 — Sessions come from one dependency, and only that dependency commits

- **Binds:** all
- **Prevents:** a route obtaining a raw session that skips AD-3 and therefore sees every user's
  rows; and a mid-request `commit()` silently discarding the transaction-local setting, after which
  every subsequent query returns zero rows and the endpoint answers `200` with empty data instead
  of failing.
- **Rule:** request-scoped database access is available only through the FastAPI dependency that
  opens the transaction, sets the setting, and commits or rolls back at the end. No module
  constructs a `Session` or connection at request time, and **no service or router calls `commit()`
  or `begin()`**. Migrations, the seed script and the test fixtures are the only code permitted
  their own engine.

### AD-5 — Money is `NUMERIC(14,2)`, `Decimal` in Python, a string in JSON

- **Binds:** entries, savings_contributions, budgets, savings_targets, dashboard, client
- **Prevents:** two slices disagreeing on the wire representation, and float rounding turning a sum
  of user data into a wrong number.
- **Rule:** no monetary value is ever a `float` or a JSON number. Columns are `NUMERIC(14,2)`,
  Python values are `decimal.Decimal`, and every monetary field is serialised as a decimal string
  with exactly two places. The client parses these strings; it never does arithmetic on them
  without an explicit decimal helper.

### AD-6 — Direction is carried by `kind`, never by the sign of `amount`

- **Binds:** entries, categories, dashboard
- **Prevents:** one slice storing expenses as negative amounts while another stores them positive,
  making every aggregate ambiguous.
- **Rule:** `amount` has `CHECK (amount > 0)` on every table that holds one. Direction lives in the
  `kind` enum (`income` | `expense`).

### AD-7 — An entry's `kind` must match its category's `kind`

- **Binds:** entries, categories
- **Prevents:** an expense entry filed under an income category, which silently corrupts both the
  budget-vs-actual figures and the income totals.
- **Rule:** `categories` carries a `UNIQUE (user_id, id, kind)`, and `entries` references it with a
  composite foreign key on `(user_id, category_id, kind)` per AD-18. The database rejects the
  mismatch; the service layer is not the only guard.

### AD-8 — Another user's row is 404, and every write proves ownership before answering

- **Binds:** all API routes that take a resource id
- **Prevents:** an attacker enumerating ids and learning which exist from the status code; and a
  blind upsert (`PUT /api/budgets/{category_id}`) answering `201` for a resource id that belongs to
  someone else, because nothing ever read it.
- **Rule:** when RLS returns zero rows for a resource id, the response is `404`. `403` is reserved
  for an authenticated user failing a rule about their *own* data. A write path that does not
  otherwise read the referenced row performs an explicit ownership read first, or relies on the
  composite foreign key of AD-18 to reject it — never on the absence of an error.

### AD-9 — Aggregation happens in SQL, and empty months are explicit zeroes

- **Binds:** dashboard
- **Prevents:** the trend endpoint returning a ragged series whose gaps each client fills
  differently, and per-row Python summation that diverges from the SQL used elsewhere.
- **Rule:** dashboard totals, budget-vs-actual and trends are computed by SQL aggregates. The trend
  series is generated from a `generate_series` of months left-joined to the data, so a month with
  no rows is returned as zero rather than omitted.

### AD-10 — Month filtering is a half-open range on a `DATE` column, and the month is the account's

- **Binds:** entries, savings_contributions, dashboard, inventory, gym, client
- **Prevents:** the `BETWEEN` off-by-one that double-counts or drops the last day, and timezone
  drift from storing an instant where a calendar date was meant. Since Epic 20 it also prevents
  the app answering for a calendar month when the person is paid on the 26th — and, worse, two
  views disagreeing about where the boundary is.
- **Rule:** `occurred_on` is `DATE`, not `TIMESTAMP`, is required on write, and has no
  server-side default. A `YYYY-MM` filter becomes a half-open range, always.

  **The month need not be the calendar one** (amended 2026-09-06):

  - The account carries `budget_start_day`, **1-28**. 1 is the calendar month, the default, and
    what every existing account has.
  - **The label is the month the period ends in.** With a start day of 26, `2026-09` means
    26 August to 25 September. Both readings were defensible; this is the one chosen.
  - **The 1-28 ceiling is load-bearing**, not timidity. The 29th, 30th and 31st are missing from
    some months, so such a boundary would need clamping — and a clamped boundary breaks the
    arithmetic that maps a date back to its period, silently, in February. "Paid on the 31st"
    means the last banking day: a rule, not a day, and a different feature.
  - Every month-based view uses it — entries, savings, the dashboard summary and trends, the
    unit-price and vendor-price series, the restock chart, the gym session filter — so a total
    and the list beneath it agree to the day.
  - SQL buckets rows with a shifted `date_trunc`, written once in `core/months.py`, with the
    shift passed as **bound parameters**: AD-3's rule about not building SQL out of user data
    does not stop applying because the value is an integer.
  - It is **not locked**, unlike the currency and the weight unit (AD-36): it re-groups rows and
    never relabels a stored number, so there is nothing to protect against.

  **A year is exactly twelve of those months** (Epic 21). It is derived from the January and
  December windows rather than from 1 January, so the twelve monthly figures add up to the
  yearly one — a year that did not tile its own months would make every figure suspect. **All
  time has no bounds at all**: `NULL`, not a sentinel date, because a guessed lower bound
  quietly drops a row and never says so.

### AD-11 — Budgets and targets are standing monthly amounts, not per-month rows

**Consequence, made explicit by Epic 21:** because a budget is *monthly*, budget-versus-actual
and target-versus-actual are computed for a month and for nothing else. Comparing a year of
spending against a standing monthly figure would mean inventing a multiplier — twelve, or fewer
for an account opened in June, or fewer still for a category budgeted halfway through. The
wider periods therefore report the four headline figures and omit those comparisons entirely.
Reporting nothing is honest; reporting a number nobody chose is not.

- **Binds:** budgets, savings_targets, dashboard
- **Prevents:** half the system treating a budget as "the budget for March" and the other half as
  "the budget", which changes what every dashboard number means.
- **Rule:** exactly one row per `(user, expense category)` and per `(user, savings type)`. They are
  written with `PUT`, which upserts. A per-month override is a v2 concern and arrives as a nullable
  `month` column, not a rewrite.

### AD-12 — Reference data is created by name, idempotently, and only where declared

- **Binds:** categories, savings_types, entries, savings_contributions
- **Prevents:** duplicate `Food` and `food` categories per user; a POST that fails because the user
  typed a category they had not pre-registered; and slice 3 guessing whether contributions
  auto-create savings types the way entries auto-create categories.
- **Rule:** categories are unique per `(user_id, kind, lower(name))`; savings types per
  `(user_id, lower(name))`. An entry payload carries **exactly one** of `category_id` or
  `category_name` — `category_name` creates the category for that user and kind if absent.
  A contribution carries `savings_type_id` only and **never** auto-creates a savings type;
  an unknown type is a `404`. Lookup by name is case-insensitive; the original casing is stored.

### AD-13 — Auth is Argon2id plus a short-lived HS256 JWT, with no refresh flow

- **Binds:** auth, all protected routes
- **Prevents:** each slice inventing its own session mechanism, and a v2 mobile client discovering
  the web client depends on a cookie it cannot use.
- **Rule:** passwords are hashed with Argon2id. The access token is a JWT signed HS256 with the
  user id in `sub`, carried in an `Authorization: Bearer` header. Expiry logs the user out; there
  is no refresh token in v1. The `sub` claim is what becomes `app.user_id` under AD-3.

### AD-14 — The API is a plain JSON HTTP API with no coupling to the web client

- **Binds:** all
- **Prevents:** a v2 Expo client finding server-rendered templates, cookie-only auth, or
  browser-shaped redirects in its way.
- **Rule:** the backend serves JSON only. No templates, no server-side sessions, no
  `Set-Cookie`-based auth. The frontend is a separate static build talking to the API across an
  origin boundary configured by CORS from an environment variable.

### AD-15 — Configuration is environment variables only

- **Binds:** all
- **Prevents:** a provider SDK or a hardcoded host pinning the project to one deploy target.
- **Rule:** every setting is read through one `pydantic-settings` object populated from the
  environment. No cloud provider SDKs. `.env.example` is committed with empty values; `.env` never
  is. No secret has a working default — a missing secret fails startup loudly.

### AD-16 — The frontend calls the API through one typed client module

- **Binds:** slice-5-client, and the v2 Expo client
- **Prevents:** components calling `fetch` directly, so that auth headers, the 401 path and the
  decimal-string convention of AD-5 are re-implemented inconsistently and cannot be lifted into v2.
- **Rule:** all network access goes through `src/api/`. No component or hook calls `fetch`
  directly. Token attachment, the collection envelope of AD-20 and 401 handling live there once.

*AD-17 is retired — it bound a single unit and restated the PRD, failing this spine's own inclusion
test. It now lives as a Consistency Convention (inline SVG charts). The id is retired, never reused.*

### AD-18 — Every foreign key between user-scoped tables carries `user_id`

- **Binds:** all user-scoped tables
- **Prevents:** user B referencing user A's row. **Postgres foreign-key checks always bypass row
  security** — the manual says so explicitly and warns about the covert channel. So a bare
  `category_id` FK lets B create an entry against A's category: B learns the id exists, and A can
  never delete that category again. RLS alone does not close this.
- **Rule:** every FK between two user-scoped tables is composite and includes `user_id` on both
  sides, backed by the matching composite unique key on the referenced table. A single-column FK to
  a user-scoped table is a defect.

### AD-19 — Registration establishes tenancy before it writes; login reads through one
security-definer function

- **Binds:** auth, savings_types
- **Prevents:** the deadlock where registration must seed a new user's default savings types before
  any `app.user_id` exists, and the three obvious unblocks (setting the setting mid-transaction,
  adding `IS NULL OR` to the policy, exempting the table from `FORCE`) each punch a hole that makes
  those tables globally readable. Also prevents the runtime role holding an unpoliced `SELECT` over
  every row of `users`, password hashes included.
- **Rule:** registration generates the user's UUID **in the application**, calls `set_config` per
  AD-3 with that id, and only then inserts the user row and seeds the three default savings types —
  so no write path ever runs outside RLS. `users` is itself RLS-protected on `id =
  app.user_id`. Login cannot read `users` by email under that policy, so it calls a `SECURITY
  DEFINER` function owned by the owner role that takes an email and returns only `(id,
  password_hash)`; the runtime role holds `EXECUTE` on that function and no direct read of `users`.
  No policy anywhere admits a NULL `app.user_id`.

### AD-20 — Collections are enveloped and deterministically ordered

- **Binds:** every list endpoint, slice-5-client
- **Prevents:** slices 2, 3 and 4 each choosing between a bare array and an envelope, and the
  single API client of AD-16 paying for the fork; plus an unstable list order that makes the UI
  reshuffle between identical requests.
- **Rule:** every list endpoint returns `{"items": [...]}` — never a bare array, so a cursor can be
  added later without breaking callers. Every list has an explicit, total `ORDER BY`: dated rows by
  `occurred_on DESC, created_at DESC, id`; reference data by `lower(name), id`. No pagination in
  v1; see Deferred.

### AD-21 — Delete behaviour is fixed per foreign key, in the schema

- **Binds:** categories, savings_types, entries, savings_contributions, budgets, savings_targets
- **Prevents:** two slices independently choosing `CASCADE` or `RESTRICT` for the same
  relationship, so that deleting a category either silently destroys a year of entries or fails,
  depending on which migration landed first.
- **Rule:** `ON DELETE CASCADE` from `users` to everything it owns. `ON DELETE RESTRICT` from
  reference data that transactional rows point at — a category with entries, or a savings type with
  contributions, cannot be deleted, and the API answers `409`. `ON DELETE CASCADE` for the budget
  or target attached to a category or savings type, since it is an attribute of that reference row,
  not an independent record.

### AD-22 — Aggregates never return NULL, and budget-vs-actual is driven from the budget side

- **Binds:** dashboard
- **Prevents:** a `SUM` over no rows serialising as `null` where the client expects a decimal
  string, and a budgeted category with no spending this month either vanishing from the report or
  not, depending on which way a developer wrote the join.
- **Rule:** every SQL aggregate is wrapped in `COALESCE(..., 0)` and serialised per AD-5. Budget
  vs actual is built by `LEFT JOIN` **from** the set of budgeted categories **to** the entries, so
  a budgeted category with zero spend appears at zero; a category with spend and no budget appears
  with a null budget, never omitted. Savings target vs actual follows the same direction.

### AD-23 — Email is normalised on write and unique case-insensitively

- **Binds:** auth
- **Prevents:** `Alex@example.com` and `alex@example.com` registering as two accounts, then one of
  them being unable to log in reliably.
- **Rule:** email is lowercased and trimmed before it is stored or compared, and carries a unique
  index over the normalised value.

### AD-24 — Isolation is proven by execution, per slice, and the schema is audited by a test

- **Binds:** all
- **Prevents:** AD-1 being an obligation nobody enforces — a new table shipping without policies,
  and nothing failing. The brief demands isolation be proven by running queries as a second user,
  not by reading the policy.
- **Rule:** every slice that adds a user-scoped table ships a test that connects **as the runtime
  role** with user B's context and asserts zero rows of user A's data on read and refusal on
  insert, update and delete. One schema test enumerates every table carrying a `user_id` column and
  fails if it lacks `rowsecurity`, `forcerowsecurity`, or a policy. Tests run against real
  Postgres; there is no SQLite path, because SQLite has no row-level security and would make these
  assertions meaningless.

### AD-25 — Registration is closed unless deliberately opened

- **Binds:** auth
- **Prevents:** an internet-facing instance accepting accounts from anyone who finds the URL,
  through an unset variable, a typo, or a developer's local `.env` leaking into production.
- **Rule:** `REGISTRATION_MODE` defaults to `invite`; any value that is not exactly `open` is
  treated as closed. The production compose file **hardcodes** it rather than substituting from
  the environment, because `docker compose` reads the repository `.env` and a local `open` would
  otherwise become the production setting. Invites are single-use, expiring, stored hashed, and
  minted only with the owner credentials — the runtime role holds no `INSERT` on `invites`, so a
  compromised API cannot create its own way in. Unknown, used and expired codes are refused
  identically, so the endpoint is not an oracle.

### AD-26 — Failed logins are rate limited per email and per source

- **Binds:** auth
- **Prevents:** a password being found by guessing from the open internet; and a limiter keyed on
  only one dimension, which either lets one attacker grind a single account or spread a spray
  across many.
- **Rule:** failures are counted against both the email and the source address, and either
  crossing the threshold locks that key for the window. The check runs *before* the password is
  verified, so a locked account costs an attacker a rejection rather than an Argon2 hash, and the
  lock applies even to correct credentials — otherwise it is decorative. The limiter is
  in-process: counters reset on restart and each replica keeps its own. That is a stated
  limitation of a single-container deployment, not an oversight.

### AD-27 — Sessions use rotating refresh tokens with reuse detection

- **Binds:** auth, slice-5-client
- **Prevents:** the choice between re-entering a password every hour — which pushes people toward
  short passwords — and a long-lived bearer token that cannot be revoked.
- **Rule:** login returns a short access token and a long refresh token. Every refresh mints a new
  pair and revokes the one presented. A token presented after it was already rotated means a copy
  exists, and there is no way to tell whether the caller is the thief or the victim, so the entire
  family descended from that login is revoked. Each login starts its own family, so signing out
  one device leaves the others alone. Tokens are stored as SHA-256 hashes — 256 bits of random has
  no dictionary to defend against, and Argon2 would only slow every refresh. The client refreshes
  transparently and **single-flights** it: concurrent requests must not each rotate, or the app
  would trip its own reuse detection and sign the user out for loading a page.

### AD-28 — Backups run as a superuser, and never with row security enabled

- **Binds:** operations
- **Prevents:** a backup that is silently incomplete. Under AD-1 every table has `FORCE ROW LEVEL
  SECURITY`, so `pg_dump` as the owner fails — `row_security=off` does not bypass RLS, it errors
  if a policy would filter the output, which is Postgres deliberately refusing to write a partial
  dump. The obvious fix, `--enable-row-security`, dumps only currently visible rows and would
  start losing data the day a policy changed, with nothing to signal it.
- **Rule:** `ops/backup.sh` and `ops/restore.sh` connect as the Postgres superuser, which bypasses
  RLS by definition, so a dump is complete by construction. `--enable-row-security` is never used.
  A dump is kept only after it is non-empty and carries the custom-format magic header.

### AD-29 — A quantity is a fact and a unit price is derived from it; a rate is not money

- **Binds:** entries, category detail, dashboard trends, client
- **Extends:** AD-5 (money representation), AD-9 and AD-22 (aggregation and zero-fill)
- **Prevents:** a stored `unit_price` drifting from `amount` after an edit; a `float` rate
  crossing the wire because "it is not money"; an average-of-averages producing a price nobody
  paid; and a zero-filled price series that charts an empty month as free fuel.
- **Rule:** `entries` carries `quantity NUMERIC(12,3) NULL CHECK (quantity > 0)` and
  `unit VARCHAR(8) NULL`, with `CHECK ((quantity IS NULL) = (unit IS NULL))`, a `CHECK` that only
  an expense carries them, and `unit` restricted by a `CHECK` to a closed list (`l`, `gal`, `kg`,
  `lb`, `kwh`, `m3`, `unit`) that is extended by migration and never by free text. No table
  stores a unit price. A single entry's `unit_price` is `amount / quantity` quantised
  `ROUND_HALF_UP` to four places, defined once as a property on the model; a period's unit price
  is `SUM(amount) / SUM(quantity)` in SQL over the same rows, rounded the same way, and a test
  holds the two equal for a period containing one entry. A rate is serialised as a **four-place
  decimal string** under its own `Rate` type — never `Money`, never a JSON number — and the client
  treats it like money: a string, arithmetic only on scaled integers. There is no conversion
  between units; a series is keyed by `(category, unit)`. A period with no quantified rows yields
  `null` for the rate, the one place in this system an aggregate may be null, because `0.00`
  would be a price; its quantity is `0`, because "bought nothing" is a quantity.

### AD-30 — A reminder is a predicate over stored facts, defined once, never a stored state

- **Binds:** inventory, dashboard, client
- **Extends:** AD-9 (aggregation in SQL) and AD-22 (derived figures, never divergent)
- **Prevents:** an `is_low` flag that stays set after the item is restocked; a fired / dismissed /
  snoozed state machine for something the data already knows; and the dashboard count disagreeing
  with the inventory page because two developers wrote the condition twice.
- **Rule:** an item needs restocking exactly when `restock_below IS NOT NULL AND quantity <=
  restock_below`. That expression is defined **once**, as a `column_property` on the model, and
  both the `needs_restock` filter on the list endpoint and every dashboard count are built from it
  — the client reads the row's flag and never recomputes it. No column, row or table records that
  a reminder is due, was shown, or was dismissed. A later reminder mechanic (a date, an expiry) is
  a second term OR-ed into the same expression in the same place. The quantity **log**
  (`inventory_item_changes`) is a different thing: a record of facts, append-only by grant — the
  runtime role holds `SELECT, INSERT` and nothing else on it — and it cascades with its item.

### AD-31 — Modules are independent; the dashboard composes them, it does not join them

- **Binds:** inventory, dashboard, client, every future module
- **Extends:** the Design Paradigm (one direction of dependency) and the settled direction of
  2026-08-30 ("the API's module boundaries are the thing to get right first")
- **Prevents:** `services/dashboard.py` growing a join into `inventory_items`, and
  `services/inventory.py` importing the ledger, so that the two can never be split, versioned or
  shipped to a native client independently; and a "convenience" auto-restock that silently writes
  one module from another's unverified data.
- **Rule:** a service module imports only its own models. The ledger (`entries`, `categories`,
  `budgets`) and the inventory (`spaces`, `inventory_items`, `inventory_item_changes`) share
  `users` and the tenancy machinery of AD-1 to AD-4, and nothing else — no foreign key between
  them, no cross-module query in any service. The dashboard **page** composes modules by calling
  each module's endpoint and rendering the results side by side, and a failure in one module
  degrades that card only; the dashboard **service** aggregates the ledger only. A cross-module
  write, when one is wanted, is a single explicit endpoint that performs both writes in the one
  request transaction of AD-4, named for what it does, never a side effect of an ordinary
  create. **Built as Epic 14:** `POST /api/inventory/items/{id}/purchase`, served by
  `services/shopping.py` — the one declared seam. It imports the two *services*, never their
  models, so the coupling has a single named home instead of leaking into either module, and a
  test reads the imports to prove the boundary rather than trusting the convention.

### AD-32 — A password hash is written only by a function that checks the tenant itself

- **Binds:** auth, recovery
- **Extends:** AD-19 (the runtime role never reads or writes `users.password_hash`; narrow
  security-definer functions are the only holes) and AD-27 (a credential change revokes sessions)
- **Prevents:** self-service recovery being built by granting the runtime role `UPDATE` on the
  hash column — after which a compromised API could reset every account — or by a
  security-definer function that takes any user id, which is the same hole with a longer name.
- **Rule:** `auth_set_password(user_id, hash)` is the only path that writes a hash from the
  application. It runs as the owner but refuses any `user_id` other than
  `app_current_user_id()`, so it can only change the password of the transaction's own tenant.
  Recovery therefore resolves the email through `auth_lookup`, pins the transaction to that id
  (the registration pattern of AD-19), redeems the code under row-level security, and only then
  calls the function. Recovery codes are stored as SHA-256 hashes, are single-use by a guarded
  `UPDATE`, and a regenerated set replaces the old one. Any password change — by code or by a
  signed-in person — revokes every refresh token of the account. Unknown email, wrong code and
  spent code are refused identically, and recovery has its own rate limiter with the same
  thresholds as login, so a code is as expensive to guess as a password. The operator command
  remains, for the person who lost the codes too.

### AD-33 — Recurrence is materialised on read, idempotently, and proposes before it writes

- **Binds:** recurring, entries, dashboard, client
- **Extends:** AD-4 (only the session dependency commits) and AD-9 (derived facts are computed,
  not duplicated)
- **Prevents:** a background scheduler this single-container deployment has nowhere to run, and
  the failure it brings — a missed or repeated run silently creating a month of duplicate rent.
  Also prevents the opposite mistake, computing proposals on the fly from the cadence, which
  cannot remember that someone said "not this month".
- **Rule:** a template carries a cadence and a `next_due` pointer. Reading the pending list
  materialises: it walks `next_due` forward to today, inserting one occurrence per due date, and
  a `UNIQUE (template_id, due_on)` makes running it twice a no-op. Occurrences are the decision
  log — `pending`, `created` or `skipped` — so a skip is remembered rather than re-proposed, and
  a decision survives the deletion of the entry it produced (`ON DELETE SET NULL (entry_id)`;
  the CHECK permits a created occurrence with no entry, and forbids an entry on any other
  status). The default is to **propose**: an entry is written only when a person confirms it,
  optionally correcting the amount without editing the template. A template may opt in to
  automatic creation, for a genuinely fixed amount, because a wrong amount created silently is
  worse than one not created at all. The anchor for a monthly cadence is the template's start
  date, so the 31st clamps to a short month and then recovers rather than drifting.

### AD-34 — Anything on a schedule runs from cron on the host, never inside the API

- **Binds:** push notifications, backups, any future periodic job
- **Extends:** AD-4 (a request opens one transaction and the dependency owns it) and AD-26's
  admission that this is a single-container deployment
- **Prevents:** an in-process scheduler that dies with the container, runs twice the day a
  second replica appears, and puts a network call to an outside service inside somebody's
  request. Also prevents the opposite mistake — a notification job that writes to the ledger
  because it happened to be convenient.
- **Rule:** periodic work is a script in `backend/` run by cron on the host, the way
  `ops/backup.sh` already is. It connects as the **runtime role**, one tenant at a time, so
  every read obeys row-level security exactly as a request does — a notifier that bypassed
  RLS could tell one person what is in another's fridge. It is **read-only with respect to
  domain data**: `notify.py` reports the proposals that already exist and never materialises
  new ones, because a job nobody is watching must not create entries. The only rows it
  writes are its own bookkeeping (`notified_on`, and deleting a subscription the push service
  has declared dead). Push is off unless the instance is given VAPID keys: there is no
  fallback key, per AD-15, and the endpoints answer `503` while the client hides the control.

### AD-35 — A plan and a record are separate rows, and neither rewrites the other

- **Binds:** gym, recurring entries, inventory
- **Extends:** AD-33 (a decision is recorded, never recomputed) and AD-21 (delete behaviour is
  fixed in the schema)
- **Prevents:** the shortcut every training app takes — copying a routine's targets into a
  session as "sets", so the log says you benched 4×8 because you *planned* to. It also prevents
  the mirror mistake: deleting the plan taking the history with it.
- **Rule:** a plan (a routine, a recurring template, a restock threshold) and a record (a set,
  an entry, a purchase) never share a row and never write each other. Starting a session from a
  routine copies nothing; the client reads the plan to prefill a form, and a set exists once it
  was done. Deleting a plan therefore uses `ON DELETE SET NULL` on the record's reference — and
  the **column-list form**, `SET NULL (routine_id)`, because the plain form nulls every column
  of the referencing key including the `NOT NULL` `user_id` that AD-18 requires, which makes the
  delete fail outright. The same applies to `recurring_occurrences.entry_id` and
  `inventory_purchases.entry_id`.

### AD-36 — A unit of measure belongs to the account, and changing it relabels

- **Binds:** gym, currency
- **Extends:** the per-account currency decision of Epic 9, generalised
- **Prevents:** a log holding both 100 kg and 100 lb, in which every chart is ambiguous and
  every comparison silently wrong; and the "fix" of converting on read, which needs a rule about
  the past that nobody chose.
- **Rule:** a unit that scales stored numbers — the account's currency, the account's weight
  unit — is a property of the account, not of the row. Changing it **relabels rather than
  converts**, so it is refused once any row depends on it: the currency once the ledger has an
  entry or a contribution, the weight unit once a set is logged. Units that merely *name* what
  was measured (AD-29's litres and kilos on an entry) are per-row and never converted either;
  the difference is that those are compared within a unit, not across one.

### AD-37 — A cross-module *read* is composed at the edge; only a cross-module *write* earns a service

- **Binds:** calendar, dashboard, the daily digest, every future view that spans modules
- **Extends:** AD-31 (modules are independent; the dashboard page composes them) and AD-4 (one
  request, one transaction)
- **Prevents:** `services/calendar.py` — a "read-only aggregator" that would have to import five
  modules' models, which AD-31 forbids outright, or five modules' services, which quietly makes a
  second seam beside `services/shopping.py` and so ends the property that there is exactly **one**
  named place where modules touch. It also prevents the failure mode: a single joined endpoint
  makes one broken module blank the whole view, where composed endpoints cost one layer.
- **Rule:** a view that needs rows from more than one module calls **each module's own endpoint**
  and merges the results at the edge — in the page. `services/shopping.py` remains the only
  cross-module *service*, and it exists because a cross-module **write** needs both halves inside
  one transaction; a read needs no transaction spanning modules, so it earns no service. When a
  module cannot answer the question a view asks, the endpoint is added **to that module**, not to
  the view: `GET /api/inventory/changes` and `GET /api/recurring/expected` were both added this
  way. The notification side composes too — `services/push.py` reads what each module already
  defines rather than restating a predicate (AD-30) — and it is a composer, not a module, which is
  why it may do so.

### AD-38 — A calendar surface shows the account's period, and an instant is placed by UTC day, out loud

- **Binds:** calendar, inventory charts, client
- **Extends:** AD-10 (the month is the account's, applied identically by every view)
- **Prevents:** the calendar becoming the one screen in the app that disagrees with the total
  printed above it — for an account paid on the 26th, a calendar-month grid would show days from
  two different budget periods under one heading. And, on the other axis, it prevents a stored
  instant being placed by whatever time zone the reader's browser happens to be in, so that the
  same restock lands on different days on a phone and a laptop, and the calendar disagrees with
  the restock chart.
- **Rule:** a grid runs from the account's period start to its period end (AD-10), rendered as
  whole weeks; the days of the neighbouring periods that fall inside those weeks are drawn as
  **outside**, and are a way into the period they belong to rather than blanks. With
  `budget_start_day = 1` this is exactly the calendar month, which is what every existing account
  has. A `DATE` a person chose is placed on that day, unconverted. A `TIMESTAMPTZ` has no day of
  its own until one is picked: **UTC is picked**, matching the restocks chart, and the interface
  says so rather than leaving the reader to discover it. The stated limitation stands — a change
  at 00:30 local, east of UTC, lands on the previous day — and a per-account time zone is the fix
  if one is ever wanted, in one expression.

### AD-39 — A projection is computed, never written, and never actionable

- **Binds:** recurring, calendar, client
- **Extends:** AD-33 (recurrence materialises on read, idempotently, and proposes before it writes)
- **Prevents:** a forward calendar quietly becoming the scheduler AD-33 exists to refuse — a view
  that materialised occurrences ahead of time would create a month of rent nobody was asked
  about. It also prevents the mirror error AD-33 names: deriving *proposals* from a cadence, which
  cannot remember that somebody said "not this month".
- **Rule:** a projected occurrence is computed from the template's cadence at read time, is
  written nowhere, and advances no `next_due`. It exists **strictly after today** only: every date
  up to today is a materialised occurrence carrying its own decision, so a skip stays skipped and
  a projection can never speak for a date a person has already answered. It carries **no id**,
  because there is no row — which is what makes "confirm" and "skip" unavailable on it rather than
  merely hidden — and the interface labels it as something that has not happened.

### AD-40 — A target re-judges the past, so it changes freely; every figure over it is derived, and the period in progress is never a miss

- **Binds:** habits, and any future target over repeated facts
- **Extends:** AD-36 (a unit that relabels stored numbers locks) and AD-9/AD-30 (a derived figure
  is computed, never duplicated into a column)
- **Prevents:** habits being locked the way the currency and the weight unit are, which would make
  "three times a week" a decision nobody could revise; the opposite error of versioning targets by
  effective date, which answers "your streak is twelve, under three different rules"; a stored
  `streak` or `done_today` column, wrong from the instant the target moves; and a streak that
  reads zero every morning — or, worse, claims a day that has not happened yet.
- **Rule:** a target — a period and a count — **re-judges** stored facts rather than relabelling
  them. "I did it on the 3rd" is true whatever the target is, so nothing stored changes meaning
  and the target is editable at any time; only the derived verdict moves, and a test proves every
  check-in keeps its id, its date and its count across the change. That is the line against AD-36:
  a *unit* locks because it changes what a stored number means, a *target* does not because it
  changes only a judgement about it. Completion and streaks are therefore computed in SQL over the
  records, defined once in the service that owns them, and the same expression feeds the screen
  and the notification. The period currently open is **never counted as a miss**: it is dropped
  from the streak scan while unmet and extends it once met.

### AD-41 — A subjective record is one re-answerable row per day, and every figure over it is a count

- **Binds:** mood, and any future record of what a person *said* rather than what happened
- **Extends:** AD-9 and AD-30 (a derived figure is computed, never stored) and AD-40 (a
  judgement moves; the fact under it does not)
- **Prevents:** four failures, each of which looks reasonable in isolation. An **average of an
  ordinal scale** — the distance from 2 to 3 is not the distance from 4 to 5, so "your week was
  3.4" is arithmetic on labels and a number nobody chose. A **many-per-day log** whose daily
  value is then an aggregate somebody picked (a mean, or the last one), which puts a figure on
  the chart that the person never gave. **"Did not say" flattened into "no"**, so a nullable
  boolean loses its third state and a week nobody answered reads as a bad week. And a
  **denominator taken from the calendar** — days in the window rather than days answered —
  which turns silence into data.
- **Rule:** a subjective record is stored **once per day per account**, holding the answer the
  person gave. A later answer **overwrites** it: unlike an amount, which has a receipt behind
  it, a mood has no referent outside the person's memory, so a second answer is not a
  correction toward an external truth but a different answer from someone who now remembers the
  day differently — the system keeps the latest, cannot tell the two apart, and does not
  pretend to. A row exists only while it carries at least one answer; clearing the last one
  **deletes the row**, so "no row" stays the only way the data says *did not say* (the rule
  Epic 23 settled for a check-in at zero, applied to an answer rather than to an act). Every
  figure derived from such a record is a **count** — how many days carried each value, how many
  were answered at all — never a mean or a median presented as a level, and its denominator is
  always *days answered*. A scale that is ordered says only that one point is more than
  another; anything stronger is a claim the data does not carry.

### AD-42 — A glyph that a reader must name is drawn here, and never ships without its word

- **Binds:** mood, and any future scale or state rendered as a symbol a reader has to tell from
  its neighbour
- **Extends:** the Consistency Convention that charts are hand-rolled inline SVG, and AD-5's
  principle that a wire representation is chosen deliberately rather than inherited
- **Prevents:** an emoji codepoint being the interface to a graded answer. The same codepoint is
  a different drawing on iOS, Android and Windows, and this household shares neither device nor
  operating system — so two people picking "the flat-mouthed one" pick different points, and a
  legend means something different on every screen it is opened on. It also prevents the mirror
  error of **storing the glyph instead of the value**, after which restyling the faces rewrites
  history.
- **Rule:** the column holds the value; the picture is presentation and is **inline SVG drawn in
  this repository**, versioned with the code like every chart here. Every such glyph ships with
  its **word**, which is the accessible name: the SVG is `aria-hidden` and the label beside it is
  real text, so a drawing nobody can name still has a name, is speakable, and is findable.
  Purely decorative navigation glyphs are exempt — the bottom bar's `◪`, the calendar's layer
  chips — because they are geometric, they already sit beside their own word, and nothing asks a
  reader to distinguish one from another as an answer.

### AD-43 — A schedule is calendar arithmetic, expanded in one pure module; only counting is SQL

- **Binds:** habits, and any future rule of the form "this is due on these days"
- **Extends:** AD-9 (aggregation happens in SQL) by drawing the line it does not draw, and AD-30
  (a predicate is defined once and never copied)
- **Prevents:** four things, each of which looked reasonable at the time. A **`generate_series`
  that grows a `CASE`**: Epic 23's streak query was exactly right for "every day" and "every
  week", and expressing "the last Friday of the month" beside them costs a correlated subquery
  per month and a query nobody reads twice. A **second copy of "is today a habit day"** in the
  notifier, in the heat-map and on the page, which drift the first time any one of them changes.
  A **schedule in JSONB**, which the database cannot check, so a malformed rule is caught only in
  Python and the streak query unpacks JSON on every read. And an **RRULE string**, which can
  express rules the UI will never build a form for — a column that promises more than the app
  delivers.
- **Rule:** *which* days a rule asks for is **calendar arithmetic**, and it lives in one pure
  module (`core/schedule.py`) with no session, no models and no service imports — so every rule
  is testable without a database, and a second copy has nowhere to hide. *How many times* it was
  done is **SQL**: one `GROUP BY` for the whole page, which is what AD-9 is actually about. The
  service that owns the module is the only place that knows both. The shape a schedule may take
  is **typed columns with CHECK constraints**, one per parameter, with a single constraint that
  refuses every combination except the one its kind requires — so the database, not only the
  service, knows that a weekday schedule without weekdays is not a schedule. The vocabulary is
  fixed: an **occasion** is one thing the rule asks for, with inclusive bounds; it is **met** when
  the records inside it reach the target; the occasion containing today is **open** and, per
  AD-40, is never a miss. A streak counts **occasions**, not days — so a day the rule never asked
  for is neither a miss nor a free pass.

### AD-44 — The API answers with a code and an English sentence; the client owns every displayed word

- **Binds:** every error the API returns, and the one place on the server that writes prose anyway
- **Extends:** AD-14 (the API has no coupling to the web client) and AD-16 (one typed client)
- **Prevents:** three ways a translated app leaks its server's language. **Rendering `detail`**,
  which puts an English sentence in the middle of a French screen the moment anything goes wrong
  — the largest single source of untranslated text in an app that thinks it is translated.
  **Translating on the server**, via `Accept-Language`, which makes the API speak the web
  client's language and puts a second catalogue in Python for a client that already has one.
  And **guessing from the status**, which cannot work: a 409 on a habit and a 409 on a category
  need different words, and a 401 is a wrong password on one path and an expired session on
  another — a mistake this codebase actually shipped, and which produced "Your session has
  expired" on a mistyped password.
- **Rule:** every refusal carries `{"detail": "<English sentence>", "code": "<stable fact>"}`.
  The **code is the contract** — renaming one is a breaking change — and the client keys its own
  wording off it. The sentence is the **fallback**, and it is deliberately still sent: a code the
  client has never heard of degrades to English rather than to a blank banner, and seeing English
  is the visible sign that a code needs adding. The client is then the **only** place that turns
  a stored fact into words, which is why the server sends a habit's schedule as a rule and never
  as a sentence, and why the dashboard names its own periods rather than rendering the label the
  summary carries.
  **The one exception is the push digest**, and it is an exception because it has no client: it
  is composed by cron on the host, hours after anyone was last in a browser, and arrives as an
  operating-system notification with nothing in between. So `services/push.py` reads
  `users.language` and writes the sentence itself — which is also why the language is an account
  column rather than a browser preference (0019), and why the plural rule is written down on both
  sides rather than assumed to be `!= 1`.

### AD-45 — Nutrition is a rate over a declared basis; a missing figure is counted, never zeroed; and the module owns its own unit vocabulary

- **Binds:** recipes, meals, the calendar's meals layer, client
- **Extends:** AD-29 (a quantity is a fact and a rate is derived from it) and AD-9/AD-30 (a
  derived figure is computed once and never duplicated), and draws the line AD-29 does not:
  what happens when the rate itself is *unknown*, and whether one closed unit list serves
  every module.
- **Prevents:** four failures, each of which looked reasonable at the time.

  A **`kcal` column on `recipes`**, which is the obvious way to build this and is wrong the
  first afternoon somebody corrects a quantity — with nothing in the row to say the stored
  figure and the ingredients under it have stopped agreeing.

  **NULL summed as zero.** Nutrient columns must be nullable, or a food nobody has fully
  typed cannot be used at all; and the moment they are, `SUM` treats "not known" as "none",
  and every total built on it is quietly too low. The mirror mistake is refusing to report
  anything when one contributor is incomplete, which throws away the best answer available.
  Neither is honest: the figure and its incompleteness travel together.

  **One shared unit list.** Recipes need grams and millilitres; AD-29's ledger list has
  neither. Adding them there makes `g` selectable beside `kg` on an expense, and AD-29 keys
  a unit-price series by `(category, unit)` and converts nothing — so a household that typed
  one this month and the other next month gets two series, each half right, with no warning.

  And a **unit that changes meaning under stored data.** A food's basis is not a label: "200"
  beside a food measured per 100 g is two hundred grams, and the same 200 beside the same
  food measured per 100 ml is two hundred millilitres. Changing it silently reinterprets
  every quantity already typed — which is exactly what AD-36 refuses for the account's
  currency and its weight unit.

- **Rule:** a food stores its nutrition **per one basis amount** — 100 g, 100 ml, or one of
  the thing — and that is the only nutrition figure written anywhere. Every other figure is
  derived on read: an ingredient's contribution is `rate × quantity / basis_amount`, a
  recipe's totals are one SQL `GROUP BY` over those, its per-serving figures are those
  divided by `servings`, and a meal's contribution is the per-serving figure scaled by the
  portion. No column, row or table stores a total.

  Nutrient columns are **nullable, and NULL is not zero**. Every derived figure carries a
  **count of the contributors that had no value** beside the partial sum. A figure over
  contributors that *all* lacked the nutrient is `null` — the same exception AD-29 already
  carves out for a period with no quantified rows, and for the same reason: `0.0000` would
  be a claim about the food rather than an absence of data. This is the one place AD-22's
  zero-fill rule is deliberately not applied.

  Where a single line's arithmetic and an aggregate are both needed, **both exist and a test
  holds them equal** — the aggregate in SQL per AD-9, the line in one Python function used
  by every per-row reader. Two implementations is the drift AD-30 warns about, so the
  equality is asserted over a recipe with several ingredients, exactly as AD-29 specifies
  for unit prices.

  A module that compares quantities **within** its own measures owns its own **closed unit
  list**, extended by migration and never by free text. The recipes module's list is `g`,
  `ml`, `unit`; AD-29's ledger list is untouched. There is no conversion between units in
  either list. An ingredient's unit is not a choice: it is **obliged** by its food's basis, a
  rule that spans two tables and therefore lives in the service with a stable code rather
  than in a CHECK.

  A **basis locks once anything depends on it** (AD-36), because it reinterprets stored
  quantities; the nutrition figures beside it never lock, because they re-judge rather than
  relabel (AD-40). Every nutrition value crosses the wire as a **decimal string**, never a
  JSON number: a stored per-basis figure at two places, so it round-trips exactly through a
  client that echoes it back, and a derived figure at four under AD-29's rate type. Both are
  rounded ROUND_HALF_UP before formatting, on both sides — the client sums and rounds in
  whole ten-thousandths, the way it already sums money in whole cents.

## Consistency Conventions

| Concern | Convention |
| --- | --- |
| Naming — tables, columns | `snake_case`, plural tables (`entries`), singular FK columns (`category_id`). |
| Naming — Python | Modules `snake_case`, ORM classes singular `PascalCase` (`Entry`), Pydantic schemas suffixed by role (`EntryCreate`, `EntryOut`). |
| Naming — API | Plural nouns under `/api`, e.g. `/api/entries`, `/api/savings/types`. |
| Naming — React | Components `PascalCase.tsx`, hooks `useThing.ts`, one component per file. |
| Ids | `uuid` primary keys. Generated in the application for `users` (AD-19), by `gen_random_uuid()` elsewhere. No sequential integers in URLs. |
| Dates | Calendar facts are `DATE` (`occurred_on`). Audit stamps are `TIMESTAMPTZ` (`created_at`). Month parameters are `YYYY-MM` strings. |
| Money on the wire | Decimal strings, always two places: `"1250.00"`. |
| Error shape | `{"detail": "<message>"}` — FastAPI's default, used uniformly. Validation errors keep FastAPI's 422 body. |
| Errors — status | 401 unauthenticated · 403 authenticated but forbidden on own data · 404 missing *or* another user's · 409 uniqueness or `RESTRICT` conflict · 422 validation. |
| Mutation | State changes only through service functions, inside the one request transaction (AD-4). No ORM writes from a router. |
| Config | Read from the settings object, never `os.environ` at a call site. |
| Auth coverage | Every router except `/api/auth/register`, `/api/auth/login` and `/health` depends on the current-user dependency. |
| Charts | Hand-rolled inline SVG components under `frontend/src/charts/`. No chart library in v1. |
| Disclosure, not dialog | There is no modal in this application. Something that opens over the page is a button carrying `aria-expanded` plus a panel — Escape closes it, focus returns to the button, nothing is trapped and nothing is made inert. Adding a real dialog means adding a focus trap, scroll locking, `aria-modal` and a 375px design, and is a decision to be argued rather than a component to be reached for. |
| Logging | Standard library `logging`, one logger per module. Never log a request body, a token, a password or an email. |

## Stack

Verified live on 2026-08-29 against PyPI, the npm registry and Docker Hub.

| Name | Version |
| --- | --- |
| Python | 3.13 |
| fastapi | 0.141.1 |
| uvicorn | 0.52.4 |
| sqlalchemy | 2.0.52 |
| alembic | 1.19.1 |
| psycopg[binary] | 3.3.4 |
| pydantic | 2.13.5 |
| pydantic-settings | 2.15.0 |
| argon2-cffi | 25.1.0 |
| pyjwt | 2.13.0 |
| pytest | 9.1.1 |
| httpx | 0.28.1 |
| ruff | 0.16.5 |
| postgres (image) | 18-alpine |
| node | 22.23.2 |
| react / react-dom | 19.2.8 |
| vite | 8.2.2 |
| @vitejs/plugin-react | 6.1.1 |
| vitest | 4.1.11 |
| react-router-dom | 7.18.3 |
| @testing-library/react | 16.3.3 |
| jsdom | 30.0.1 |

Node 22 and Python 3.13 are the installed workspace toolchain and lag the current Active LTS
(Node 24) and current Python (3.14). Held deliberately so this project matches the rest of the
workspace; see Deferred. TypeScript is pinned by a real `tsc` and `vite build` run in the client
slice, not asserted here — `7.0.2` is the first candidate, latest 5.x the fallback.

## Structural Seed

### Core entities

```mermaid
erDiagram
  users ||--o{ categories : owns
  users ||--o{ entries : owns
  users ||--o{ savings_types : owns
  users ||--o{ savings_contributions : owns
  users ||--o{ budgets : owns
  users ||--o{ savings_targets : owns
  categories ||--o{ entries : classifies
  categories ||--o| budgets : "capped by"
  savings_types ||--o{ savings_contributions : classifies
  savings_types ||--o| savings_targets : "targeted by"
  users ||--o{ spaces : owns
  users ||--o{ inventory_items : owns
  spaces ||--o{ inventory_items : holds
  inventory_items ||--o{ inventory_item_changes : "logged by"
```

The inventory cluster (`spaces`, `inventory_items`, `inventory_item_changes`) has no edge to the
ledger cluster, by AD-31.

Every entity except `users` carries `user_id`, is governed by AD-1, and every relationship drawn
here is a composite foreign key including `user_id` per AD-18.

### Request path — where tenancy is established

```mermaid
sequenceDiagram
  participant C as Client
  participant R as Router
  participant Dep as session dependency
  participant PG as Postgres (runtime role)
  C->>R: request + Bearer JWT
  R->>Dep: depends(get_session)
  Dep->>Dep: decode JWT, validate sub as UUID
  Dep->>PG: BEGIN
  Dep->>PG: SELECT set_config('app.user_id', :uid, true)
  R->>PG: service queries — RLS filters by app.user_id
  Dep->>PG: COMMIT (only here)
```

### Deployment and environments

```mermaid
graph LR
  subgraph Browser
    SPA[React static bundle]
  end
  subgraph Host["Any host — no provider SDK"]
    API[FastAPI / uvicorn container]
    PG[(Postgres 18)]
  end
  SPA -->|HTTPS JSON, Bearer| API
  API -->|runtime role, RLS forced| PG
  MIG[Alembic migrations] -->|owner role, DDL| PG
```

Three environments, one shape. **Local** is `docker compose` — Postgres plus the API, with the
frontend on the Vite dev server proxying `/api`. **Test** is that same Postgres on a throwaway
database created and dropped per run, exercised as the runtime role so AD-24's assertions mean
something. **Production** is the same two containers behind whatever TLS terminator the host
provides, configured entirely by environment variables. Migrations run as a separate step with the
owner credentials before the API starts; the API image never carries owner credentials.

### Source tree

```text
MinimalBudget/
  docker-compose.yml     # postgres + api, local and test
  backend/
    app/
      api/               # routers, one module per resource
      services/          # business rules and aggregation queries
      models/            # SQLAlchemy entities
      schemas/           # pydantic request/response models
      core/              # settings, security, session dependency (AD-3, AD-4)
      main.py
    migrations/          # alembic; owns RLS policies, grants, the AD-19 function
    tests/
  frontend/
    src/
      api/               # the single typed client (AD-16)
      components/
      pages/
      charts/            # inline SVG
  docs/
```

## Capability → Architecture Map

| Capability / Area | Lives in | Governed by |
| --- | --- | --- |
| Registration, login, current user | `api/auth.py`, `services/auth.py`, `core/security.py` | AD-13, AD-19, AD-23, AD-15 |
| Per-user isolation | `migrations/` policies, `core/db.py` | AD-1, AD-2, AD-3, AD-4, AD-8, AD-18, AD-24 |
| Categories | `api/categories.py`, `services/categories.py` | AD-6, AD-7, AD-12, AD-20, AD-21 |
| Income and expense entries | `api/entries.py`, `services/entries.py` | AD-5, AD-6, AD-7, AD-10, AD-12, AD-18, AD-20 |
| Savings types and contributions | `api/savings.py`, `services/savings.py` | AD-5, AD-10, AD-12, AD-20, AD-21 |
| Budgets and savings targets | `api/budgets.py`, `api/savings.py` | AD-5, AD-8, AD-11, AD-18, AD-21 |
| Dashboard summary and trends | `api/dashboard.py`, `services/dashboard.py` | AD-9, AD-10, AD-5, AD-22 |
| Quantity, unit and unit-price series | `api/entries.py`, `api/dashboard.py`, `services/dashboard.py` | AD-29, AD-9, AD-10 |
| Inventory — spaces, items, log, restock predicate | `api/inventory.py`, `services/inventory.py`, `models/inventory.py` | AD-30, AD-31, AD-8, AD-12, AD-18, AD-21 |
| React client | `frontend/src/` | AD-5, AD-16, AD-20 |
| Calendar — one day at a time, composed from every module | `frontend/src/pages/CalendarPage.tsx`, `api/inventory.py`, `api/recurring.py` | AD-37, AD-38, AD-39, AD-10, AD-31 |
| Habits — schedules, check-ins with a time, streaks | `api/habits.py`, `services/habits.py`, `models/habits.py`, `core/schedule.py` | AD-43, AD-40, AD-35, AD-30, AD-18, AD-21 |
| Language — the account's, and the words drawn from it | `frontend/src/i18n/`, `api/auth.py`, `services/push.py`, migration 0019 | AD-44, AD-36, AD-14, AD-16 |
| Errors — a code and a sentence | `core/errors.py`, `main.py`, `frontend/src/i18n/errors.ts` | AD-44, AD-8, AD-20 |
| Mood — the day's two answers, the strip and the tally | `api/mood.py`, `services/mood.py`, `models/mood.py`, `frontend/src/components/MoodCheckin.tsx` | AD-41, AD-42, AD-31, AD-37, AD-24 |
| Test strategy | `backend/tests/` | AD-24 |

## Deferred

- ~~**TypeScript major version.**~~ **Settled 2026-08-29: `typescript@7.0.2`.** `tsc -b` and
  `vite build` both pass against Vite 8.2.2 and Vitest 4.1.11 on this codebase, so the 5.x fallback
  was not needed. The one thing 7.0 does lack — an importable programmatic API before 7.1 — affects
  library consumers, not the CLI, and nothing here imports `typescript`. Decided by running the
  build, which is the whole reason it was deferred rather than asserted.
- **Node 24 / Python 3.14.** Both are current; both are deliberately not adopted so this project
  matches the installed workspace toolchain. Revisit when the workspace upgrades, together.
- **Pagination.** Not needed at single-user data volumes. AD-20's envelope makes adding a cursor
  additive, so this deferral cannot cause divergence.
- ~~**Rate limiting and lockout on login.**~~ **Came due 2026-08-30**, when the instance was
  pointed at the public internet — exactly the condition this deferral named. See AD-26.
- **Refresh tokens** came due with public exposure; see AD-27. ~~**Password reset** remains out
  of scope as a self-service flow.~~ **Settled 2026-09-05 without email:** recovery codes, see
  AD-32 and Epic 12. The operator command stays as the fallback for someone who lost the codes
  as well. **Email verification** is still deferred: on an invite-only instance the invite is the
  vouching step.
- ~~**Recurring transactions.**~~ **Built as Epic 13** (2026-09-05), on the propose-first
  model recorded in the 2026-08-30 direction note. Materialisation is pull-based; see AD-33.
- ~~**Push notifications.**~~ **Built as Epic 18** (2026-09-05), on cron rather than an
  in-process scheduler; see AD-34. The deferral's reasoning stands — it did need a push
  service, VAPID keys and a schedule — and each is now provided explicitly rather than
  assumed.
- ~~**CSV export.**~~ **Built as Epic 16** (2026-09-05). Streamed, and every cell neutralised
  against spreadsheet formula injection — the export is opened by people, in Excel.
- **Per-month budget overrides.** AD-11 fixes the v1 meaning; the schema takes a nullable `month`
  column later without a rewrite.
- **Connection pool sizing and read replicas.** No load justifies tuning them; defaults stand until
  a measurement says otherwise.
- **CI/CD pipeline and the specific host.** Deliberately undecided — AD-15 keeps every host
  reachable. Revisit at deploy time.
- **Observability beyond stdlib logging.** No metrics or tracing stack in v1; the deployment has
  one API container.

- ~~**Vendor on entries.**~~ **Built as Epic 17** (2026-09-05), when the condition this
  deferral named was met: there is now a comparison to make, so the reference table earns
  its keep.
- **Payment method.** A ledger-wide attribute with its own dashboard implications; its own epic.
- **A week view on the calendar.** Real value on a phone, and a second layout with its own
  density rules. The day panel answers the same "what happened on this day" for a fraction of
  the cost, so this waits until somebody misses it.
- **Marking a day as reviewed.** Not merely deferred — **rejected in this shape**: it is a
  stored flag over facts the data already knows, which is what AD-30 exists to forbid. If it is
  ever wanted it needs a real fact to hang on ("I reconciled the statement to here"), which is a
  different feature with a different table.
- **Richer habit periods.** `every N days` needs an anchor and a rolling window, so "am I on
  track" stops being a calendar question; `specific weekdays` is a `weekdays SMALLINT NULL`
  bitmask with a CHECK that it is only set for a weekly period; `month` is one more value in the
  period CHECK. Each is additive to the schema of migration 0016, and none is v1.
- **A quantity on a check-in.** `amount NUMERIC(10,3) NULL` plus a unit from a closed list, on
  the AD-29 pattern. It arrives with a decision about what the *target* then means — three
  sessions or ninety minutes — which is why it is not a column added quietly.
- **A skip distinct from a miss** on a habit. A skip is a *decision*, so by AD-33's reasoning it
  must be a recorded row rather than a computed one, and it changes what a streak means. Its own
  decision, not a flag.
- **A price series on the dashboard.** Needs a "watched category" notion first. The category
  page has it (Epic 10); lifting it is additive.
- **Unit conversion.** Never planned: a series is per `(category, unit)`, and that is what was
  paid.
- **Date and expiry reminders.** `restock_on DATE NULL` and `expires_on DATE NULL`, each a second
  term OR-ed into the AD-30 predicate in its one location. `restocked_at` already exists so a
  "you buy this every N days" figure needs no backfill.
- **Push notifications.** Needs a push service, VAPID keys and a scheduler. Reminders are
  surfaced on open, on the dashboard.
- ~~**Ledger ↔ inventory link and the shopping list.**~~ **Built as Epic 14** (2026-09-05),
  exactly as this deferral described: a purchase-history join table, the `UNIQUE (user_id, id)`
  on `entries` that AD-18 required (added by migration 0010), and one explicit endpoint that
  restocks and records the expense in one transaction. Auto-restock from a grocery entry stays
  rejected: a single entry covers many items and nothing in it says which.
- **Unit-quantified items.** Reuse the AD-29 unit list on `inventory_items` when someone needs
  `2.5 kg` rather than `3`.
- **Photos on items.** Not planned: the first blob in the system, outside `pg_dump`, so the first
  restore after an upload would be the first partial restore.

- **A mood streak, or any "you have logged N days in a row" figure.** Not deferred —
  **rejected**. The brief says no gamification, and a streak over a *feeling* is worse than
  gamification: it rewards answering rather than answering honestly, and the cheapest way to
  keep one is to tap the same face every night. Habits earn a streak because what is counted
  is an act somebody chose to do (AD-40); a mood is not an act.
- **Correlating mood with spending.** Explicitly deferred, and the schema is deliberately not
  shaped toward it — it stores what a person answered, not what a chart would want. What a
  later feature would actually need: a *page* reading `/api/mood/history` and
  `/api/dashboard/trends` and drawing two series on one time axis, with no server-side
  statistic at all (AD-31 forbids the join in a service; AD-37 routes the read to the edge).
  To say anything stronger than "here are two lines" it would need enough paired points that a
  coefficient is not noise — a household produces a few dozen a month, where a correlation's
  confidence interval comfortably contains zero — a hypothesis fixed before looking, or it is a
  search over however many categories exist, and a decision about dating, since spending is
  dated by `occurred_on` (a day a person chose, often typed days later) while a mood is dated
  by the day it is about. The brief's line has not lapsed: no advice, no predictions. Two lines
  on one axis is a picture; "you spend more when you are sad" is a claim this data cannot carry.
- **A "why" tag on a mood** (work, sleep, people, health). Deferred, not refused. It is the
  first thing that turns a two-tap answer into a form, and a fixed tag list is itself a claim
  about what makes people feel things. It arrives, if ever, as its own reference table on the
  AD-12 pattern.
- **Several moods in one day.** Not a column: a day row that became an aggregate of intraday
  points would be a derived figure stored, which AD-41 exists to forbid. It is a second table
  and a different feature — an intraday log — with the day's answer staying what the person
  said about the day.
