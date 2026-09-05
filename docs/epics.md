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
| FR-18 | A user can record an expense entry with an optional quantity and unit, and read its unit price. |
| FR-19 | A user can read a month-over-month unit-price and quantity series per category and unit. |
| FR-20 | A user can create, list, rename and delete spaces. |
| FR-21 | A user can create, list, amend, move and delete items within their spaces, each with a name, a whole-number quantity, an optional cost, an optional restock threshold and an optional note. |
| FR-22 | A user can list the items that need restocking, across all spaces. |
| FR-23 | A user sees the count of items needing restocking on the dashboard. |
| FR-24 | A user can see an item's quantity over time and restocks per space per month. |
| FR-25 | A user can do all of the above through the React client, on a phone. |
| FR-26 | A family member can install the client on a phone's home screen and open it without browser chrome. |
| FR-27 | An account has one currency, USD or EUR, chosen at sign-up, and every amount is shown in it. |
| FR-28 | A signed-in user can generate recovery codes and change their password. |
| FR-29 | A user who forgot their password can set a new one with their email and one recovery code, without the operator. |
| FR-30 | A user can define a recurring income or expense with a weekly, monthly or yearly cadence. |
| FR-31 | A recurring entry is proposed on its due date and becomes an entry only when confirmed, unless the template opted in to automatic creation. |
| FR-32 | A user sees on the dashboard how many recurring entries are waiting for them. |
| FR-33 | A user can read a shopping list of everything below its threshold, with a suggested quantity and an estimated cost. |
| FR-34 | Ticking an item off the list restocks it and records the expense in one action, and the purchase is kept as history. |
| FR-35 | A user can search their entries by note or category name, and their items by name or note. |
| FR-36 | A user can widen the dashboard's trend window from six months to a year. |
| FR-37 | A user can export their entries, savings and stock as CSV files. |
| FR-38 | A user can record which vendor an entry was bought from, creating the vendor by name. |
| FR-39 | A user can compare what each vendor charged for a category, per unit and in total. |
| FR-40 | A user can turn on notifications for a device and receive at most one daily reminder of what needs doing. |

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
| AR-6 | A rate is derived, four-place, a string on the wire, null when absent; units are a closed list. | AD-29 |
| AR-7 | "Needs restocking" is one SQL predicate shared by the list filter and the dashboard; the quantity log is append-only by grant. | AD-30 |
| AR-8 | No service imports another module's models; the dashboard page composes endpoints. | AD-31 |
| AR-9 | The service worker never caches `/api` or `/health`; hashed assets are cache-first only because Vite content-hashes filenames. | AD-14, AD-27 |
| AR-10 | Currency is an attribute of the account, never of an entry; changing it relabels and is refused once the ledger holds a row. | AD-5 |
| AR-11 | A password hash is written only by `auth_set_password`, which refuses any tenant but the transaction's own; every password change revokes all sessions. | AD-32 |
| AR-12 | Recurrence materialises on read and is idempotent; a decision is recorded, never recomputed. | AD-33 |
| AR-13 | The ledger and the inventory touch in exactly one named service, in one transaction, never as a side effect. | AD-31 |
| AR-14 | Scheduled work runs from cron as the runtime role, under RLS, and never writes domain data. | AD-34 |

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
| FR-18 | Stories 10.1, 10.3 |
| FR-19 | Stories 10.2, 10.3 |
| FR-20 | Story 11.1 |
| FR-21, FR-22 | Story 11.2 |
| FR-23 | Story 11.5 |
| FR-24 | Story 11.6 |
| FR-25 | Stories 10.3, 11.4, 11.5, 11.6 |
| AR-5 (Epics 10, 11) | Stories 10.4, 11.3 |
| AR-6 | Stories 10.1, 10.2, 10.4 |
| AR-7 | Stories 11.2, 11.5, 11.6 |
| AR-8 | Stories 11.2, 11.5 |
| FR-26, AR-9 | Story 8.1 |
| FR-27, AR-10 | Story 9.1 |
| FR-28, FR-29, AR-11 | Stories 12.1, 12.2 |
| FR-30, FR-31, FR-32, AR-12 | Stories 13.1, 13.2 |
| FR-33, FR-34, AR-13 | Stories 14.1, 14.2 |
| FR-35, FR-36 | Story 15.1 |
| FR-37 | Story 16.1 |
| FR-38, FR-39 | Story 17.1 |
| FR-40, AR-14 | Stories 18.1, 18.2 |

## Epic List

| Epic | Title | Goal |
| --- | --- | --- |
| 1 | Foundation, tenancy and auth | A person can register, log in, and reach an authenticated endpoint, on a database that refuses to show one user another user's rows. |
| 2 | Categories and entries | A user can classify and record what they earned and spent. |
| 3 | Savings, budgets and targets | A user can record what they saved and declare what they intended to spend and save. |
| 4 | Dashboard aggregation | The API can answer "did I earn, spend and save what I meant to this month?" in one call. |
| 5 | React client | The whole of the above is usable in a browser. |
| 6 | Ship preparation | The repository is presentable and the diff has been reviewed. |
| 7 | Internet-facing hardening | The instance can be exposed to the public internet for a family's real money. |
| 8 | Installable phone client | The client installs from a link on iOS and Android and runs as an app, without ever caching money. |
| 9 | Per-account currency | Each account keeps its ledger in its own currency, dollars or euros, with no conversion anywhere. |
| 10 | Unit-priced entries | An expense can say how much of what was bought, and the per-unit price can be watched over time. |
| 11 | Inventory | A user can keep track of what they have, where, see what is running out without leaving the dashboard, and see how each item's stock moved. |
| 12 | Password recovery | A person who forgets their password gets back in on their own, without email and without the operator. |
| 13 | Recurring entries | The entries that repeat every month stop being typed every month, without anything being written behind the person's back. |
| 14 | Shopping list | What is running out becomes a list, and buying it is one action that both restocks the shelf and records the spend. |
| 15 | Finding things | A year of records stays usable: search what was written, and look at a year rather than half of one. |
| 16 | Export | The data can leave, as files a spreadsheet opens and cannot be tricked by. |
| 17 | Vendors | "Is Shell dearer than Total?" becomes a number rather than an impression. |
| 18 | Notifications | The reminders reach a phone that is not open on the app, without a scheduler this deployment cannot host. |

