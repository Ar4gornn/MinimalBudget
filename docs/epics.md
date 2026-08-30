---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments: [docs/brief.md, docs/prd.md, docs/architecture.md]
---

# MinimalBudget - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for MinimalBudget, decomposing the
requirements from the PRD and the Architecture decisions (`AD-n`, in `docs/architecture.md`) into
implementable stories.

Each epic is a vertical slice: runnable at its end, and committed. Stories within an epic never
depend on a later story in that epic. Tables are created by the story that first needs them, not
up front.

## Requirements Inventory

### Functional Requirements

| ID | Requirement |
| --- | --- |
| FR-1 | A person can register an account with an email and a password. |
| FR-2 | A registered person can log in and receive an access token, and read their own profile. |
| FR-3 | Registration seeds three default savings types: `startup`, `vacation`, `investment`. |
| FR-4 | A user can create, list and delete categories, each scoped to a kind (`income` or `expense`). |
| FR-5 | A user can record an income entry with an amount, a category, a date, and an optional note. |
| FR-6 | A user can record an expense entry with an amount, a category, a date, and an optional note. |
| FR-7 | Recording an entry with a category name that does not yet exist creates that category for that user and kind. |
| FR-8 | A user can list, amend and delete their entries, filtered by kind, by month, and by category. |
| FR-9 | A user can create, list and delete savings types beyond the seeded three. |
| FR-10 | A user can record, list, amend and delete savings contributions against a savings type. |
| FR-11 | A user can set a standing monthly budget for an expense category, and read their budgets. |
| FR-12 | A user can set a standing monthly savings target for a savings type, and read their targets. |
| FR-13 | A user can read a monthly summary: total income, total expense, net, and total saved. |
| FR-14 | A user can read budget versus actual for each expense category for a chosen month. |
| FR-15 | A user can read savings progress versus target for each savings type for a chosen month. |
| FR-16 | A user can read month-over-month trends for income, expense and savings, and per-category expense series. |
| FR-17 | A user can do all of the above through a React web client. |

### NonFunctional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Data isolation is enforced by Postgres row-level security, not by application `WHERE` clauses alone. |
| NFR-2 | Isolation is proven by executing queries as a second authenticated user, never by reading a policy definition. |
| NFR-3 | All monetary values are `NUMERIC(14,2)`, never floats, and cross the wire as decimal strings. |
| NFR-4 | Passwords are hashed with Argon2id. Access tokens are short-lived HS256 JWTs. No refresh flow in v1. |
| NFR-5 | Every setting arrives through environment variables. No provider SDKs. The build stays host-agnostic. |
| NFR-6 | The API is plain JSON over HTTP with token auth, reusable unchanged by a future React Native client. |
| NFR-7 | Dashboard aggregation is computed in SQL, and months with no data appear as explicit zeroes. |

### Additional Requirements

Sourced from the architecture spine. These bind every story that touches them.

| ID | Requirement | AD |
| --- | --- | --- |
| AR-1 | Every foreign key between user-scoped tables is composite and includes `user_id`, because Postgres FK checks bypass RLS. | AD-18 |
| AR-2 | Tenancy is set once per request with a bound parameter, and only the session dependency commits. | AD-3, AD-4 |
| AR-3 | Another user's row answers 404; a `RESTRICT` or uniqueness conflict answers 409. | AD-8, AD-21 |
| AR-4 | Every list endpoint returns `{"items": [...]}` with a total, deterministic sort order. | AD-20 |
| AR-5 | Every slice that adds a user-scoped table ships a two-user isolation test run as the runtime role. | AD-24 |

### UX Design Requirements

No separate UX design document was produced. The brief fixes the visual direction directly: a
minimal dashboard, clean cards and tables, a muted palette, numbers first. No gamification, no
advice, no predictions. Charts are hand-rolled inline SVG (Consistency Conventions, formerly
AD-17).

### FR Coverage Map

