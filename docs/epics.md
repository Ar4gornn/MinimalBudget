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
| FR-41 | A user can define reusable routines: a named list of exercises with target sets and reps. |
| FR-42 | A user can log a workout set by set, with reps and an optional weight, and see whether a lift is going up. |
| FR-43 | A user can set the day their budget month starts on, and every month-based view follows it. |
| FR-44 | A user can read income, expense, net and saved for a month, for a year, or for all time. |
| FR-45 | A user can read every item's stock movements for a month, across all their spaces. |
| FR-46 | A user can see which recurring entries are still to fall due later in the month, without any of them being created. |
| FR-47 | A user can see a month as a calendar grid covering their own budget period, with what happened on each day. |
| FR-48 | A user can open a day and see every record on it, and reach the record itself. |
| FR-49 | A user can define a habit with a period and a target, check it in for today or a past day, and archive or delete it. |
| FR-50 | A user can see how far through the current period each habit is, its streak, and a heat-map of recent weeks. |
| FR-51 | A user can reach Habits from the bottom bar and the calendar from the Dashboard section, on a 375px phone. |
| FR-52 | A user can opt one habit at a time into the daily reminder. |
| FR-53 | A user can record, for a day, how they felt on a five-point scale and whether the day was any good, change either answer later, and clear the day entirely. |
| FR-54 | A user can see their recent days' answers and a tally of each on the Habits tab, and the day's face on the calendar. |

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
| AR-15 | A plan and a record are separate rows; deleting the plan leaves the record, via the column-list `SET NULL`. | AD-35 |
| AR-16 | A scaling unit belongs to the account and locks once anything depends on it. | AD-36 |
| AR-17 | The month boundary is the account's, applied identically by every view and by the SQL that buckets trends. | AD-10 |
| AR-18 | A year is exactly twelve budget months, so the monthly figures sum to the yearly one; all time has no bounds. | AD-10, AD-11 |
| AR-19 | A view spanning modules calls each module's own endpoint and merges at the edge; only a cross-module write earns a service. | AD-37 |
| AR-20 | A calendar grid covers the account's period, and a stored instant is placed by UTC day and said so. | AD-38, AD-10 |
| AR-21 | A projection is computed, never written, never actionable, and never speaks for a date that already carries a decision. | AD-39, AD-33 |
| AR-22 | A target re-judges rather than relabels, so it changes freely; its figures are derived, and the open period is never a miss. | AD-40, AD-36, AD-9 |
| AR-23 | A subjective record is one re-answerable row per day; a later answer overwrites, clearing deletes the row, and every figure over it is a count whose denominator is days answered. | AD-41 |
| AR-24 | A graded answer is stored as its value and drawn as local inline SVG; no emoji codepoint is an interface, and no glyph ships without the word that names it. | AD-42 |

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
| FR-41, FR-42, AR-15, AR-16 | Stories 19.1, 19.2 |
| FR-43, AR-17 | Story 20.1 |
| FR-44, AR-18 | Story 21.1 |
| FR-45, FR-46, AR-19, AR-21 | Story 22.1 |
| FR-47, AR-20 | Story 22.2 |
| FR-48 | Story 22.3 |
| FR-49, AR-5 (Epic 23) | Story 23.1 |
| FR-50, AR-22 | Story 23.2 |
| FR-51, FR-52 | Story 23.3 |
| FR-53, AR-23, AR-5 (Epic 24) | Story 24.1 |
| AR-24 | Stories 24.2, 24.3 |
| FR-54, AR-19 (second application) | Story 24.3 |

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
| 19 | Gym | The first module that is not about money: routines to train from, and a log honest enough to answer whether the lift is going up. |
| 20 | The month that matters | The budget month starts on the day you are paid, not on the 1st. |
| 21 | Month, year, all time | The four figures that answer "how am I doing" answer it over any of the three windows. |
| 22 | The calendar | Every module's dated records on one grid, over the month the account actually keeps. |
| 23 | Habits | A thing you mean to do repeatedly, the evidence that you did, and a streak that does not lie about today. |
| 24 | Mood | Two questions a day — how it felt, and whether it was any good — answered in two taps and counted rather than averaged. |

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

## Epic 19: Gym

The first module with nothing to do with money, and the point at which this stops being a
budgeting app with extras and becomes the personal tracker the 2026-08-30 direction note
described. It reuses the whole substrate — invite-only accounts, row-level isolation, the
create-by-name pattern, hand-rolled SVG — and adds no new machinery.

Scoped by interview before any code, per the repo's own rule. The choices, with what was
rejected: **reusable routines** rather than a calendar of planned sessions (a missed gym day is
not something the app should nag about); **per-set** logging rather than a top set or an
attendance record (it is the only level at which "am I getting stronger?" has an answer); a
**user-owned exercise list** rather than a built-in catalogue (opinionated data in a personal
app, and anything missing needs a free-text escape anyway); and **a fifth bottom tab, with Grow
moving to the top bar**, because six tabs do not fit a 375px phone and Grow is consulted
occasionally while Gym is opened at the gym.

### Story 19.1: Exercises and routines

As someone who trains to a plan,
I want to describe that plan once,
So that starting a session does not mean typing the same six exercises again.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they create a routine and add exercises to it, by name
**Then** the exercise is created for that user if absent and reused case-insensitively, keeping the first spelling (FR-41, AD-12)
**And** each line carries a position, so the routine has an order, and optional target sets and reps
**And** the same exercise twice in one routine is refused — "bench, then bench again" is sets, not two lines
**And** an exercise may carry an **https** link to a form video: the scheme is validated in the service *and* by a database `CHECK`, because it ends up in an anchor somebody taps, and `javascript:` must never get that far. It is rendered as an external link with `rel="noopener noreferrer"`, never framed — an embed would mean loosening the `Content-Security-Policy` and loading a third-party player into a private family app
**And** the `exercises`, `routines` and `routine_exercises` tables, created by this story through `protect()`, carry composite foreign keys including `user_id` (AD-18); a routine's lines cascade with it, and an exercise still referenced anywhere answers `409` (AD-21)
**And** a duplicate routine name answers `409`

### Story 19.2: The log, and whether it is going up

As someone who wants to know if the training is working,
I want each set recorded as it happened,
So that the answer is a line on a chart rather than a feeling.

**Acceptance Criteria:**