Epics 8 and 9 were built on 2026-08-30 and 2026-09-01 and written up here afterwards, from the
commits and the tests, on 2026-09-05. Each is one story because each was one commit with one
decision in it.

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


## Epic 8: Installable phone client

Chosen over a native client because distribution decides it: a family on three continents installs
a native app through TestFlight builds that expire every 90 days, or by sideloading an APK. A PWA
is a link and *Add to Home Screen*, identically on both platforms, permanently. AD-14 had already
kept the API mobile-ready, so a native client stays possible later without rework. The phone-first
layout this depends on — bottom tab bar, quick-add button, stacked tables, category detail — landed
in the commit before it and is not separately storied.

### Story 8.1: Installable, with a service worker that never caches money

As a family member,
I want to install the app from a link and open it like any other app,
So that recording a transaction is one tap from the home screen and never a browser tab I have to find.

**Acceptance Criteria:**

**Given** the client served over HTTPS
**When** it is opened in Safari on iOS or Chrome on Android
**Then** the browser offers to install it, from a web app manifest with `name`, a `short_name` of at most 12 characters, `start_url` and `scope` of `/`, and `display: standalone` (FR-26)
**And** the manifest ships both a plain and a maskable icon, plus an Apple touch icon, all generated by `ops/make-icons.py` from the standard library rather than committed as opaque binaries
**And** the installed app draws correctly under a notch, with safe-area insets on the shell and the bottom bar
**And** the service worker is hand-rolled and **never handles `/api` or `/health`** — that data sits behind a bearer token, and a cache would outlive the sign-out meant to clear it (AR-9, AD-27)
**And** navigations are network-first with the cached shell as fallback, and hashed assets under `/assets/` are cache-first — safe only because Vite content-hashes filenames, so a changed file is a new URL
**And** there is no precache manifest: hashed names change every build, and a hand-maintained list is a standing source of post-deploy 404s
**And** the reverse proxy sets `no-store` on `sw.js`, `no-cache` on the shell, and a year-long `immutable` on `/assets/*`, and the CSP names `worker-src` and `manifest-src` explicitly
**And** a test reads the real manifest and worker source and asserts the manifest's contract and the worker's `/api` exclusion, since a worker cannot be unit-tested in jsdom
**And** the one thing not verifiable from the build machine — that the worker actually registers — is stated as unverified until it is seen on the real domain

## Epic 9: Per-account currency

Currency belongs to the account, not to the entry, and that choice is the whole epic. Per-entry
currency means a ledger holding both €50 and $50, so every total, budget comparison and trend needs
converting — which needs an exchange-rate source and, worse, *historical* rates, because converting
last March at today's rate reports a past that never happened. Per-account means every amount in a
ledger is already the same unit, all existing arithmetic stays correct, and no rate source exists to
go stale, cost money or go down. The stated limitation: one account cannot hold two currencies. For
a family where each person lives in one currency zone, that is the honest trade.

### Story 9.1: One currency per account, chosen at sign-up, locked once the ledger has a row

As a family member living in the euro zone,
I want my ledger in euros while my sibling's is in dollars,
So that every figure I see is the one I actually paid, with no conversion anywhere.

**Acceptance Criteria:**

**Given** the registration form
**When** an account is created
**Then** it carries a `currency` of `USD` or `EUR`, defaulting to `USD`, chosen at sign-up where it is free (FR-27)
**And** `users.currency` is a `VARCHAR(3)` under a `CHECK (currency IN ('USD', 'EUR'))` — a constraint rather than an enum type, so a third currency is one migration altering it — with explicit column grants to the runtime role, because AD-19 reads `users` by named columns and an ungranted column fails every profile read
**And** an unsupported value is refused by validation with `422` and by the database `CHECK` when validation is bypassed
**And** `GET /api/auth/me` reports the currency, and `PATCH /api/auth/me/currency` changes it while the account has no entries and no savings contributions
**And** once the ledger holds a single entry or contribution the change is refused with `409` and an explanation — changing the setting relabels, it does not convert, and silently relabelling a year of history is a data-integrity bug wearing a settings toggle (AR-10)
**And** setting it to its current value is not refused
**And** one account cannot change another's, and two accounts can hold different currencies
**And** on the client, every formatted amount goes through one `useMoney` hook bound to the signed-in account — no module-level global, which would be read during render while auth writes it and flash one family member's symbol in another's session — degrading to dollars outside a provider
**And** headline figures carry the symbol and table cells stay bare with the symbol in the column header, keeping tables numbers-first; the locale is pinned to `en-US` so the display format matches the input format the fields accept

---

## Epic 12: Password recovery