| Requirement | Covered by |
| --- | --- |
| FR-1 | Story 1.4 |
| FR-2 | Story 1.5 |
| FR-3 | Story 1.4 |
| FR-4 | Story 2.1 |
| FR-5, FR-6 | Story 2.2 |
| FR-7 | Story 2.3 |
| FR-8 | Story 2.2 |
| FR-9, FR-10 | Story 3.1 |
| FR-11, FR-12 | Story 3.2 |
| FR-13 | Story 4.1 |
| FR-14, FR-15 | Story 4.1 |
| FR-16 | Story 4.2 |
| FR-17 | Stories 5.1, 5.2, 5.3, 5.4 |
| NFR-1 | Stories 1.2, 1.3 |
| NFR-2 | Stories 1.6, 2.4, 3.3 |
| NFR-3 | Stories 2.2, 4.1, 5.1 |
| NFR-4 | Stories 1.4, 1.5 |
| NFR-5 | Story 1.1 |
| NFR-6 | Stories 1.5, 5.1 |
| NFR-7 | Stories 4.1, 4.2, 4.3 |

## Epic List

| Epic | Title | Goal |
| --- | --- | --- |
| 1 | Foundation, tenancy and auth | A person can register, log in, and reach an authenticated endpoint, on a database that refuses to show one user another user's rows. |
| 2 | Categories and entries | A user can classify and record what they earned and spent. |
| 3 | Savings, budgets and targets | A user can record what they saved and declare what they intended to spend and save. |
| 4 | Dashboard aggregation | The API can answer "did I earn, spend and save what I meant to this month?" in one call. |
| 5 | React client | The whole of the above is usable in a browser. |
| 6 | Ship preparation | The repository is presentable and the diff has been reviewed. |

## Epic 1: Foundation, tenancy and auth

Stand up the API, the database, and the isolation machinery every later epic depends on, then put
registration and login on top of it. The epic is finished when a second user has been *shown* — by
executing queries, not by reading policies — to be unable to touch the first user's rows.

### Story 1.1: Runnable API skeleton with environment configuration

As a developer,
I want a FastAPI application that starts from environment variables alone and answers a health check,
So that every later story has a running process to add to and a single place settings come from.

**Acceptance Criteria:**

**Given** a clone of the repository and a `.env` derived from the committed `.env.example`
**When** the API is started
**Then** `GET /health` returns `200` with a JSON body
**And** every setting is read through one `pydantic-settings` object (AD-15)
**And** no secret has a working default — a missing `SECRET_KEY` or database URL fails startup with a clear error
**And** `.env.example` is committed with empty values and `.env` is ignored by git
**And** no cloud provider SDK appears in the dependency list

### Story 1.2: Postgres, migrations, two roles, and the RLS schema audit

As a developer,
I want Postgres running under `docker compose` with Alembic migrations applied by an owner role and a separate unprivileged runtime role,
So that the application can never bypass the row-level security it installs.

**Acceptance Criteria:**

**Given** `docker compose up`
**When** the migrations are run with the owner credentials
**Then** the schema is created and the runtime role exists with `SELECT, INSERT, UPDATE, DELETE` and no DDL (AD-2)
**And** the runtime role does not have the `BYPASSRLS` attribute
**And** the application connects only as the runtime role
**And** a schema audit test enumerates every table carrying a `user_id` column and fails if any lacks `rowsecurity`, `forcerowsecurity`, or at least one policy (AD-24)
**And** the test suite runs against real Postgres, with no SQLite path

### Story 1.3: The `users` table under forced RLS, and the request-scoped tenancy dependency

As a developer,
I want one dependency that opens a transaction, binds the current user id into `app.user_id`, and is the only thing that commits,
So that no route can reach the database without a tenant, and no query can silently run without one.

**Acceptance Criteria:**

**Given** the `users` table with `ENABLE` and `FORCE ROW LEVEL SECURITY` and a policy of `id = current_setting('app.user_id', true)::uuid`
**When** a request is handled
**Then** the dependency executes `SELECT set_config('app.user_id', :uid, true)` with `:uid` bound as a parameter, before any other statement (AD-3)
**And** `SET LOCAL` is not used anywhere, and no identifier or claim is interpolated into SQL text
**And** the JWT `sub` claim is parsed and validated as a UUID before it reaches that call
**And** no service or router calls `commit()` or `begin()`; only the dependency does (AD-4)
**And** a test proves that when `app.user_id` is unset, every policy matches nothing rather than everything
**And** a test proves that a `commit()` mid-request would drop the setting, documenting why AD-4 exists