**Given** a session started from a routine, or empty
**When** sets are logged
**Then** each set carries an exercise, reps, an optional weight and a position, so supersets and any order work without a second concept (FR-42)
**And** starting from a routine **copies nothing**: the plan prefills the form, and a set exists once it was done (AR-15, AD-35)
**And** a bodyweight set carries no weight at all — not zero, which would be a weight — and shows as "bodyweight"
**And** a weight is a two-place decimal string on the wire, never a float, refused on the client and by the API (AD-5)
**And** zero reps is refused by validation and by a database `CHECK`
**And** deleting a routine keeps the sessions done from it, with a null `routine_id` — via `ON DELETE SET NULL (routine_id)`, the column-list form, because the plain form nulls the `NOT NULL` `user_id` too and the delete fails outright (AR-15)
**And** deleting a session takes its sets, which are part of it
**And** `GET /api/gym/exercises/{id}/history` reports, per session, the heaviest set, total reps, set count and volume — with volume `null` rather than `0` on a session where nothing carried a weight, since "did nothing" is not what a bodyweight day means
**And** the chart draws the heaviest set per session, leaving a gap rather than a drop to zero for a bodyweight session, and says so in words when every session was bodyweight
**And** the account's weight unit is `kg` or `lb`, defaults to `kg`, and locks once a set exists, because changing it relabels rather than converts (AR-16, AD-36)
**And** Gym is the fifth bottom tab and Grow moves to the top bar, which stays visible on a phone — hiding it there would strand it
**And** user B sees none of user A's exercises, routines, sessions or history, and cannot log a set against A's session or exercise

---

## Epic 20: The month that matters

A salary that lands on the 26th makes the 26th the start of the month that matters, and every
total in this app was answering for the calendar one instead. The person who is paid on the
26th and looks at "September" wants the money that arrived on 26 August and what became of it
by 25 September — not a figure that cuts their pay packet in half.

Two things were settled before any code, because guessing either would silently mislabel every
figure. **The label is the month the period ends in**, so with a start day of 26, "September"
is 26 August to 25 September. And **every month-based view follows it**, including the Stock
restock chart and the Gym session filter, rather than money alone — one rule across the app.

### Story 20.1: A budget month that starts on the day you are paid

As someone paid on the 26th,
I want the app's months to run from the 26th,
So that "September" is the money I was actually paid for September.

**Acceptance Criteria:**

**Given** Settings
**When** the budget month start is set to a day between 1 and 28
**Then** it is stored on the account, defaults to 1, and 1 keeps the calendar month exactly as before (FR-43, AD-10)
**And** a day of 29, 30 or 31 is refused by the API and by a database `CHECK` — those days are missing from some months, a clamped boundary breaks the arithmetic that maps a date back to its period, and "paid on the 31st" is a rule about banking days rather than a day
**And** it is **not** locked once data exists, unlike the currency and the weight unit: it re-groups rows and never relabels a stored number, and a test proves every entry keeps its id, date and amount across a change (AR-17)
**And** the period labelled `YYYY-MM` runs from `start_day` of the previous month to the day before `start_day` of that month, so its last day always falls in the month it is named after
**And** consecutive periods are contiguous and never overlap, for every start day, across a whole year including February
**And** `month_of(date)` is the exact inverse of `month_range(label)`, checked on both sides of a boundary
**And** the entries list, the dashboard summary, the trends, the unit-price and vendor-price series, the savings list, the restock chart and the gym session filter all use the same boundary — the dashboard total and the list beneath it agree to the day, and a test asserts exactly that
**And** the SQL that buckets trends into months shifts `date_trunc` by bound parameters, never by interpolating the day into the statement (AD-3), and removing that shift turns the trend test red
**And** the client mirrors the arithmetic, opens each page on the period today falls in rather than the calendar month, and spells the range out — "26 Aug – 25 Sep" — wherever a month is named, because nobody should have to infer what "September" covers from a total
**And** one account's boundary never moves another account's figures

---

## Epic 21: Month, year, all time

Income, expense, net and saved are the four figures this product exists to report, and they
were only ever reported for one month. A year and an all-time total are the same aggregates
over a wider window.

The one judgement call, made rather than asked: **budget-versus-actual stays monthly**. A
budget is a standing monthly amount (AD-11), so comparing a year of spending against it needs
a multiplier that nobody chose. The wider periods show the four figures and say plainly that
the comparisons are monthly, rather than showing a number that would be wrong.

### Story 21.1: The four figures over any window

As someone who wants to know how the year went, not just the month,
I want the headline figures over a year and over everything,
So that "how am I doing" is a question I can ask at more than one scale.

**Acceptance Criteria:**

**Given** the dashboard
**When** the period is switched between Month, Year and All time
**Then** `GET /api/dashboard/summary?month=&period=` returns income, expense, net and saved for that window, with `month` remaining the anchor for all three — a year takes its year part, and all time ignores it (FR-44)
**And** a **year is exactly twelve budget months**, derived from the January and December windows rather than from 1 January, so with a start day of 26 the year 2026 runs 26 December 2025 to 25 December 2026 — and a test asserts the twelve monthly figures sum to the yearly one, to the penny (AR-18)
**And** the yearly figures sum to the all-time one, likewise asserted
**And** **all time has no bounds at all**: the SQL receives `NULL` rather than a sentinel date, because a guessed lower bound silently drops a row
**And** an empty account reports `0.00` for every figure in every period, never `null` (AD-22)
**And** the response carries the period, a label — `2026-09`, `2026`, `All time` — and the real inclusive bounds, so the client never reconstructs what a window means
**And** budget-versus-actual and target-versus-actual are returned **for a month only**, empty otherwise, and the dashboard says why rather than hiding it silently (AD-11)
**And** the month picker is hidden for all time, where choosing a month would change nothing, and steps a year at a time when the period is a year
**And** an unrecognised period answers `422`
**And** the choice is remembered per device, like the trend window and the collapsed sections
**And** one account's totals never include another's, in any period

---

## Epic 22: The calendar

Every module in this app records a date, and until now each one showed its dates only to
itself: the entries list knows what was spent on Tuesday, the gym log knows there was a
session, and nothing put the two on the same page. A calendar is the one shape that does —
not another total, but the same records laid out on the days they happened.

Two things were settled before any code, because either one guessed wrong would be wrong
quietly. **It is a window, not a workbench**: everything on it is read, and the two ways out
of it are navigation — a record links to its module, and "add on this day" hands the entry
form a date. The rejected reading, recording from inside a day cell, would have meant a
second implementation of rules that already have one each — the kind match of AD-7, the
quantity-and-unit pair of AD-29, create-by-name of AD-12, propose-before-write of AD-33 —
and a lesser form silently missing fields. What that costs is a tap: recording against a day
is two screens rather than one.

And **the grid is the account's month**. For an account paid on the 26th, "September" runs 26
August to 25 September, and every other view in the app already answers for that window
(AD-10). A calendar-month grid would have made this the one screen disagreeing with the total
above it, which is exactly the failure Epic 20 existed to end. The price is ragged edges: the
first and last rows carry days from the neighbouring periods, drawn muted, and tapping one
moves to the period it belongs to rather than pretending nothing happened on it. For a start
day of 1 — the default, and every existing account — the grid is the plain calendar month.

The data comes from each module's own endpoint, merged in the page, the way the dashboard
composes its cards (AD-31, AD-37). Two questions had no endpoint at all and were answered
**inside the module that owns the rows** rather than by a new service that would have had to
reach across all of them.