Added 2026-09-05. The operator console was the only way back into a forgotten account, and the
deployment has no email delivery. Recovery codes need neither: eight one-time codes generated
while signed in, kept by the person, redeemed with a new password. Chosen over an email link
(an outbound mail dependency and a mailbox that becomes the account) and over an
operator-minted reset code (still needs the operator awake). The console command stays for
whoever loses the codes as well.

### Story 12.1: Recovery codes and change-password for a signed-in user

As a family member,
I want to generate recovery codes and change my password from inside the app,
So that I hold my own way back in and never need the operator for a routine change.

**Acceptance Criteria:**

**Given** a signed-in user on the Settings page
**When** they confirm their current password and ask for recovery codes
**Then** `POST /api/auth/me/recovery-codes` returns eight codes of ten characters from an alphabet without `0/O` and `1/I/l`, shown once, formatted `xxxxx-xxxxx` (FR-28)
**And** the `recovery_codes` table, created by this story through `protect()`, stores only SHA-256 hashes; the plain text appears nowhere after the response
**And** generating a new set deletes the old one, so an old code stops working
**And** a wrong current password answers `403` — authenticated, failing a rule about their own data (AD-8)
**And** `GET /api/auth/me/recovery-codes` reports `unused` and `total` so the page can say "5 of 8 unused"
**And** `POST /api/auth/me/password` with the current and a new password changes it through `auth_set_password` and revokes every refresh token of the account (AR-11); the client signs straight back in with the new password
**And** the password field on every form can be shown in clear with a toggle

### Story 12.2: Forgot password, with a code

As a family member who forgot their password,
I want to set a new one with my email and one of my codes,
So that I am not locked out until the operator is awake.

**Acceptance Criteria:**

**Given** the sign-in page's "Forgot your password?" form
**When** an email, a code and a new password are submitted to `POST /api/auth/recover`
**Then** the email is resolved through `auth_lookup`, the transaction is pinned to that id before the code is read, the code is redeemed by a guarded `UPDATE ... WHERE used_at IS NULL`, the hash is written by `auth_set_password`, and every session is revoked — all in one transaction (FR-29, AD-19, AD-32)
**And** the response is `204`, and the client then signs in with the new password
**And** unknown email, wrong code and already-used code answer `401` with one identical body, so the endpoint is not an oracle
**And** case, spaces and the dash in a typed code are ignored
**And** a code is single-use: the same code a second time is refused
**And** a new password that fails validation does not spend the code
**And** repeated failures lock recovery for that email and for the source address under a limiter separate from login's, with the same thresholds, answering `429` with `Retry-After` (AD-26)
**And** `auth_set_password` called with another user's id, or with no tenant set, raises — proven by executing it as the runtime role under user B's tenancy against user A's id, and the runtime role still cannot `UPDATE users.password_hash` directly (AR-11)
**And** user B can see none of user A's codes, and cannot redeem one against their own email

### Story 12.3: A settings page

As a family member,
I want the things about my account in one place,
So that "change my password" is not something I go looking for beside the budgets.

**Acceptance Criteria:**

**Given** a signed-in user
**When** they tap their email in the top bar (a gear and the address, one link, on desktop and phone alike)
**Then** `/settings` shows the account (email, currency with its lock rule), password and recovery codes, and sign-out
**And** the currency control and the security card are gone from the Plan page, which is budgets and targets again
**And** the bottom bar keeps five tabs — a sixth would not fit a 375 px screen, which is why Settings hangs off the top bar
**And** a currency change re-reads the profile so every symbol on every page follows, and a refused change shows the server's reason

---

## Epic 13: Recurring entries

Rent, salary and the electricity bill are typed by hand every month. Direction was settled on
2026-08-30 — a template with a cadence, plus a materialisation step, proposing by default — and
never specced. This is that epic. The one hard rule from the note stands: *a wrong amount
created silently is worse than one not created at all*, so automatic creation is opt-in per
template and everything else waits for a yes.

### Story 13.1: Templates and pull-based materialisation

As a family member,
I want to describe the things that repeat once,
So that they stop costing me the same typing every month.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they `POST /api/recurring/templates` with a kind, an amount, a cadence of `weekly`, `monthly` or `yearly`, a first due date, and exactly one of `category_id` or `category_name`
**Then** the template is created, creating the category by name if needed (AD-12), and `next_due` starts at the first due date (FR-30)
**And** the `recurring_templates` and `recurring_occurrences` tables, created by this story through `protect()`, carry composite foreign keys including `user_id` — the template to its category with the kind pinned as on entries (AD-7, AD-18), the occurrence to its template — and `entries` gains `UNIQUE (user_id, id)` so an occurrence can reference the entry it became
**And** `GET /api/recurring/pending` materialises: it walks each active template's `next_due` up to today, inserting one occurrence per due date, and calling it twice proposes the same dates once, because `UNIQUE (template_id, due_on)` refuses a duplicate (AR-12, AD-33)
**And** a monthly template anchored on the 31st is due on the 28th of February and on the 31st of March — the anchor is the start date, so a short month does not permanently move the day
**And** a template can be paused, amended and deleted; a paused one proposes nothing and resumes where it left off, and an ended one stops at `end_on`
**And** an `end_on` before `start_on` is refused by validation and by a database `CHECK`
**And** deleting a template removes its occurrences and leaves the entries already created from them, which are records of money that moved (AD-21)
**And** a template pointing at another user's category is refused by the composite foreign key and answers `404` (AD-8, AD-18)

### Story 13.2: Confirming, skipping, and seeing it on the dashboard

As a family member,
I want to be asked before a recurring entry lands in my ledger,
So that the electricity bill goes in at what it actually was.

**Acceptance Criteria:**