### Story 1.4: Registration seeds a tenant without ever writing outside RLS

As a new user,
I want to register with an email and a password and get an account that already has my default savings types,
So that I can start recording savings immediately.

**Acceptance Criteria:**

**Given** `POST /api/auth/register` with an email and a password
**When** the request is handled
**Then** the user's UUID is generated in the application, `app.user_id` is set to it, and only then are the `users` row and the savings types inserted (AD-19)
**And** the `savings_types` table is created by this story with forced RLS and a composite-safe unique key on `(user_id, lower(name))`
**And** the three default savings types `startup`, `vacation` and `investment` exist for the new user (FR-3)
**And** the password is stored as an Argon2id hash and never returned by any endpoint
**And** the email is lowercased and trimmed before storage, and a second registration differing only in case returns `409` (AD-23)
**And** no policy anywhere admits a NULL `app.user_id`

### Story 1.5: Login and current user

As a registered user,
I want to exchange my email and password for an access token and read my own profile,
So that the client can authenticate every later request.

**Acceptance Criteria:**

**Given** `POST /api/auth/login` with valid credentials
**When** the request is handled
**Then** the lookup goes through a `SECURITY DEFINER` function owned by the owner role that returns only `(id, password_hash)` for one email, and the runtime role has no direct `SELECT` on `users` (AD-19)
**And** the response is a short-lived HS256 JWT carrying the user id in `sub`, returned as JSON with no `Set-Cookie` (AD-13, AD-14)
**And** wrong credentials and an unknown email are indistinguishable in both status code and body
**And** `GET /api/auth/me` returns the caller's own profile and `401` without a token
**And** the login route is reachable without authentication, and every other route is not

### Story 1.6: Prove isolation by executing as a second user

As the owner of this system,
I want the isolation guarantee demonstrated by running queries as a second authenticated user,
So that the claim rests on observed behaviour rather than on a policy I read and believed.

**Acceptance Criteria:**

**Given** two registered users, A and B, and a connection made **as the runtime role** with B's `app.user_id`
**When** B selects A's user row and A's savings types by their known primary keys
**Then** zero rows are returned in every case (NFR-2)
**And** B's attempts to `INSERT` a row carrying A's `user_id`, to `UPDATE` A's row, and to `DELETE` A's row are all refused
**And** the same assertions are made through the HTTP API, where reading A's resource id as B returns `404` and never `403` (AD-8)
**And** the test fails loudly if `app.user_id` is left unset, rather than passing because nothing was visible anyway

## Epic 2: Categories and entries

The recording core: what money came in, what went out, and under what label.

### Story 2.1: Categories

As a user,
I want to create, list and delete my own categories for income and for expenses,
So that I can classify entries in terms that match how I actually think about my money.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they `POST /api/categories` with a name and a kind
**Then** the category is created for that user, and a second create differing only in case returns the existing one rather than a duplicate (AD-12)
**And** `GET /api/categories` returns `{"items": [...]}` ordered by `lower(name), id` (AD-20)
**And** the `categories` table carries `UNIQUE (user_id, id, kind)` so entries can reference it compositely (AD-7, AD-18)
**And** `DELETE` of a category with no entries succeeds
**And** requesting or deleting another user's category id returns `404`

### Story 2.2: Income and expense entries

As a user,
I want to record, list, amend and delete income and expense entries,
So that I have a record of what I actually earned and spent.

**Acceptance Criteria:**

**Given** an authenticated user with at least one category of each kind
**When** they `POST /api/entries` with an amount, a `category_id`, a `kind`, an `occurred_on` date and an optional note
**Then** the entry is stored with `amount` as `NUMERIC(14,2)` and returned as a two-place decimal string (AD-5, NFR-3)
**And** an `amount` of zero or below is rejected by a database `CHECK`, not only by validation (AD-6)
**And** an entry whose `kind` differs from its category's `kind` is rejected by the composite foreign key (AD-7)
**And** the foreign key from `entries` to `categories` includes `user_id`, so an entry can never reference another user's category (AD-18)
**And** `occurred_on` is a required `DATE` with no server-side default (AD-10)
**And** `GET /api/entries` supports `kind`, `month=YYYY-MM` and `category_id` filters, where the month filter is a half-open range (AD-10)
**And** the list is enveloped and ordered by `occurred_on DESC, created_at DESC, id` (AD-20)
**And** `PATCH` and `DELETE` on another user's entry id return `404`

