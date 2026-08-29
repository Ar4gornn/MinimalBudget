# PRD — MinimalBudget v1

Companion to [`brief.md`](./brief.md). Epics are ordered as vertical slices; each slice is
independently runnable and gets its own commit.

## Domain model

| Entity | Fields | Notes |
|---|---|---|
| `users` | id, email, password_hash, created_at | Email unique, case-insensitive. |
| `categories` | id, user_id, kind (`income`\|`expense`), name, created_at | Unique per (user, kind, name). Created on demand from freeform input. |
| `entries` | id, user_id, kind, category_id, amount, occurred_on, note, created_at | `amount > 0`; direction carried by `kind`, never by sign. `entries.kind` must equal `categories.kind`. |
| `savings_types` | id, user_id, name, created_at | Unique per (user, name). Seeded `startup`, `vacation`, `investment`. |
| `savings_contributions` | id, user_id, savings_type_id, amount, occurred_on, note, created_at | `amount > 0`. |
| `budgets` | id, user_id, category_id, monthly_amount | One row per (user, expense category). `monthly_amount >= 0`. |
| `savings_targets` | id, user_id, savings_type_id, monthly_amount | One row per (user, savings type). `monthly_amount >= 0`. |

Budgets and targets are **standing monthly amounts**, not per-month rows. A budget of 400 for
`food` applies to every month until changed. This is deliberate: it removes an entire dimension of
UI (pick a month, then edit that month's budget) that v1 does not need. Per-month overrides are a
v2 concern and the schema can take a nullable `month` column later without a rewrite.

## Epics / slices

### Slice 1 — Foundation and auth
- Postgres via `docker compose`, Alembic migrations, two DB roles (owner for migrations, unprivileged app role for runtime).
- RLS enabled **and forced** on every user-scoped table.
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
- Registration seeds the three default savings types.
- **Acceptance:** a test connects as the app role with user B's context and gets zero rows of user A's data, and is refused on insert/update/delete against user A's rows.

### Slice 2 — Categories and entries
- `GET/POST/DELETE /api/categories`
- `GET/POST/PATCH/DELETE /api/entries` with filters: `kind`, `month`, `category_id`.
- Posting an entry with an unknown category name creates that category for that user and kind.
- **Acceptance:** entries round-trip; a category cannot be deleted while entries reference it; cross-user access returns 404.

### Slice 3 — Savings types, contributions, targets, budgets
- `GET/POST/DELETE /api/savings/types`
- `GET/POST/PATCH/DELETE /api/savings/contributions`
- `PUT /api/savings/targets/{type_id}`, `GET /api/savings/targets`
- `PUT /api/budgets/{category_id}`, `GET /api/budgets`
- **Acceptance:** setting a target twice updates rather than duplicates; a budget cannot be attached to an income category.

### Slice 4 — Dashboard aggregation
- `GET /api/dashboard/summary?month=YYYY-MM` → totals (income, expense, net, saved), budget vs actual per expense category, target vs actual per savings type.
- `GET /api/dashboard/trends?months=N` → month-over-month income/expense/savings totals and per-category expense series.
- **Acceptance:** aggregates computed in SQL, verified against fixture data; months with no data appear as zeroes rather than gaps.

### Slice 5 — React client
- Vite + TypeScript. Login/register, entry forms, category and savings management, dashboard.
- Charts hand-rolled as inline SVG — no chart library. Rationale in `architecture.md`.
- **Acceptance:** app builds, tests pass, dashboard renders against a seeded account.

### Slice 6 — Ship prep
- README with a screenshot above the fold, LICENSE, seed script, `shipping-reviewer` pass over the full diff.

## Non-functional requirements

- **Isolation.** Data isolation is enforced by Postgres RLS, not by application `WHERE user_id = ?`
  clauses alone. Application filters are defence in depth; the database is the authority.
- **Money.** All monetary values are `NUMERIC(14,2)`. Never floats. Serialised to JSON as strings
  to survive the round trip through JavaScript numbers.
- **Auth.** Argon2id password hashing. JWT access tokens, HS256, short-lived. No refresh flow in
  v1 — expiry logs the user out.
- **Host-agnostic.** Every setting arrives through environment variables. No provider SDKs.

## Explicitly deferred

Bank sync, recurring transactions, multi-currency, CSV export, native mobile, password reset,
email verification, refresh tokens, per-month budget overrides, shared/household accounts.