**Given** a template that has produced proposals
**When** the person opens Plan
**Then** each proposal shows its due date, category and the template's amount in an editable field, above the list of templates (FR-31)
**And** confirming creates the entry on the due date; confirming with a corrected amount uses the correction and leaves the template's own figure alone
**And** confirming twice answers `409` and creates one entry, because the status change is guarded
**And** skipping records the decision, and the date is not proposed again — nor can a decided proposal be confirmed afterwards
**And** a template with `auto` set creates its entries during materialisation without proposing anything, and reading the list again does not double them
**And** deleting an entry that came from a proposal leaves the occurrence as `created` with a null `entry_id`, so the date is not proposed a second time (AD-33)
**And** the dashboard shows "N recurring entries are waiting for you", linked to Plan, listing up to three, and shows nothing when there is nothing to decide (FR-32)
**And** a corrected amount that is not a two-place decimal is refused on the client before it reaches the server
**And** user B sees none of user A's templates or proposals, and confirming or skipping one of A's answers `404`

---

## Epic 14: Shopping list

The "needs restocking" filter of Epic 11 was already a shopping list without a name. This epic
gives it one, a cost, and the action Epic 11 deliberately deferred: ticking an item off restocks
it *and* records what it cost. That is the cross-module write AD-31 reserved — one explicit
endpoint, one transaction, never a side effect of recording a grocery expense, because an "$80
groceries" entry cannot say which of twenty items it covered.

### Story 14.1: The list, with an estimate that does not lie

As a family member about to go shopping,
I want a list of what is low and what it will roughly cost,
So that I can shop from my phone without opening every cupboard.

**Acceptance Criteria:**