### Story 2.3: Creating a category by name while recording an entry

As a user,
I want to type a new category name straight into the entry form,
So that I do not have to go and create the category first.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they `POST /api/entries` with a `category_name` that does not exist for that user and kind
**Then** the category is created and the entry references it (FR-7)
**And** a payload carrying both `category_id` and `category_name`, or neither, is rejected with `422` (AD-12)
**And** a `category_name` that differs from an existing one only in case reuses the existing category rather than creating a second
**And** two concurrent requests with the same new `category_name` result in one category, not two

### Story 2.4: Prove isolation for categories and entries

As the owner of this system,
I want the second-user proof extended to the tables this epic added,
So that the guarantee holds for every table, not only the ones written first.

**Acceptance Criteria:**

**Given** users A and B, each with categories and entries
**When** B queries as the runtime role with B's tenancy for A's category and entry rows by primary key
**Then** zero rows are returned, and write attempts against A's rows are refused (AR-5)
**And** B attempting to `POST /api/entries` with A's `category_id` is rejected — the composite foreign key refuses it rather than the request quietly succeeding (AD-18)
**And** the schema audit test of Story 1.2 passes with the new tables, having been given no new exemptions

## Epic 3: Savings, budgets and targets

Intent alongside record: what the user meant to spend, what they meant to save, and what they
actually put aside.

### Story 3.1: Savings types and contributions

As a user,
I want to manage my savings types and record contributions against them,
So that I can track money set aside for distinct purposes.

**Acceptance Criteria:**

**Given** an authenticated user whose account already has the three seeded types
**When** they `POST /api/savings/types` with a new name
**Then** it is created, and a name differing only in case returns the existing one (AD-12, FR-9)
**And** `POST /api/savings/contributions` with a `savings_type_id`, an amount, a date and an optional note stores the contribution (FR-10)
**And** a contribution carrying an unknown or another user's `savings_type_id` returns `404`, and contributions **never** auto-create a savings type (AD-12)
**And** the contributions foreign key includes `user_id` (AD-18), amounts are `NUMERIC(14,2)` returned as decimal strings, and `amount > 0` is a database `CHECK`
**And** deleting a savings type that has contributions returns `409` rather than destroying them (AD-21)
**And** both lists are enveloped and deterministically ordered (AD-20)

### Story 3.2: Standing monthly budgets and savings targets

As a user,
I want to set a monthly budget for an expense category and a monthly target for a savings type,
So that the dashboard has something to compare my actuals against.

**Acceptance Criteria:**

**Given** an authenticated user with an expense category and a savings type
**When** they `PUT /api/budgets/{category_id}` with a monthly amount
**Then** the budget is created, and issuing the same `PUT` again updates it rather than creating a second row (AD-11, FR-11)
**And** a budget targeted at an **income** category is rejected
**And** `PUT /api/savings/targets/{type_id}` behaves the same way for targets (FR-12)
**And** `monthly_amount >= 0` is enforced by a database `CHECK`
**And** a `PUT` against another user's `category_id` or `type_id` is refused by the composite foreign key and answers `404` — the write path never assumes success from the absence of an error (AD-8, AD-18)
**And** deleting a category or savings type removes its attached budget or target, while entries and contributions still block the delete (AD-21)

### Story 3.3: Prove isolation and referential behaviour for this epic's tables

As the owner of this system,
I want the second-user proof and the delete semantics demonstrated for savings and budget data,
So that neither isolation nor referential integrity rests on assumption.

**Acceptance Criteria:**

**Given** users A and B with savings types, contributions, budgets and targets
**When** B queries and writes against A's rows as the runtime role with B's tenancy
**Then** every read returns zero rows and every write is refused (AR-5)
**And** `RESTRICT` is demonstrated by a delete that is blocked, and `CASCADE` by a budget row that disappears with its category (AD-21)
**And** the schema audit test passes with the new tables