### Story 22.1: The two reads the calendar needed, each in its own module

As someone who wants one view of the month,
I want the stock cupboard and the recurring bills to answer for a window,
So that the calendar can be assembled from what each module already knows.

**Acceptance Criteria:**

**Given** an authenticated user
**When** `GET /api/inventory/changes?month=` is called
**Then** it returns every item's quantity changes inside that **budget** month, oldest first, each naming its item so the calendar needs no second request to caption a row (FR-45, AD-10, AD-20)
**And** it lives in `api/inventory.py` and is served by `services/inventory.py`, because "what moved this month" is a question about stock — a `services/calendar.py` importing five modules' models would break AD-31, and one importing five modules' services would create a second cross-module seam beside `services/shopping.py` for a read that needs no transaction (AD-37)
**And** the window is applied in **UTC**, because `changed_at` is an instant rather than a day anybody chose — the same choice the restocks chart already makes, with the same stated limitation (AD-38)
**And** a missing or malformed `month` answers `422`, and one account's log never appears in another's window
**And** `GET /api/recurring/expected?month=` returns the dates a template will fall due inside that month, computed from the cadence and **written nowhere**: reading it advances no `next_due` and creates no occurrence, asserted by comparing the template before and after (FR-46, AD-39)
**And** it reports only dates **strictly after today**, so it can never speak for a date that already carries a decision — a skipped occurrence stays skipped rather than being re-proposed by arithmetic (AD-33)
**And** each row carries **no id**, because there is no row: nothing returned here can be confirmed or skipped
**And** a paused template projects nothing, and a template projects nothing past its `end_on`

### Story 22.2: The month grid, on the account's period

As someone whose month starts on the 26th,
I want the calendar to cover the month my totals cover,
So that the grid and the figure above it are talking about the same days.

**Acceptance Criteria:**

**Given** an account with `budget_start_day = 26`
**When** the calendar shows `2026-09`
**Then** the grid runs 26 August to 25 September, laid out as whole weeks beginning on Monday, and the range is spelled out in the header — "26 Aug – 25 Sep" (FR-47, AD-10, AD-38)
**And** the days of the neighbouring periods that fall in the first and last rows are drawn as **outside** and move the calendar to the period they belong to when tapped, rather than reading as days on which nothing happened
**And** for `budget_start_day = 1` — the default, and every existing account — the grid is exactly the calendar month, unchanged
**And** every layer asks its module for the **same `month`**, so the server applies one boundary and the client's arithmetic decides layout only
**And** a day cell shows the day, the day's **net** money rounded to whole units, and one dot per other kind of thing on it, capped at four with a `+n` — a cell is 43px wide at 375px and two decimals do not fit; the page says the cell figures are rounded and the exact amounts are one tap away
**And** what is **due** is drawn as an outline rather than a fill, so a forecast never reads as a record at a glance
**And** layers can be turned off, and which are on is remembered per device like the collapsed sections and the trend window
**And** one module failing costs that layer only: the rest of the month still renders and the page names what could not be loaded (AD-31)
**And** the calendar is a **second view of the Dashboard section** at `/calendar`, not a sixth bottom tab — see Story 23.3 for the whole navigation answer

### Story 22.3: The day, in detail, and the way back to the record

As someone who has found the day something happened on,
I want to see exactly what it was and get to it,
So that the calendar answers a question instead of raising one.

**Acceptance Criteria:**

**Given** a day inside the period
**When** it is tapped
**Then** a panel lists everything on it, grouped by module: entries with their category and exact amount, savings contributions, stock movements, workouts, habit check-ins, and what is due (FR-48)
**And** each row links to where that record lives, so the calendar is a way in rather than a dead end
**And** a stock row shows `before → after`, except where they are equal, which is the level written when an item is first added rather than a movement
**And** a **pending** proposal and an **expected** one are distinguishable in words, not only in colour: one is "proposed, not yet recorded" and the other "will be proposed" or "will be recorded automatically", and the expected one carries no control, because there is nothing yet to act on (AD-39)
**And** "add on this day" opens the entry form with that date already filled in, and the form is the one that already enforces every rule about an entry
**And** a day with nothing on it, in the layers that are on, says so

---

## Epic 23: Habits

The second module with nothing to do with money, and the one that finally makes the bottom
bar choose. A habit is a thing you intend to do repeatedly; a check-in is evidence you did
it. They are separate rows and neither writes the other (AD-35), so changing "three times a
week" to "daily" never touches a day you recorded.

The crux was **what a period is**, and it forks hard. The model here is the smallest one that
answers "did I do it enough this week": a period of `day` or `week`, and a count within it.
Daily is `(day, 1)`, three times a week is `(week, 3)`, twice a day is `(day, 2)`. `Every N
days` was left out because it needs an anchor and a rolling window, at which point "on track"
stops being a calendar question; `specific weekdays` because it needs a weekday mask and a
different completion rule; `month` because a monthly habit's "on track" figure is noise at
the scale anyone reviews it. Each arrives later as one column and one CHECK, without
rewriting what is built here.

A check-in is **one row per habit per day, carrying a count** — not one row per tap. A row per
tap makes an accidental double-tap indistinguishable from a genuine second session and makes
undo ambiguous about which row to remove. The count is a fact rather than an aggregate, so it
does not offend AD-9; everything actually derived — completion, streaks, "still to do" — is
computed in SQL and stored nowhere (AD-40).

### Story 23.1: Habits, check-ins, and the isolation proof

