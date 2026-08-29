# MinimalBudget

A small personal finance tracker. Manual entry, no bank linking, one question:
**did I earn, spend and save what I meant to this month?**

![The MinimalBudget dashboard: monthly totals, budget versus actual per category, savings progress, and six months of trend](docs/images/dashboard.png)

Per-user isolation is enforced by Postgres row-level security, and is proven by tests that run
queries as a second user rather than by reading a policy and believing it.

---

## What it does

- Record **income** and **expense** entries — amount, category, date, optional note. Typing a
  category that does not exist yet creates it.
- Record **savings contributions** against savings types (`startup`, `vacation` and `investment`
  are seeded; add your own).
- Set a **standing monthly budget** per expense category and a **monthly target** per savings type.
- A **dashboard** for any month: income, expense, net and saved; budget versus actual per category;
  savings progress per type; and six months of trend, with a small multiple per category.

### Not in v1

Bank sync, recurring transactions, multi-currency, CSV export, native mobile, password reset. A
React Native client reusing this same API is the v2 plan, which is why the API is plain JSON with
bearer tokens and no cookie or template coupling.

---

## Stack

| | |
| --- | --- |
| Frontend | React 19, TypeScript 7, Vite 8, hand-rolled SVG charts (no chart library) |
| Backend | FastAPI, SQLAlchemy 2, Alembic, Python 3.13 |
| Database | Postgres 18, row-level security enabled **and forced** on every table |
| Auth | Argon2id password hashing, short-lived HS256 JWT |
| Config | Environment variables only. No provider SDKs — the build is host-agnostic. |

---

## Running it

You need Docker, Python 3.13 and Node 22.

```bash
cp .env.example .env
```

Fill in `.env`. Every password and `SECRET_KEY` needs a real value — nothing has a working
default, and the API refuses to start without them. Generate the secret with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Start Postgres. The first boot creates both database roles from your `.env`:

```bash
docker compose up -d db
```

Install and migrate the backend. Migrations run as the **owner** role; the API runs as a separate
unprivileged one:

```bash
cd backend && python -m venv .venv && ./.venv/Scripts/python.exe -m pip install -e ".[dev]"
```

```bash
cd backend && ./.venv/Scripts/python.exe -m alembic upgrade head
```

Optionally load a demo account with six months of plausible data:

```bash
cd backend && ./.venv/Scripts/python.exe seed.py
```

Run the API:

```bash
cd backend && ./.venv/Scripts/python.exe -m uvicorn app.main:app --reload
```

And the client, in another terminal — it proxies `/api` to the backend in development:

```bash
cd frontend && npm install && npm run dev
```

Then open <http://localhost:5173>. If you seeded, sign in as `demo@example.com` /
`demo-password-1234`.

On macOS or Linux the venv binary is `.venv/bin/python` rather than `.venv/Scripts/python.exe`.

---

## Tests

```bash
cd backend && ./.venv/Scripts/python.exe -m pytest -q
```

```bash
cd frontend && npm test
```

The backend suite runs against **real Postgres** on a throwaway database it creates and drops per
run. There is deliberately no SQLite path: SQLite has no row-level security, so every isolation
assertion would pass against it while proving nothing.

---

## How the isolation actually works

This is the part of the project worth reading the code for. Four decisions carry it, and each one
exists because the obvious alternative fails in a specific way.

**The database is the authority, not the application.** Every user-scoped table has
`ENABLE ROW LEVEL SECURITY` *and* `FORCE ROW LEVEL SECURITY`. Application-level `WHERE user_id`
filters are defence in depth; they are never the only thing between two users. A schema test walks
every table and fails if one is missing its policies, so a new table cannot ship unprotected.

**The app connects as a role that cannot bypass its own policies.** Migrations run as the schema
owner; the API connects as an unprivileged role with DML only, no DDL and no `BYPASSRLS`. `FORCE`
matters because the owner would otherwise skip the very policies it just installed. The runtime
role holds `INSERT` but not `SELECT` on `users.password_hash` — it can write a hash and can never
read one back.

**Tenancy is set once per request, through a bound parameter.**

```python
SELECT set_config('app.user_id', :uid, true)
```

`SET LOCAL` is forbidden in this codebase, and a test enforces that. It takes no bind parameter,
so using it would push you toward interpolating a JWT claim into SQL. The `sub` claim is parsed as
a UUID before it can reach this call. Only the session dependency commits — a `commit()` inside a
service would end the transaction and silently discard the tenant, after which every query returns
nothing and the endpoint answers `200` with empty data.

**Foreign keys carry `user_id`, because RLS does not cover them.** From the Postgres manual:
referential integrity checks *always* bypass row security. So a plain `category_id` foreign key
would let user B create an entry pointing at user A's category: B learns the id exists, and A can
never delete that category again. Every foreign key between user-scoped tables is composite and
includes `user_id`, so the database refuses the reference outright.

Each of these is covered by a test that was **watched fail**. Weakening the policy to
`USING (true)` turns eight tests red; reducing that foreign key to a single column turns the
cross-user reference test red. Green tests that have never failed are decoration.

`docs/architecture.md` has the full set of decisions, each with what it binds and which divergence
it prevents.

---

## Layout

```text
backend/
  app/api/         routers — routing and status codes, no SQL
  app/services/    business rules and the aggregation queries
  app/models/      SQLAlchemy entities
  app/core/        settings, security, the session dependency
  migrations/      schema, RLS policies, grants
  tests/
frontend/
  src/api/         the single typed client — nothing else calls fetch
  src/pages/
  src/charts/      inline SVG
docs/              brief, PRD, architecture, epics
```

---

## Licence

MIT. See [LICENSE](LICENSE).