## Epic 4: Dashboard aggregation

One call per question. All arithmetic in SQL.

### Story 4.1: Monthly summary, budget versus actual, savings versus target

As a user,
I want a single call that tells me what I earned, spent, netted and saved this month, and how that compares to my budgets and targets,
So that I can answer the only question this product exists to answer.

**Acceptance Criteria:**

**Given** an authenticated user with entries, contributions, budgets and targets
**When** they `GET /api/dashboard/summary?month=YYYY-MM`
**Then** the response carries total income, total expense, net, and total saved for that month (FR-13)
**And** every figure is computed by a SQL aggregate, not by summing rows in Python (NFR-7)
**And** every aggregate is wrapped so that no rows yields `0`, never `null` (AD-22)
**And** budget versus actual is built by joining **from** the budgeted categories **to** the entries, so a budgeted category with no spending appears at zero rather than vanishing (AD-22, FR-14)
**And** a category with spending but no budget appears with a null budget rather than being omitted
**And** savings target versus actual follows the same direction (FR-15)
**And** the month is interpreted as a half-open date range (AD-10) and every monetary value is a two-place decimal string (AD-5)

### Story 4.2: Month-over-month trends

As a user,
I want income, expense and savings totals over the last N months, plus per-category expense series,
So that I can see direction rather than a single month in isolation.

**Acceptance Criteria:**

**Given** an authenticated user with data in some months and none in others
**When** they `GET /api/dashboard/trends?months=N`
**Then** exactly N months are returned, in chronological order, with no gaps (FR-16, NFR-7)
**And** a month with no data is returned as an explicit zero, produced by a `generate_series` left-joined to the data rather than filled in by the client (AD-9)
**And** the per-category expense series covers every category the user has spent on in the window
**And** all arithmetic happens in SQL

### Story 4.3: Aggregate correctness against fixtures

As a developer,
I want the aggregates checked against a fixture whose expected totals were worked out independently,
So that a wrong join is caught by a number rather than by a user.

**Acceptance Criteria:**

**Given** a fixture with entries spanning a month boundary, two categories, a budgeted category with no spend, and a savings type with no contributions
**When** the summary and trends endpoints are called
**Then** every returned figure equals the independently computed expected value
**And** an entry dated the first of the following month is excluded, and one dated the last day of the month is included (AD-10)
**And** the tests fail if the budget-vs-actual join direction is reversed

## Epic 5: React client

Minimal, numbers-first, muted. Everything the API can do, usable in a browser.

### Story 5.1: Client scaffold, settled TypeScript pin, and the single typed API client

As a developer,
I want a Vite and TypeScript client whose TypeScript version was settled by a real build, with one module that owns all network access,
So that no component re-implements auth, the envelope, or the decimal-string convention.

**Acceptance Criteria:**

**Given** a fresh `npm install`
**When** `tsc` and `vite build` are run
**Then** both succeed, and the TypeScript version recorded in `package.json` is the one that actually built — `7.0.2` if it builds cleanly, otherwise the latest 5.x, with the outcome written into the architecture Deferred section
**And** all network access lives in `src/api/`, and no component or hook calls `fetch` directly (AD-16)
**And** the client attaches the bearer token, unwraps the `{"items": [...]}` envelope, and handles `401` in exactly one place (AD-20)
**And** monetary values are handled as strings and never as JavaScript numbers (AD-5)
**And** the API base URL comes from an environment variable, not a hardcoded host (AD-15)
**And** login and registration pages work end to end against the running API (FR-17)

### Story 5.2: Recording and reviewing entries

As a user,
I want to add income and expense entries and review them in a table I can filter,
So that recording a transaction takes seconds.

**Acceptance Criteria:**

**Given** a logged-in user
**When** they submit the entry form with an amount, a kind, a date, and either an existing category or a new category name
**Then** the entry is created, including the create-by-name path (FR-5, FR-6, FR-7)
**And** the entries table can be filtered by kind, month and category, and shows amounts right-aligned to two decimal places
**And** entries can be amended and deleted from the table (FR-8)
**And** a server error surfaces as a readable message rather than a silent failure