**Given** items below their thresholds
**When** they `GET /api/inventory/shopping-list`
**Then** each row carries the item, its space, the quantity on hand, a suggested quantity, its unit cost and an estimate (FR-33)
**And** the suggested quantity clears the threshold with one to spare — a threshold of 2 at a quantity of 0 suggests 3, because buying exactly to the threshold leaves the item still low
**And** an item with no recorded cost has a `null` estimate, never `0.00`, which would be a price (AD-29's rule, applied here)
**And** the list's total covers only the rows that have a cost, and `without_cost` says how many it left out, so the figure is never quietly short
**And** an empty list totals `0.00` rather than nothing
**And** the card renders nothing at all when there is nothing to buy, and renders nothing rather than crashing on a payload it does not recognise — it sits above the shelves on the Stock page, and must not take that page down with it

### Story 14.2: Buying it, in one action

As a family member at the till,
I want ticking something off to restock it and record what I paid,
So that the two never drift apart, and neither has to be typed twice.

**Acceptance Criteria:**

**Given** an item on the shopping list
**When** they `POST /api/inventory/items/{id}/purchase` with a quantity, and optionally an amount and a category
**Then** the item's quantity rises by that many, an expense entry is created for the amount, and a `inventory_purchases` row links the two — all in the request's single transaction (FR-34, AR-13, AD-4)
**And** the restock counts as a real one: it appears in the item's history and stamps `restocked_at` (AD-30)
**And** leaving out the amount still restocks and records no entry, because something free, or paid for by someone else, is still on the shelf
**And** an amount without a category, or a category without an amount, is refused with `422` and writes neither half
**And** a failed entry leaves the item unrestocked — proven by mutation, with the restock moved *before* the entry so that ordering alone cannot explain the result
**And** purchases are listed newest first, and deleting the entry keeps the purchase with a null `entry_id`: the item was restocked whatever later happened to the expense record
**And** deleting the item takes its purchases and leaves the entries, which are records of money that moved (AD-21)
**And** the coupling lives only in `services/shopping.py`: a test reads the imports and fails if either module reaches into the other (AR-13)
**And** user B cannot read A's list, purchase A's item, or insert a purchase row against it — the composite foreign key refuses it below the API too (AD-18)

---

## Epic 15: Finding things

Small, and it earns its place the month the tables outgrow a screen. Search is server-side
rather than a filter over the rows already fetched, because filtering the current view would
quietly answer a different question — "of the entries I happen to be showing, which mention
diesel?" is not what anyone means.

### Story 15.1: Search, and a year at a time

As a family member with a year of records,
I want to find a thing I wrote down and to see a year rather than half of one,
So that the history is something I can use rather than only add to.

**Acceptance Criteria:**

**Given** entries and items
**When** `GET /api/entries?q=` or `GET /api/inventory/items?q=` is called
**Then** entries match on their note or their category's name, and items on their name or note, case-insensitively (FR-35)
**And** the phrase is escaped before it becomes a `LIKE` pattern, so searching `50%` finds the note that says "50% off" rather than matching every row — the escaping lives in `app/core/search.py`, shared by both modules because AD-31 forbids one importing the other, and a mutation test proves the escaping is load-bearing
**And** search combines with the existing `kind`, `month` and `category_id` filters rather than replacing them
**And** an empty `q` returns everything, and search never crosses a user boundary
**And** the entries table and the stock page each carry a search box, and an empty result says what was searched for
**And** the dashboard's trend window can be switched between six months and a year, remembered per device like the collapsed sections (FR-36)

---

## Epic 16: Export

Deferred since v1, and cheap insurance: a personal tracker that cannot hand back its own data
is a trap. Three endpoints, streamed, one per thing worth keeping.

### Story 16.1: CSV export that a spreadsheet cannot be tricked by

As the owner of my records,
I want my data as files I can open in a spreadsheet or keep,
So that using this app is not a decision I cannot reverse.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they `GET /api/export/entries.csv`, `savings.csv` or `inventory.csv`
**Then** each answers `text/csv` as a dated `attachment`, with `Cache-Control: no-store`, and rows are yielded one at a time rather than assembled in memory (FR-37)
**And** every field goes through a guard that neutralises **formula injection**: a note reading `=HYPERLINK("http://evil","click")` is written with a leading apostrophe, so a family member opening the file sees text rather than a live link — the text is preserved, not censored, and a mutation test turns seven assertions red when the guard is removed
**And** the same guard covers category and item names, which are user-written too
**And** monetary values are written as the decimal strings they are, never through a float (AD-5), and an unquantified entry leaves the quantity, unit and unit-price columns empty rather than zero (AD-29)
**And** a comma or a newline inside a note survives the round trip without becoming a second row
**And** an export with no data is a header row and nothing else
**And** the endpoints require a token, and one user's export contains none of another's rows
**And** the client fetches the file with its bearer token and hands it to the browser as a blob, because a plain link carries no headers, and releases the blob URL afterwards

---

## Epic 17: Vendors

The Epic 10 proposal deferred this with a condition attached: a vendor earns its keep only
once there is a comparison to make. That comparison is this epic, and it is why the vendor is
reference data per AD-12 rather than free text — `Shell`, `shell ` and `SHELL` would be three
shops, and three shops are not a comparison.

### Story 17.1: Where it was bought, and what each shop charged

As someone who fills up at two different stations,
I want to see what each one actually charged me per litre,
So that the choice is a number rather than an impression.

**Acceptance Criteria:**

**Given** an entry form
**When** a vendor name is typed
**Then** the vendor is created for that user if absent and reused case-insensitively, keeping the first spelling (FR-38, AD-12)
**And** the `vendors` table, created by this story through `protect()`, carries `UNIQUE (user_id, id)` so entries reference it compositely, and `entries.vendor_id` is nullable — every existing row is untouched (AD-18)
**And** an entry may carry `vendor_id` or `vendor_name`, never both, and a `PATCH` distinguishes absent (leave it) from explicit null (clear it)
**And** deleting a vendor that still has entries answers `409`, because it would erase which shop a year of purchases came from (AD-21)
**And** an entry pointing at another user's vendor is refused by the composite foreign key and answers `404`, below the API as well as through it
**And** `GET /api/dashboard/vendor-prices?category_id=&months=` reports, per vendor and unit, the total spent, the number of entries, and the volume-weighted unit price (FR-39, AD-29)
**And** an entry recorded without a quantity counts towards `spent` and towards no rate — its unit price is `null`, never `0.0000`, and a vendor with both kinds is reported as two rows
**And** the window is the same half-open range as everywhere else, and excludes other categories (AD-10)
**And** the category page shows the comparison when there is more than one row to compare, and its failure degrades that card alone

---

## Epic 18: Notifications

Deferred twice, with a reason that was correct: web push needs a push service, VAPID keys and
a schedule. This epic provides each explicitly. The schedule is cron on the host, not a
scheduler inside the API — see AD-34 — which is the same answer this deployment already gives
for backups.

Push is **off** on an instance that has no keys. Not degraded, not stubbed: the endpoints
answer `503` and the client hides the control, so an existing deployment is untouched until
someone runs `vapid.py` and pastes three lines into `.env`.

### Story 18.1: A device asks to be told

As a family member,
I want to turn notifications on for my phone,
So that "we are out of milk" reaches me when the app is closed, which is when it matters.

**Acceptance Criteria:**

**Given** an instance with VAPID keys configured
**When** someone turns notifications on in Settings
**Then** the browser is asked for permission only after they click — a prompt on page load is why people block notifications for good — and the subscription is stored against their account (FR-40)
**And** the `push_subscriptions` table, created by this story through `protect()`, holds the endpoint and the two browser keys, with the endpoint unique **across the table** because it identifies a browser install rather than a person
**And** a device handed to another family member follows the new account rather than notifying the old one: the previous claim is released through a `SECURITY DEFINER` function that can **only delete** by endpoint — it returns void, so it is not an oracle, and it cannot read a row, name its owner or grant anything (the AD-32 shape). `ON CONFLICT DO UPDATE` cannot do this, because resolving the conflict means updating a row row-level security correctly refuses to show the caller
**And** subscribing twice from one device is one row, and two devices are two rows
**And** turning it off is idempotent, is scoped to the caller — naming someone else's endpoint does nothing — and works **even when push is disabled on the instance**, because stopping notifications must always be possible
**And** with no keys configured, `GET /api/push/key` and `POST /api/push/subscribe` answer `503` and the status endpoint still answers, so the client hides the control rather than showing a broken one (AD-15)
**And** user B sees none of user A's subscriptions, through the API or as the runtime role

### Story 18.2: One digest a day, from cron

As the person running this instance,
I want the reminders sent by a job I can see and schedule,
So that there is no scheduler inside the API to die with the container or run twice.

**Acceptance Criteria:**

**Given** `backend/notify.py` on a cron schedule
**When** it runs
**Then** it connects as the **runtime role**, one tenant at a time, so every read obeys row-level security exactly as a request does (AR-14, AD-34)
**And** it sends at most one notification per device per day, recorded in `notified_on`, because a reminder that arrives every hour is a reminder nobody reads
**And** it sends nothing at all to a person with nothing waiting
**And** the body reads as a sentence — "2 items need restocking (Eggs, Milk). 1 recurring entry is waiting." — naming at most three items
**And** it **never materialises recurring occurrences**: it reports what is already pending, because a job nobody is watching must not create entries (AD-34)
**And** a push service answering `404` or `410` means that endpoint is gone for good, so the subscription is deleted; any other failure is left alone for the next run to retry
**And** `--dry-run` prints what would be sent and sends nothing
**And** with no keys configured it says so and exits `0`, so a cron entry on an unconfigured instance is harmless
**And** the service worker shows the notification under one tag, so a second digest replaces the first rather than stacking, and clicking it focuses an open window instead of opening a second copy of the app
**And** `backend/vapid.py` generates the key pair and prints the three lines to paste into `.env`, and the generated public key is the one derived from the generated private key — verified against the sending library's own parser

---

## Decided, not yet specced

Direction settled on 2026-08-30. Recorded here so it is not re-litigated; none of it is built,
and each needs its own epic before any code.

- **Host: a Raspberry Pi 4.** All four images are multi-arch and include `arm64/v8`, verified
  against the registry, so the stack runs unchanged on 64-bit Pi OS. The open questions are
  network and storage, not architecture — see `release-checklist.md`.
- ~~**Recurring entries.**~~ **Built as Epic 13** on 2026-09-05, exactly as described here:
  propose by default, opt-in automatic creation, materialisation on read. Savings contributions
  are still out — the template targets a category, and a contribution targets a savings type.
- **A native app, not a PWA**, because the intent is to grow past budgeting — gym plans, todos,
  other trackers. That makes this a personal-tracking platform with a budget module, and the name
  and the API shape both need to follow. The v2 Expo plan stands; the API's module boundaries are
  the thing to get right first.
- **Users stay fully independent.** No household or shared pot. Family members live in different
  countries, so there is nothing to share and the row-level security already delivers exactly
  this. No work required — recorded so the option is not revisited by accident.
- ~~**Currency: USD primary, EUR as an option.**~~ **Built as Epic 9, and differently from this
  note:** currency is per *account*, not per amount, with no rate table and no conversion. The
  per-amount model was rejected because it needs historical exchange rates to report the past
  truthfully; see Epic 9 for the trade-off.

---

## Epic 10: Unit-priced entries

Two nullable columns, one derived figure, one series. The ledger's arithmetic is untouched.

### Story 10.1: Quantity and unit on an entry, with the unit price derived on read

As a user,
I want to record that my `$60.00` fuel entry was for `40 l`,
So that the entry carries the per-litre price without me working it out.

**Acceptance Criteria:**

**Given** an authenticated user with an expense category
**When** they `POST /api/entries` with `amount`, `quantity` and `unit` alongside the existing fields
**Then** the entry is stored with `quantity` as `NUMERIC(12,3)` and `unit` as one of the closed list, and the response carries `unit_price` as a four-place decimal string equal to `amount / quantity` rounded half-up (FR-18, AD-29)
**And** the migration adds both columns as nullable, with `CHECK (quantity > 0)`, `CHECK ((quantity IS NULL) = (unit IS NULL))` and a `CHECK` restricting `unit` to `l`, `gal`, `kg`, `lb`, `kwh`, `m3`, `unit` — every existing row is untouched and reads back with `quantity`, `unit` and `unit_price` all `null`
**And** a payload carrying `quantity` without `unit`, or `unit` without `quantity`, is refused with `422` by validation **and** by the database `CHECK` when validation is bypassed
**And** a `unit` outside the list is refused with `422` and by the `CHECK`; `Litre`, `L` and `liters` are all refused rather than normalised, because the list is the normalisation
**And** `quantity` is validated by the same shape rule as money — a plain decimal string, at most three places, never a float or a JSON number
**And** `PATCH /api/entries/{id}` accepts `quantity` and `unit` together, and clears both when both are sent as `null`; a `PATCH` that would leave one set and the other unset is `422`
**And** a `PATCH` that changes `amount` changes the returned `unit_price`, because nothing stored it
**And** an income entry may not carry a quantity — `422`, and a `CHECK (kind = 'expense' OR quantity IS NULL)`
**And** `unit_price` appears on every `EntryOut`, including the list, and is `null` when the entry has no quantity

### Story 10.2: Unit-price series per category and unit

As a user,
I want to see what I paid per litre each month,
So that I notice fuel getting dearer before the monthly total tells me.

**Acceptance Criteria:**

**Given** an authenticated user with quantified entries in some months and none in others
**When** they `GET /api/dashboard/unit-prices?months=N&month=YYYY-MM`
**Then** the response carries `months` (exactly N labels, chronological, no gaps, produced by the same `generate_series` as trends) and one series per `(category_id, unit)` the user has quantified in the window, each with `category_id`, `category_name`, `unit` and `values` of length N (FR-19)
**And** each monthly value is `SUM(amount) / SUM(quantity)` over that month's entries for that category and unit, computed in SQL, quantised to four places, serialised as a `Rate` string — never the average of per-entry rates (AD-29)
**And** a month with no quantified entry for that series is `null`, not `"0.0000"`, and a test asserts the `null` explicitly
**And** each series also carries `quantity` per month — `SUM(quantity)`, zero for an empty month — so "am I buying more, or is it dearer?" can be told apart
**And** the same category quantified in `l` one month and `gal` the next yields two series, and no conversion is attempted
**And** the month window is a half-open date range (AD-10) and the series are ordered by `lower(category_name), unit, category_id` (AD-20)
**And** the dashboard service imports only ledger models (AD-31)

### Story 10.3: Recording and reading unit prices in the client

As a user on a phone at the pump,
I want to type in whichever two numbers the receipt gives me,
So that recording fuel is no slower than recording anything else.

**Acceptance Criteria:**

**Given** a logged-in user on the entry form with an expense kind selected
**When** they open the optional "quantity" section
**Then** they can enter any two of *amount*, *quantity* and *unit price*, and the third is computed on the client through the decimal helper, never with floating-point arithmetic on the money string (AD-5, AD-29)
**And** the unit is chosen from the closed list, with a display label per unit (`l` → "litres", `m3` → "m³", `unit` → "units") and the list defined once in `src/api/types.ts`
**And** the unit a category was last quantified in is remembered per device and pre-filled the next time that category is typed
**And** the section is hidden when the kind is income, and the payload sent to the API carries only `amount`, `quantity`, `unit` — never the computed rate
**And** the entries table shows the rate beneath the amount on quantified rows (`1.4990 /l`), right-aligned, and nothing on unquantified rows
**And** editing an entry in place (the existing edit flow) can add, change or clear the quantity and unit
**And** the category detail page shows a unit-price sparkline per unit present, as inline SVG, with gaps where a month is `null` rather than a line to zero (Consistency Conventions, AD-29)
**And** a validation error from the API (`422` on a bad unit) surfaces as a readable message on the field

### Story 10.4: Rate correctness against fixtures, and the isolation check

As a developer,
I want the weighted average and the rounding pinned by numbers worked out by hand,
So that a wrong join or a wrong rounding mode is caught by a test rather than by someone comparing receipts.

**Acceptance Criteria:**

**Given** a fixture with two fills in one month (`10.000 l` at `16.00` and `50.000 l` at `70.00`), one fill on the first of the next month, an unquantified entry in the same category, and a second category quantified in `kg`
**When** the unit-price series is requested
**Then** the first month's value for fuel is `"1.4333"` (the volume-weighted figure), not `"1.5000"`
**And** the unquantified entry contributes to neither numerator nor denominator
**And** the entry dated the first of the following month lands in the following month only (AD-10)
**And** a month containing exactly one quantified entry returns the same string as that entry's own `unit_price`, proving the SQL and Python quantisation agree
**And** the `kg` series is separate from the `l` series and each carries the other's months as `null`
**And** user B requesting the series sees none of user A's categories, and the existing ledger isolation suite passes with the new columns and no new exemptions (AR-5)

---

## Epic 11: Inventory

A new module beside the ledger, not inside it. Two tables, both through `protect()`, both
composite-keyed, neither referencing the ledger.

### Story 11.1: Spaces

As a user,
I want to define the places I keep things — Fridge, Garage, House stuff, or anything else,
So that my items are grouped the way my home actually is.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they `POST /api/inventory/spaces` with a name
**Then** the space is created for that user, and a second create differing only in case returns the existing one rather than a duplicate — unique on `(user_id, lower(name))` (AD-12, FR-20)
**And** the `spaces` table is created by this story with `ENABLE` and `FORCE ROW LEVEL SECURITY` through `protect()`, and carries `UNIQUE (user_id, id)` so items can reference it compositely (AD-1, AD-18)
**And** `GET /api/inventory/spaces` returns `{"items": [...]}` ordered by `lower(name), id` (AD-20)
**And** `PATCH /api/inventory/spaces/{id}` renames a space, and a rename onto an existing name (case-insensitively) answers `409`
**And** `DELETE` of an empty space succeeds; `DELETE` of a space that still has items answers `409` because the foreign key from items is `ON DELETE RESTRICT` — a space is reference data (AD-21)
**And** requesting, renaming or deleting another user's space id returns `404` (AD-8)
**And** registration seeds nothing: a new account has no spaces until it creates one, so the module is invisible to anyone who never opens it

### Story 11.2: Items, with the restock predicate defined once

As a user,
I want to record what I have, how many, roughly what it costs, and when I should be reminded to buy more,
So that "are we out of X?" is answered by the app rather than by opening the cupboard.

**Acceptance Criteria:**

**Given** an authenticated user with at least one space
**When** they `POST /api/inventory/items` with a name, a `quantity`, and **exactly one** of `space_id` or `space_name`, plus optional `cost`, `restock_below` and `note`
**Then** the item is created in that space — `space_name` creating the space for that user if absent, by the same `ON CONFLICT DO NOTHING` path categories use (AD-12, FR-21)
**And** the `inventory_items` table is created by this story through `protect()`, with `quantity INTEGER NOT NULL CHECK (quantity >= 0)`, `restock_below INTEGER NULL CHECK (restock_below >= 0)`, `cost NUMERIC(14,2) NULL CHECK (cost >= 0)`, `note VARCHAR(500) NULL`, `restocked_at TIMESTAMPTZ NULL` (set whenever the quantity goes up), `created_at`, `updated_at`, and a composite foreign key `(user_id, space_id)` → `spaces (user_id, id)` `ON DELETE RESTRICT` (AD-1, AD-18, AD-21)
**And** `cost` is `NonNegativeMoney` — a two-place decimal string on the wire, `null` when unknown (AD-5)
**And** `needs_restock` is defined **once** as a SQL expression on the model — `restock_below IS NOT NULL AND quantity <= restock_below` — and appears as a boolean on every `ItemOut` (AD-30)
**And** `GET /api/inventory/items` supports `space_id` and `needs_restock=true` filters, the second built from that same expression, and returns `{"items": [...]}` ordered by `lower(name), id` (AD-20, FR-22)
**And** `PATCH /api/inventory/items/{id}` can change any field including `space_id` (moving the item), where `quantity` is set absolutely, never as a delta
**And** a `PATCH` or `POST` naming another user's `space_id` is refused by the composite foreign key and answers `404` — never `201` from the absence of an error (AD-8, AD-18)
**And** `DELETE` removes the item; there is no soft delete
**And** the inventory service imports no ledger model, and the ledger imports nothing from it (AD-31)

### Story 11.3: Prove isolation for the inventory tables

As the owner of this system,
I want the second-user proof extended to spaces and items,
So that one family member's cupboards are as invisible to another as their budgets already are.

**Acceptance Criteria:**

**Given** users A and B, each with spaces and items, and a connection made **as the runtime role** with B's `app.user_id`
**When** B selects A's space and item rows by primary key
**Then** zero rows are returned, and B's `INSERT` carrying A's `user_id`, `UPDATE` of A's row and `DELETE` of A's row are all refused (AR-5)
**And** B attempting to `POST /api/inventory/items` with A's `space_id` is rejected by the composite foreign key and answers `404`, and A can still delete that space afterwards (AD-18)
**And** B calling `GET /api/inventory/items?needs_restock=true` sees none of A's low items
**And** through the HTTP API, reading, renaming, moving or deleting A's ids as B returns `404` and never `403` (AD-8)
**And** the schema audit test of Story 1.2 passes with both new tables, having been given no new exemptions (AD-24)
**And** the test fails loudly if `app.user_id` is left unset

### Story 11.4: The inventory page

As a user,
I want one page with every space on it,
So that I never have to remember which room I filed something under.

**Acceptance Criteria:**

**Given** a logged-in user
**When** they open the fifth bottom-nav tab (label `Stock`, route `/inventory`)
**Then** every space is shown on one page, each as a card listing its items, with a "needs restocking" badge on low items and a filter row offering *all*, *needs restocking*, and one chip per space (FR-24)
**And** quantity can be changed with `−` and `+` controls on the row, each an absolute `PATCH` of the new value, and an item at zero cannot go below it
**And** a *Running low* action on an item raises `restock_below` to the current `quantity` in one `PATCH` — a threshold, never a fabricated quantity change, so the log records only what happened
**And** the add-item form takes a name, a quantity, a space chosen from existing ones or typed as a new name, and the optional cost, threshold and note, mirroring the entry form's category-by-name path
**And** a space can be added and renamed inline, and a delete blocked by items shows the `409` as an explanation ("Fridge still has 12 items"), not a generic failure
**And** an account with no spaces sees a short empty state explaining what a space is, with the add form ready
**And** all network access goes through `src/api/client.ts` and the `{"items": [...]}` envelope is unwrapped there (AD-16, AD-20)
**And** the bottom nav's five labels fit a 375 px viewport without wrapping or truncation, verified in the browser

### Story 11.5: Restock reminders on the dashboard

As a user glancing at the dashboard,
I want to see "3 items need restocking" without opening the inventory,
So that the reminder reaches me on the screen I actually open.

**Acceptance Criteria:**

**Given** a logged-in user with items below their thresholds
**When** the dashboard loads
**Then** a card reads "N items need restocking" and links to `/inventory?filter=restock`, where N is the length of `GET /api/inventory/items?needs_restock=true` — the same endpoint and the same predicate the inventory page uses, so the two can never disagree (FR-23, AD-30)
**And** the request is made from the dashboard page alongside `summary` and `trends`, not folded into either; `services/dashboard.py` is unchanged (AD-31)
**And** the card is absent when N is zero, and absent — not an error — when the user has no inventory at all
**And** the card lists up to three item names with their spaces ("Milk · Fridge") so the most common case needs no click
**And** the card follows the dashboard's existing collapsible-section behaviour and muted styling, with no notification badge, sound or push (deferred)
**And** a failed inventory request degrades to no card, and does not blank the ledger sections

---

### Story 11.6: The quantity log, and charts per item and per space

As a user,
I want to see how an item's stock has moved and how often each space gets restocked,
So that "we seem to buy a lot of milk" is a chart rather than an impression.

**Acceptance Criteria:**

**Given** an item whose quantity has been set several times
**When** the item is created or its `quantity` changes
**Then** a row is appended to `inventory_item_changes` with `quantity_before`, `quantity_after` and `changed_at`, and a `PATCH` that leaves the quantity unchanged, or changes only another field, appends nothing (FR-24)
**And** the table is created through `protect()` with a composite foreign key `(user_id, item_id)` → `inventory_items (user_id, id)` `ON DELETE CASCADE`, and the runtime role holds `SELECT, INSERT` and nothing else on it — an `UPDATE` or `DELETE` as the runtime role is refused by the grant, and a deleted item takes its log with it under the owner's cascade (AD-21, AD-30)
**And** `GET /api/inventory/items/{id}/history?days=N` returns the item's changes in the window, oldest first, enveloped (AD-20), and `404` for another user's item (AD-8)
**And** `GET /api/inventory/restocks?months=N` returns, per space, the number of quantity increases per month — driven from the spaces so one with no restocks appears at zeroes, over a `generate_series` so no month is missing (AD-9)
**And** creating an item logs a level (`quantity → quantity`), not a change from zero, so a new item is never counted as a restock and `restocked_at` stays null until a real increase
**And** restocks are bucketed by month in UTC explicitly, the stated limitation being that a change at 00:30 local east of UTC lands in the previous UTC day
**And** on the inventory page, *History* on an item unfolds a step chart of its quantity over time as inline SVG, with the restock threshold as a dashed rule, and the page shows restocks per space per month as small multiples (Consistency Conventions)