As someone trying to do something regularly,
I want to write the habit down and tick it off,
So that "am I actually doing this" has an answer that is not a feeling.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they create a habit with a name, a period of `day` or `week`, and a target count
**Then** it is stored with a `started_on` that defaults to today, a duplicate name answers `409`, and an unsupported period is refused by the API **and** by a database `CHECK` (FR-49, AD-12's spirit — though a habit is created deliberately, not by name like reference data)
**And** a habit cannot start in the future, because a habit with no period to judge would render as a permanent zero rather than as a plan
**And** checking in **increments that day's row** rather than inserting a second, guaranteed by `UNIQUE (user_id, habit_id, done_on)`; undoing decrements, and removes the row at zero, so "no row" is the only way the data says "did not do it"
**And** a check-in may be recorded for a past day back to `started_on`, and **never for the future** — a check-in is evidence, and there is no evidence of tomorrow. Neither rule can be a CHECK constraint: `current_date` is not IMMUTABLE and `started_on` lives in another table, so both are enforced in the service and the reasons are written down where the constraint would have been
**And** a check-in may carry a note for the day
**And** `habits` and `habit_checkins` are created by this story through `protect()`, and the check-in's foreign key is **composite, including `user_id`** (AD-18) — proven by executing an insert as user B against user A's habit, not by reading the constraint
**And** the foreign key is `ON DELETE CASCADE`, decided in the schema (AD-21): a check-in has no meaning without its habit, so `RESTRICT` would make deleting impossible in practice and keeping the rows would preserve nothing readable
**And** **archiving** is the reversible alternative and is what the client offers first: an archived habit leaves the list and stops counting toward anything outstanding, and every check-in survives
**And** user B sees none of user A's habits, check-ins, progress or heat-map, and another user's id answers `404` on every route, never `403` (AD-8, AD-24)

### Story 23.2: Am I on track — completion and streaks, computed

As someone who wants to know whether it is working,
I want the figures to be honest about the week I am in,
So that a number I look at every day is not one I have learned to discount.

**Acceptance Criteria:**

**Given** habits with check-ins
**When** progress is read
**Then** each live habit reports the inclusive bounds of the period **currently open**, how many times it has been done in it, whether the target is met, and the streak — all computed on read, nothing stored (FR-50, AD-9, AD-30, AD-40)
**And** a week starts on **Monday**, stated rather than inferred: it is not `budget_start_day`, which is 1–28 and cannot express a weekday, and a habit week is not a pay cycle. The Python arithmetic and the SQL `date_trunc('week', ...)` agree by construction, and a test holds them equal across a fortnight
**And** the streak counts consecutive met periods backwards, and **the period in progress is never a miss**: it is dropped from the scan while unmet and extends the run once met — counting it as a miss shows every streak as zero every morning, and counting it as met claims a day that has not happened
**And** periods before `started_on` are not misses: a habit written down today has not failed every day since the year 2000
**And** changing the period or the target **is allowed at any time** and re-judges history: a test asserts that every check-in keeps its id, its date and its count across the change, and that the streak moves. That is the line against AD-36 — a unit locks because it changes what a stored number *means*, a target does not because it changes only a judgement about it (AD-40)
**And** a heat-map of the last N whole weeks is available per habit, Monday-aligned, with its own half-open bounds — a heat-map is "the last twelve weeks", deliberately not a budget month, so it carries its own window rather than borrowing AD-10's
**And** the heat-map is hand-rolled inline SVG, like every other chart here
**And** every figure asserted in the tests is worked out by hand in a comment first, and the streak rule was made to fail on purpose — letting the open period count as a miss turns three of these tests red

### Story 23.3: The Habits tab, the navigation answer, and the digest

As someone holding a phone,
I want the thing I tap several times a day within thumb reach,
So that checking in costs one tap rather than a hunt.

**Acceptance Criteria:**

**Given** the bottom bar holds five items at 375px, measured
**When** two new sections arrive
**Then** **Habits takes a bottom tab and Plan moves to the top bar**: ranking the sections by how often each is opened puts a check-in third and a standing monthly budget (AD-11) eighth, so Plan is the one that goes up beside Grow (FR-51)
**And** **the calendar takes no tab at all** — it is the Dashboard section's second view, since the dashboard already answers "what happened and what is due" in totals and the calendar answers it day by day; `/calendar` stays a real route, and the Dashboard tab is lit while it is open, so five tabs still describe where you are
**And** rejected, with reasons: a sixth tab (labels wrap and the targets fall below 44px); a "More" overflow tab (spends a slot to hide two sections and demotes Gym, which Epic 19 deliberately promoted); merging Habits into Gym (one page with two unrelated jobs, contradicting the interview that scoped Gym)
**And** the top bar stays **one row** at 375px with four items on it: the identity pill is given a zero flex basis so it shrinks into what is left rather than wrapping onto a second row — flex line-breaking uses an item's base size, not its minimum, which is why `min-width: 0` alone was not enough
**And** all of the above is **verified in a browser at 375px**, not asserted, and a test pins the five tabs and the two top-bar links so a sixth cannot be added without something failing
**Given** the Habits page
**When** it is opened
**Then** each live habit is a row with a minus, the count, and a plus — 40px targets, because this is the action the page exists for — and the row shows "n of m this week" and the streak, all from the server (AD-30)
**And** the habit's name opens its heat-map; archived habits are behind a toggle; deleting says how many recorded days go with it and offers archiving instead
**Given** the daily digest
**When** a habit has `remind` set and its current period is unmet
**Then** it is named in the one notification a day that already reports low stock and waiting proposals (FR-52, AD-34)
**And** `remind` is **off by default**: today the digest fires only when something is exceptional, and a daily habit would make it arrive every evening — which is the notification people switch off entirely, taking the stock and recurring reminders with it. Opting in per habit keeps the digest's meaning, at the cost of one more thing to find
**And** the digest reads the habits **service** rather than restating its predicate in SQL, so the screen and the notification cannot disagree (AD-30, AD-37), stays read-only with respect to domain data, and one account's habits never reach another's digest
**And** the calendar gains a habits layer, since a check-in is exactly the kind of dated fact the calendar exists to show

---

## Epic 24: Mood

The first **subjective** record in the system. Everything else here has a referent outside the
row — a receipt, a quantity on a shelf, a set that was lifted, a day you either ran or did not.
This holds what a person *said* about a day, and most of the decisions below follow from that
one difference.

Two questions, and they are two questions rather than one asked twice. A **mood** is a state on
one ordered axis, five points, worst to best. A **verdict** is a judgement about what the day
contained, and it is a boolean. They are orthogonal, and the proof is that both off-diagonal
evenings are real: tired but productive, cheerful but wasted. If they could not be separated,
one of them should not exist.

**A mood is not a habit.** It gets its own table and its own module, and has no target, no
period and no notion of "enough" — so there is nothing here to keep a streak of, and a streak
over a feeling is rejected outright rather than deferred (see the spine's Deferred section). Its
history lives on the Habits tab even though its model does not, which makes that page the
**second application of AD-37**: the page composes the mood module's endpoint, exactly as the
dashboard composes the inventory's, and a mood failure costs the mood card and nothing else.

**The emoji is presentation and the faces are drawn here.** The column holds the point; the
face is inline SVG in this repository and always carries its word, because the same codepoint is
a different drawing on every platform in this household (AD-42).

**And it is not a popup**, in the sense the request meant. There is no modal anywhere in this
application, so a dialog would be new machinery — a focus trap, scroll locking, `aria-modal`,
and a fork between a centred dialog and a bottom sheet at 375px. What ships is an anchored
popover: `aria-expanded`, Escape, tap-outside, focus restored. What that costs is written down
in `MoodCheckin.tsx` rather than glossed.

### Story 24.1: The day's two answers, and the isolation proof

As someone who wants to know what a month actually felt like,
I want to answer two small questions about a day,
So that "was that a bad week or just a bad Tuesday" has something behind it.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they record an answer for a day
**Then** it is stored as **one row per `(user, day)`**, carrying a five-point `mood` and a
nullable `day_ok`, with a `CHECK` that at least one of them is present so a row always says
something (FR-53, AD-41)
**And** answering again **replaces** the day rather than adding a point: a second answer is not a
correction toward a receipt, it is a different answer from a person who now remembers the day
differently, so the latest is kept and `created_at` versus `updated_at` is the only trace that
anything was revised
**And** the write is a `PUT` carrying the whole day, because absent and null mean the same thing
on this resource — no answer to that question — and a partial update would need a third state on
the wire to tell "leave it" from "clear it" (the upsert shape of AD-11)
**And** clearing both answers **deletes the row**, so "no row" is the only way the data says *did
not say*, exactly as a habit check-in is deleted at zero rather than left at nought; a note with
nothing to annotate is therefore not an answer and does not create a row
**And** a day that has not happened is refused with a sentence, enforced in the service because
`CHECK (on_day <= current_date)` is not IMMUTABLE — the wall `habit_checkins` already hit — while
a *past* day is a legitimate backfill with no lower bound at an account's creation, since a mood
has no plan behind it to start from
**And** an unanswered day is read as a **200 with nulls, not a 404**: it is the answer to "what
did they say about the 3rd", and 404 stays reserved for another user's row or a route that is
absent (AD-8). There are no ids on this resource at all — a day is addressed by its date
**And** the window read for the calendar is the **account's** budget month, not the calendar one,
so the list and the grid drawn over it cover the same days (AD-10, AD-20)
**And** the counts are computed in SQL, zero-filled from the **points** side so a value nobody
chose comes back at 0 rather than vanishing (AD-22), and `days_ok` / `days_not_ok` are `FILTER`
predicates that exclude a null verdict — "did not say" must never be counted as "no"
**And** `mood_days` is created by this story through `protect()`, and user B sees none of user
A's rows on read, is refused on write, cannot stamp a row with A's `user_id`, and — since the
unique key is `(user_id, on_day)` and not `(on_day)` — writing the same date writes B's own row
rather than colliding with A's, which would be both a broken feature and an oracle (AD-24, AD-1)
**And** the answers **export as CSV** like everything else, on Epic 16's existing streaming and
formula-neutralising path: this is the most personal file in the system, which is an argument for
the person having a copy of it rather than against. The scale is named in the header
(`mood_1_to_5`) rather than repeating the words, which belong to the one place that draws them
**And** every figure asserted in the tests is hand-computed in a comment first, and each rule was
made to fail on purpose — writing the `FILTER` as `day_ok IS NOT TRUE` turned the three-state
test red, counting with `GROUP BY mood` instead of joining from the points side turned both
zero-fill tests red, merging instead of replacing turned the PUT test red, making the clear a
no-op turned two tests red, and reducing the unique key to `(on_day)` turned the two-user write
test red

### Story 24.2: The icon on the dashboard, and the popover that is not a modal

As someone who notices how the day went while looking at what it cost,
I want to answer in two taps from where I already am,
So that recording it never becomes a thing I have to remember to go and do.

**Acceptance Criteria:**

**Given** the dashboard header already carries the Summary/Calendar switch, the Month/Year/All
time chips and the month navigator — the half of it that wraps at 375px
**When** the mood control is added
**Then** it goes on the **left, at the start of the title line**, where there is one line of text
and room beside it at every width, and the cluster on the right is untouched: measured at 375px,
the control adds 16px of height to the left block and causes **no new wrapping**, because that
cluster was already on its own row before this feature existed
**And** it sits **before** the heading rather than after it, which is a measurement and not a
preference: the popover is anchored to the button, and a heading reading "September 2026" in one
month and "2026" in another moves that anchor by about 115px — with the button after the title
the panel hung 98px off the right edge of a 375px screen and put a horizontal scrollbar on the
page. First in the row, the anchor is the shell's left padding whatever the month is called
**And** the trigger is a 40px round target carrying `aria-expanded`, `aria-controls` and an
`aria-label` that names both the question and the answer currently stored, since the face itself
is `aria-hidden`
**Given** the popover
**When** it opens
**Then** it is a **disclosure, not a dialog**: no `role="dialog"`, no `aria-modal`, no focus
trap, no scroll lock, nothing made inert — it sits immediately after its trigger in document
order, so a keyboard or screen-reader user reaches it by carrying on. Escape closes it, a tap
outside closes it, and focus returns to the button either way
**And** what that costs is stated rather than glossed: the page behind stays scrollable, so the
panel can be scrolled off screen; nothing announces "you are inside a thing you must leave"; and
at 375px it is the same panel as on a desktop rather than a bottom sheet, so it wins no
thumb-reach a sheet would — the trade for one behaviour at every width instead of a breakpoint
between two. If a real dialog is ever wanted, that is a decision with a focus trap attached, and
the test asserting there is no `dialog` role is the one to rewrite rather than delete
**And** the panel is capped at the shell's content width, so it never pushes a horizontal
scrollbar: measured at 375px it runs 20px to 340px, the five faces are 56x57 targets and the
verdict chips are 40px tall, matching the habit stepper Epic 23 settled on
**Given** the two questions
**When** they are drawn
**Then** they are drawn **differently**, because they are different shapes: five faces for the
graded one, two chips for the boolean. Each face carries its word — `Bad`, `Low`, `Fine`, `Good`,
`Great` — and the word is the accessible name, so a drawing is never the only label (AD-42)
**And** tapping the face already chosen **takes it back**, which is how a mis-tap is undone
without a second control per question
**And** an unanswered verdict leaves **both** chips unpressed. Three states, never two: rendering
"No" as pressed because nobody said "Yes" would be the page inventing an answer
**And** the verdict question is **not rendered at all before 18:00 local** — no control, so no
early answer can exist. At nine in the morning "how do you feel" has an answer and "was today any
good" does not, and mixing the two would make every stored verdict ambiguous with nothing in the
row to tell a judgement from a forecast. This is a rule of the **interface**, not of the API,
deliberately: an hour rule in the service would need a per-account time zone this system does not
have (AD-38) and would refuse a legitimate late-night answer from a family member in another
country
**And** a note is optional, is disabled until one of the questions is answered, and is not itself
an answer

### Story 24.3: The history on the Habits tab, and the day on the calendar

As someone looking back over a month,
I want to see the shape of it rather than a number somebody averaged,
So that what I read is what I actually said.

**Acceptance Criteria:**

**Given** the Habits tab
**When** it is opened
**Then** the mood card is **last, under its own heading, and says in words that it is not a
habit** — "no target here, nothing to be enough of, and nothing to keep a streak of" — because a
chart dropped between things that have targets and streaks will be read as one of them (FR-54)
**And** it is fetched **separately** from the habits, not beside them in one `Promise.all`: this
page now composes two modules, and a failure in one must cost its own card only (AD-31, AD-37).
A test proves it — joining the two loads turns it red. When the mood endpoint 404s the card says
the API is probably older than the page, since a fixed path cannot mean "no rows"
**And** the recent days are a **strip**, one cell per day, left to right — deliberately not the
habit heat-map's Monday-aligned week grid. A heat-map's columns exist so "only at weekends" is
visible, which is a question about an act; a mood is read as a trend, so time runs one way
**And** a day nobody answered is drawn as an **empty outline**, never as a low score, and the
caption says so; the thin bar beneath a cell is the verdict, filled for a good day and hollow for
a bad one, absent when nobody said — two channels, because the two questions are independent
**And** the summary is a **tally of five counts and never a mean**: a five-point scale is ordinal,
so the distance from 2 to 3 is not the distance from 4 to 5 and an average of it is arithmetic on
labels. The denominator printed beside it is *days answered*, never days in the window (AD-41)
**Given** the calendar
**When** the Mood layer is on
**Then** a day carrying an answer shows its dot, its face in the day panel, and its verdict in
words — with nothing said at all about a day nobody judged, since three states must not become
two. It is one more endpoint composed at the edge and no new machinery (AD-37)
**Given** the daily digest
**When** somebody asks why a mood is not in it
**Then** the answer is recorded rather than left as an omission: the digest fires when something
is **exceptional** — stock is out, an entry is waiting — and "you have not said how you feel
today" is true every day by construction. That is exactly the failure Epic 23 named when it made
`remind` off by default, and worse here: a nightly notification from a budgeting app asking about
your feelings is the one that gets the whole digest switched off, taking the stock and recurring
reminders with it. Habits could opt in because a habit is a commitment a person made; a mood is
not. The cost is stated — someone who wants a nightly prompt has to open the app — and the shape
it would take if anyone insists is one `users` column and one clause in `Digest.body`

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
  the thing to get right first. **The first non-money module landed as Epic 19 (gym)**, and it
  needed no new machinery — which is the evidence the module boundaries were right. **Habits
  (Epic 23) is the second**, and the calendar (Epic 22) is the first view to read across all of
  them; that it could be built by composing existing endpoints, adding two module-owned reads
  and no cross-module service, is the second piece of that evidence (AD-37).
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

---

## Epic 25: French

The app is read by a household that does not read English, and until now it only spoke it. This
is the layer that lets a person choose, and the decisions worth writing down are all about *who
owns the words*.

**The language is on the account, not in the browser.** The obvious alternative — `localStorage`
plus `Accept-Language` — needs no migration and no endpoint, and is wrong here for two concrete
reasons: a household member who signs in on a phone and a laptop would read two different
languages, and the daily push digest is composed by cron on the host, hours after anyone was
last in a browser, so a preference the server cannot see means a notification that can never be
French. Currency, weight unit and budget start day are all account settings for related reasons
(AD-36); this joins them. Unlike the first two it is **never locked and never can be**: those
relabel a stored number, this changes only the words drawn around numbers that do not move. It
is the freest setting in the app, and `localStorage` remains as a *cache* of it so the sign-in
page and the first paint are already in the right language before `/me` answers.

**The catalogue holds both languages in one entry.** A message is
`{ en: "Habits", fr: "Habitudes" }`, not two parallel files keyed the same way. Two files drift,
and a key added to one and forgotten in the other is the ordinary failure mode of every
hand-rolled i18n layer — it surfaces as an English word inside a French sentence, weeks later.
Here the type makes a missing French string a compile error, and a reviewer reads the pair
together. It is hand-rolled rather than react-i18next for the same reason this app pins its own
money and date formatting: two languages that share a plural *shape* need a lookup, an
interpolation and a plural switch, and that is smaller than the configuration would be.

**The server keeps answering in English, and the client owns every word** (AD-44). Errors carry
a stable code beside the sentence; the client keys its own wording off the code and falls back
to the sentence when it meets one it has never heard of, so a new code degrades to English
rather than to a blank banner. The habit schedule is sent as a *rule* rather than a sentence for
the same reason — "Mon, Wed, Fri" and "lun., mer., ven." are one rule in two languages. The one
exception is the push digest, which has no client to translate it.

**Dates are catalogue lookups, not `Intl`.** The system locale on a machine is not the language
the account chose — the development machine here is set to French — and a heading that changed
with the machine would make a screenshot, a test and a bug report irreproducible. French month
and weekday names are lower case, which is the rule in French and is asserted by a test, because
capitalising them is the clearest possible sign of a translation done by pattern-matching
English.

**Known gap, stated rather than discovered:** the mood check-in and the mood card keep their
English strings. Epic 24 is not committed, and writing French against code that may still move
would be a guess wearing a translation. Both places say so in a comment, and the calendar's mood
layer keeps an English literal for the same reason.

### Story 25.1: The language belongs to the account

As a member of a household that reads French,
I want the app to be in French on every device I sign in on,
So that the choice is mine rather than my browser's.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they change the language in Settings
**Then** it is written to `users.language` — two letters, `CHECK (language IN ('en', 'fr'))`,
with the runtime role granted the new column explicitly (AD-19) — and read back from the profile
**And** it is **never refused**, whatever the account already contains, unlike the currency and
the weight unit, because it relabels no stored number (AD-36)
**And** a database write of an unsupported language is refused by the constraint, not only by the
API, and a test proves it as the runtime role (AD-24)
**And** signing in again on another device reads the same choice, and one account's language is
never another's
**And** a signed-out reader gets the stored value, then the browser's preference narrowed to a
catalogue this build actually has (`fr-CA` → French, `de-DE` → English), and the sign-in page
carries its own picker — Settings is behind a sign-in, so without it someone whose browser
guessed wrong would have to read a language they do not speak to reach the setting that fixes it
**And** the daily push digest is composed in the account's language by `services/push.py`, with
the French rule that **0 and 1 are both singular** written down rather than assumed, on both
sides of the wire

### Story 25.2: A refusal says what it is, not what language the server speaks

As a French reader,
I want a failure to be a French sentence,
So that the app does not fall back to English the moment anything goes wrong.

**Acceptance Criteria:**

**Given** any refusal the API returns
**When** it is rendered
**Then** the body carries `{"detail": "<English sentence>", "code": "<stable fact>"}` and the
client's wording is keyed off the **code**, never off the status (AD-44)
**And** a wrong password and an expired session — both 401 — produce different sentences, which
is the bug this shape exists to prevent
**And** a code the client has never heard of falls back to the server's own sentence rather than
to a blank banner, and a `fetch` that never reached the host is named as such
**And** a 404 from a *fixed* path is reported as a server older than the page, not as a missing
row
**And** the catch-all handler leaves FastAPI's own errors the shape every existing caller reads:
`detail` stays a string, `code` is added beside it

### Story 25.3: Every screen, in the reader's language

As a French reader,
I want the whole app in French,
So that there is no page one tap away that I cannot read.

**Acceptance Criteria:**

**Given** an account set to French
**When** any page is opened
**Then** its headings, labels, buttons, placeholders, accessible names, table columns, empty
states, toasts, confirmations and chart descriptions are French — sign-in, dashboard, entries, a
category, the calendar, plan, grow, stock, gym, habits and settings
**And** `document.documentElement.lang` is stamped, so screen readers and the browser's own
translation prompt agree with the page
**And** month names, weekday names and day labels come from the catalogue rather than from
`Intl`, and French keeps them lower case
**And** a test asserts every catalogue entry has both languages and neither is blank, that every
`_one` has its `_other`, and that **no full sentence is byte-identical across the two** — the
check that catches a paragraph pasted rather than translated

---

## Epic 26: Habits that keep a schedule, and check-ins that know the time

Epic 23 shipped the smallest model that answers "did I do it enough this week": a `day`/`week`
bucket and a count. It said in its own migration that `every N days` and `specific weekdays`
were left out deliberately and that a later migration would add them. This is that migration,
and it **rewrites** rather than extends — keeping `period` alongside a schedule would leave two
models of the same thing, and every read would have to ask which one a row uses, which is the
classic source of a wrong streak.

**A schedule is typed columns with CHECKs** (AD-43): six kinds — every day, named weekdays,
every N days, a day of the month, the Nth weekday of the month, and N times a week — with the
parameters each kind needs and a constraint that refuses every other combination. Not JSONB,
which the database cannot check; not an RRULE, which can express rules the UI will never build a
form for. `target_count` survives all six and means the same thing throughout: how many times
within one occasion.

**Which days are due is Python, counting is SQL.** Expressing "the last Friday of the month" in
`generate_series` costs a correlated subquery per month and a query nobody reads twice, so the
calendar arithmetic moved to one pure module with no database at all — which is also what stops
a second copy of "is today a habit day" appearing in the notifier and the heat-map.

**A check-in is an occurrence, not a counter.** Epic 23 stored one row per (habit, day) with a
`times` column, and argued that a row per tap makes an accidental double-tap indistinguishable
from a genuine second session. That argument holds exactly as long as a check-in carries no
time. Once it does, 08:02 and 08:02 are visibly one mistake while 08:00 and 14:00 are visibly
two doses — and "delete the 2pm one" becomes a row to delete rather than a counter to decrement
and a note to guess about.

**And the streak counts occasions, not days**, which is the answer to the question that prompted
the epic. For a Monday-Wednesday-Friday habit, Tuesday is invisible: neither a miss nor a free
pass. "2 of 3 this week" counts the times the schedule *asked* this week, not the days a week
has. The open occasion is still never a miss (AD-40), and a check-in on a day the schedule did
not ask for is still recorded — evidence is evidence — it simply moves neither figure.

### Story 26.1: A habit repeats on a rule the database understands

As someone whose habits are not all daily,
I want to say Monday, Wednesday and Friday — or the 15th, or the last Friday,
So that the app stops calling a Tuesday a failure.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they create a habit
**Then** the schedule is stored as `schedule_kind` plus the parameters that kind needs —
`weekdays` (a Monday-first bitmask), `interval_days`, `day_of_month` (1-28, the widest day every
month has), `nth` (1-4 or -1 for the last) and `weekday` — each with its own range CHECK
**And** one constraint refuses every combination except the one the kind requires, so a weekday
schedule with no weekdays cannot exist even if written by something other than this API (AD-24)
**And** a parameter the kind does not use is **cleared** rather than stored, so a value nothing
reads cannot survive an edit and become live again later
**And** changing the kind rewrites the whole schedule; adjusting a parameter without naming a
kind keeps the kind already stored
**And** migration 0018 maps every existing habit: `(day, N)` → `daily` with target N, `(week, N)`
→ `times_per_week` with target N, and drops `period`
**And** which days a rule asks for lives in `core/schedule.py`, with no session, no models and no
service imports, and is tested against hand-written dates without a database (AD-43)

### Story 26.2: A check-in records when, and there may be several

As someone taking medication three times a day,
I want to record 8am, 2pm and 8pm,
So that "did I take the afternoon one" has an answer.

**Acceptance Criteria:**

**Given** a habit
**When** it is checked in
**Then** each check-in is **its own row**, carrying `done_on` (the day the person says) and
`done_at` — a `time without time zone`, nullable, where NULL is "did it, did not say when" and
is not midnight
**And** three check-ins in a day are three rows with three times, each individually deletable **by
its own id**, because with three doses recorded "undo" has to say which
**And** a check-in can be amended — its time cleared with an explicit null, its note changed —
while its *day* cannot: a check-in on the wrong day is one that did not happen, so it is deleted
and recorded again
**And** the day's occurrences sort by time with the untimed ones **last**, because NULL is not a
claim about midnight
**And** the three rules the schema cannot hold are enforced in the service with tests: not in the
future, not before the habit started, and at most a hundred in one day — the last of which used
to be `CHECK (times <= 100)` and is now a row count, which no CHECK can see
**And** migration 0018 expands every existing `times = N` row into N rows, keeping the note on
one of them rather than copying it onto all

### Story 26.3: Progress and streaks that count occasions

As someone with a Monday-Wednesday-Friday habit,
I want "2 of 3 this week" to mean the three times it asked,
So that the figure is about my schedule rather than about the calendar.

**Acceptance Criteria:**

**Given** a habit with any of the six schedules
**When** its progress is read
**Then** the response says whether it is **due today**, the bounds of the occasion in progress,
how many times it has been done inside it, and today's occurrences with their ids and times
**And** it carries the Monday-week rollup counted in **occasions** — how many the schedule asked
this week, and how many were met — which is 3 for a Monday-Wednesday-Friday habit whatever day it
is, and 0 for a monthly habit in a week it does not fall in, where the client says "next on the
15th" rather than rendering a denominator of zero
**And** the streak counts **consecutive met occasions**, so a day the schedule never asked for is
neither a miss nor a free pass, and the open occasion is dropped while unmet rather than counted
against (AD-40)
**And** a check-in on a day the schedule did not ask for is accepted and shown, and moves neither
the week's figure nor the streak
**And** the daily digest names a habit only on a day its schedule actually asks for, so a
Monday-Wednesday-Friday habit no longer nags on a Tuesday — the same predicate the page uses,
defined once (AD-30)
**And** the heat-map returns **every** day in its window with whether it was due, so a missed
Monday is drawn differently from a Tuesday that was never a habit day — without which a
three-days-a-week habit reads as a wall of failure

---

## Epic 27: Recipes, nutrition, and meals on the calendar

A sixth module beside the ledger, the inventory, the gym, the habits and the mood (AD-31).
It holds foods, recipes built out of them, the method for making one, and a record of what
was actually eaten — which the calendar then draws as an eighth layer, composed at the edge
like the other seven (AD-37).

**Nutrition is a rate, and every figure over it is derived** (AD-45, extending AD-9 and
AD-29). A food stores what it contains per one *basis amount* — 100 g, 100 ml, or one of
the thing — and that is the only nutrition figure written anywhere. A recipe's totals, its
per-serving figures and a day's energy are all computed on read. The alternative, a `kcal`
column on `recipes`, is wrong the first time somebody corrects a quantity, and nothing in
the row says so.

**A missing nutrient is counted, never zeroed.** Nutrient columns are nullable, so a food
whose protein nobody typed still counts its calories — and every derived figure carries a
count of how many contributors had no value beside the partial sum. Summing NULL as zero
would produce a total that is quietly too low and says nothing about it; reporting nothing
at all when *some* contributors knew would throw away the best answer available. A total
over contributors that all lacked the nutrient is `null`, which is the same choice AD-29
makes for a period with no quantified rows: `0.0000` would be a claim about the food.

**Recipes carry their own closed unit list**, `g` / `ml` / `unit`, and AD-29's ledger list
is untouched. Adding grams there would make `g` selectable beside `kg` on an expense, and
AD-29 keys a unit-price series by `(category, unit)` with no conversion between them — so a
household that typed one this month and the other next month would get two series and no
warning. Two vocabularies, each owned by the module that compares within it. An
ingredient's unit is never a choice: it is obliged by its food's basis, and a disagreement
is refused with a code rather than silently corrected.

**A meal log is a record, not a plan** (AD-35). Planning to cook something on Tuesday is a
*plan*, a different table this epic deliberately does not build; a meal cannot be dated in
the future, and nothing here appears on the forward half of the calendar. That is also what
makes the nutrition figures mean anything: a plan's calories are an intention.

**Deleting a food or a recipe that has been used is refused, not nulled.** AD-35's
`SET NULL (routine_id)` is right for a gym set, which still records a real weight once its
routine is gone. A meal log nulled off its recipe records *nothing*, because every nutrition
figure lives on the other side of that key — keeping it would mean snapshotting the totals
onto the row, which is the stored derived figure AD-9 forbids. So RESTRICT and a 409,
exactly as a category with entries already behaves (AD-21).

**Where the section lives, and what it cost.** Recipes joins Plan and Grow in the top bar
rather than taking a sixth bottom tab, ranked the way `App.tsx` ranks everything else — by
how often a section is *opened*. A third link did not fit for free, and the measurement is
the point: at 375px the phone bar's content box is **335px**, and the French links are 193px
(`Budget · Épargne · Recettes`) against English's 154px, so the bar plus a 44px settings
target came to 363 and wrapped to two rows on every French phone. The app's name is now
visually hidden at that width — out of flow, still in the accessibility tree — which is the
one item a phone needs least. Checked at 320px and in both languages, because French is the
longer one and is where it broke.

**Explicitly out, and recorded as choices rather than omissions:** cooking does not
decrement the pantry (there is no link between a food and an inventory item, and it would
need a second cross-module service, ending the property that `services/shopping.py` is the
one named seam); there is no external food database or barcode scanner (a network call
inside a request, a privacy question, an offline story and a key with no working default,
against AD-15); there is no meal *planning*; and there are no photos, for the reason Epic 11
gave about item photos.

### Story 27.1: A food is typed once and a recipe is built out of it

As someone who cooks the same things repeatedly,
I want to describe rice once and use it in every recipe,
So that correcting a figure corrects it everywhere.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they add a food
**Then** it carries a name unique per account case-insensitively (AD-12), a `basis` from a
closed list checked by the database, and four nullable nutrients — energy, protein,
carbohydrate and fat — each with its own range CHECK
**And** the response says which **unit** that basis obliges, so the client never
re-implements the mapping and cannot drift from it when a fourth basis arrives
**And** an empty nutrient box is stored as NULL rather than as zero, and a stored figure
round-trips unchanged: two places out and two places in, so a client that echoes back what
it received is not refused
**And** the basis is **freely changed while the food is unused and refused once a recipe or
a meal depends on it** (AD-36) — a nutrition figure is a judgement corrected toward a
packet, while a basis reinterprets every quantity already typed — while the figures beside
it stay editable at any time
**And** deleting a food a recipe uses, or one that has been eaten, is a 409 with a stable
code (AD-21, AD-44)
**And** `tests/test_isolation_recipes.py` proves, as the runtime role, that a second user
sees no row of any of the five tables and can write none — including that B cannot reference
A's food by id, which RLS alone does not prevent because foreign-key checks bypass it (AD-18)

### Story 27.2: A recipe totals what is in it, and says what it does not know

As someone counting calories,
I want a recipe's figures to follow its ingredients,
So that a corrected quantity corrects the total in the same breath.

**Acceptance Criteria:**

**Given** a recipe with ingredients
**When** it is read
**Then** its totals are one SQL `GROUP BY` over `rate × quantity / basis_amount`, its
per-serving figures are those divided by `servings`, and **no column anywhere stores
either** (AD-9, AD-45)
**And** each ingredient carries its own contribution, so a reader can see where the calories
came from rather than only the total
**And** a nutrient that some contributors lack reports the partial sum **and** a count of how
many had no figure; one that none of them carry reports `null`, not `0.0000`
**And** a test holds the SQL aggregate equal to the sum of the per-line Python figures, so
the module's two implementations of one arithmetic cannot drift (AD-30) — the same guard
AD-29 already specifies for unit prices
**And** the method is ordered rows, renumbered from 1 on every change, reordered by sending
the **whole** new order against a `DEFERRABLE INITIALLY DEFERRED` unique key — so a reorder
is one statement rather than a temporary negative offset or a dropped constraint
**And** a partial order is refused with a code rather than half-applied
**And** the client renders every figure it is given and computes none

### Story 27.3: What was eaten, on the day it was eaten

As someone who wants to know what a Tuesday actually looked like,
I want meals on the calendar beside the money, the gym and the habits,
So that one screen answers the question day by day.

**Acceptance Criteria:**

**Given** a recipe or a food
**When** a meal is recorded
**Then** it is one of exactly two shapes, held by a single CHECK — a recipe in servings, or a
food in a quantity — with the unused half NULL rather than left behind where a later edit
could revive it (AD-43)
**And** "I ate this" defaults to one serving, because that is what it means
**And** a meal cannot be dated in the future (`meal_in_future`), which the service enforces
because `current_date` is not IMMUTABLE and no CHECK may call it
**And** how much, when, and the note are amendable; **what** was eaten is not — a meal filed
against the wrong recipe is one that did not happen, so it is deleted and recorded again,
the rule Epic 26 settled for a check-in on the wrong day
**And** the calendar gains a **meals** layer composed at the edge from `GET /api/meals`
(AD-37), a chip like the other seven, remembered per device, with a failure taking down its
own layer only
**And** a day cell shows the meals and the day's energy, **summed in whole ten-thousandths**
the way the money line is summed in whole cents — never as a float
**And** the window is the account's budget month (AD-10, AD-38), so the grid and the list
cover exactly the same days