### Story 5.3: Savings and budget management

As a user,
I want to manage my savings types, record contributions, and set my budgets and targets,
So that the dashboard has intent to compare against.

**Acceptance Criteria:**

**Given** a logged-in user
**When** they open the savings and budgets screens
**Then** they can create and delete savings types, and record and delete contributions (FR-9, FR-10)
**And** they can set a monthly budget per expense category and a monthly target per savings type, where saving twice updates rather than duplicates (FR-11, FR-12)
**And** a delete blocked by referenced data shows the `409` as an explanation, not as a generic failure
**And** income categories are not offered a budget field

### Story 5.4: The dashboard

As a user,
I want one screen showing this month's totals, budget versus actual, savings progress, and trends,
So that I can see whether I earned, spent and saved what I meant to.

**Acceptance Criteria:**

**Given** a logged-in user with a seeded month of data
**When** they open the dashboard and pick a month
**Then** the month's income, expense, net and saved totals appear as cards, numbers first (FR-13)
**And** budget versus actual appears per expense category, including budgeted categories with zero spend (FR-14)
**And** savings progress versus target appears per savings type (FR-15)
**And** the trend and per-category charts are hand-rolled inline SVG with no chart library added (Consistency Conventions)
**And** the palette is muted and the layout is clean cards and tables, with no gamification, advice or prediction
**And** a month with no data renders zeroes rather than an empty or broken screen

## Epic 6: Ship preparation

### Story 6.1: Seed script and README

As a visitor to the repository,
I want a README that shows me what this is in the first screen and tells me how to run it,
So that I can judge the project without reading the source.

**Acceptance Criteria:**

**Given** a clone of the repository
**When** the README is opened
**Then** a screenshot or GIF of the dashboard appears above the fold
**And** the stack, the run instructions, and the row-level-security design are described accurately, with no aspirational features
**And** a seed script populates a demo account with a few months of plausible data, so the screenshot can be reproduced
**And** the run instructions were followed from a clean clone and worked

### Story 6.2: Licence and pre-publish review

As the owner of this repository,
I want a licence and an independent review of the whole diff before anything is published,
So that nothing ships with a leaked secret, a broken claim, or an unreviewed security hole.

**Acceptance Criteria:**

**Given** the complete v1 diff
**When** the shipping review is run over it
**Then** correctness, security and simplification findings are reported and each is fixed or explicitly accepted
**And** a LICENSE file is present
**And** no secret, `.env` file, database dump or build artifact appears anywhere in the git history
**And** nothing is pushed, published or deployed without explicit approval


---

## Epic 7: Internet-facing hardening

Added 2026-08-30, after the decision to run this on the public internet for a family's real
money. Everything below was a *documented deferral* in `docs/architecture.md`, each carrying the
condition "revisit before the instance is exposed to the public internet". That condition is now
met, so this epic is the deferrals coming due — not new scope discovered late.

The isolation model needs no change: separate private accounts is exactly what the row-level
security already enforces and proves.

### Story 7.1: Registration is invite-only

As the person running this instance,
I want registration to require a token I issue,
So that a stranger who finds the URL cannot create an account on my family's instance.

**Acceptance Criteria:**

**Given** an instance with `REGISTRATION_MODE=invite`
**When** someone posts to `/api/auth/register` without a valid invite code
**Then** the response is `403` and no user is created
**And** a code that is unknown, already used, or expired is refused identically, so the endpoint
  cannot be used to probe which codes exist
**And** an invite is single-use: a second registration with the same code is refused
**And** `REGISTRATION_MODE=open` restores the current behaviour, so local and test use is unaffected
**And** the mode has no permissive default — an unset value means invite-only, because the failure
  mode of guessing wrong is an open instance

### Story 7.2: Login resists brute force

As the person running this instance,
I want repeated failed logins against an account to be slowed and then blocked,
So that a password cannot be found by guessing from the open internet.

**Acceptance Criteria:**

**Given** a series of failed logins for one email
**When** the failures pass a threshold within a window
**Then** further attempts for that email are refused with `429` until the window passes, whether or
  not the credentials are correct
**And** the same limit applies per source address, so one attacker cannot spread across many emails
**And** a successful login clears the counter for that email
**And** the lockout response is indistinguishable between a real and an unknown email, preserving
  the property Story 1.5 established
**And** the limiter's state survives nothing — it is in-process and resets on restart, which is
  documented rather than pretended otherwise

### Story 7.3: Sessions last, and can be revoked

As a family member using this on a phone,
I want to stay signed in across days,
So that I am not re-entering a password every hour and tempted to make it a short one.

**Acceptance Criteria:**

**Given** a successful login
**Then** the response carries a short-lived access token and a long-lived refresh token
**And** `POST /api/auth/refresh` exchanges a valid refresh token for a new pair, invalidating the
  one presented (rotation)
**And** presenting an already-rotated refresh token revokes the whole family of tokens descended
  from it, because reuse means the token was copied
**And** `POST /api/auth/logout` revokes the presented refresh token
**And** refresh tokens are stored hashed, never in plaintext, and are user-scoped under the same
  row-level security as everything else
**And** the client refreshes transparently and only sends the user to sign-in when refresh fails

### Story 7.4: The data survives

As the owner of this data,
I want a backup I have restored from at least once,
So that a mistake or a dead disk does not cost my family their financial history.

**Acceptance Criteria:**

**Given** a running instance
**When** the backup script runs
**Then** it produces a compressed `pg_dump` artifact with a timestamped name
**And** restoring that artifact into an empty database reproduces every row — verified by executing
  a restore, not by asserting the file exists
**And** the script is safe to run on a schedule and prunes artifacts older than a retention window
**And** the documentation states plainly where the artifact must be copied to, because a backup on
  the same disk as the database is not a backup

### Story 7.5: It serves over HTTPS, host-agnostically

As a family member,
I want to reach it from my phone over a real HTTPS address,
So that my password and token are not sent in the clear.

**Acceptance Criteria:**

**Given** a machine with a domain pointed at it
**When** the production compose stack is brought up
**Then** TLS certificates are obtained and renewed automatically, with no provider SDK and no
  manual certificate step (AD-15 still holds)
**And** the built client is served as static files, and `/api` is proxied to the backend
**And** HTTP redirects to HTTPS, and HSTS is set
**And** the API container is not published to the host — only the reverse proxy is
**And** security headers are set: `X-Content-Type-Options`, `Referrer-Policy`, and a
  `Content-Security-Policy` the app actually runs under, verified in a browser rather than assumed

### Story 7.6: Someone else could deploy it

As the person running this in six months,
I want the deployment written down accurately,
So that I can rebuild it without re-deriving what past-me did.

**Acceptance Criteria:**

**Given** the README
**Then** it documents the production stack, every environment variable it needs, how to issue an
  invite, how to take and restore a backup, and what to do when a family member forgets a password
**And** every command in it has been run


---

## Decided, not yet specced

Direction settled on 2026-08-30. Recorded here so it is not re-litigated; none of it is built,
and each needs its own epic before any code.

- **Host: a Raspberry Pi 4.** All four images are multi-arch and include `arm64/v8`, verified
  against the registry, so the stack runs unchanged on 64-bit Pi OS. The open questions are
  network and storage, not architecture — see `release-checklist.md`.
- **Recurring entries** (income, expense and savings alike). A template with a cadence, plus a
  materialisation step. Default is to *propose* the entry for confirmation rather than create it
  silently, with per-template opt-in to automatic creation for genuinely fixed amounts like rent.
  A wrong amount created silently is worse than one not created at all.
- **A native app, not a PWA**, because the intent is to grow past budgeting — gym plans, todos,
  other trackers. That makes this a personal-tracking platform with a budget module, and the name
  and the API shape both need to follow. The v2 Expo plan stands; the API's module boundaries are
  the thing to get right first.
- **Users stay fully independent.** No household or shared pot. Family members live in different
  countries, so there is nothing to share and the row-level security already delivers exactly
  this. No work required — recorded so the option is not revisited by accident.
- **Currency: USD primary, EUR as an option.** Each amount carries its own currency; a user has a
  display currency; conversion happens at read time against a rate table. Amounts are never
  converted on write, because that destroys the figure the user actually entered.
