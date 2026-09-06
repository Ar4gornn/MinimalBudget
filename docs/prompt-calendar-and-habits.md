# Feature request: a calendar tab, and a habits tab

## Context

MinimalBudget is a personal tracker in production use by one family, each member on an
independent account. FastAPI + Postgres, React + Vite + TypeScript, mobile-first and
installable as a PWA. It began as a budgeting app and has grown past that: it now holds a
ledger, savings, budgets, an inventory with a shopping list, recurring entries, and a gym log
with routines and per-set workouts.

Read `docs/architecture.md` (AD-1 to AD-36) and `docs/epics.md` (Epics 1 to 21) before
designing anything. The list below is the subset you will collide with; it is ground truth,
not suggestion. Do not weaken or redesign any of it.

### Fixed ground truth

- **Isolation is the database's job.** Postgres row-level security, enabled *and* forced, on
  every user-scoped table. Application `WHERE user_id` filters are defence in depth and never
  the only thing between two people's data (AD-1).
- **Every foreign key between user-scoped tables is composite and includes `user_id`**, backed
  by a matching composite unique key. Postgres foreign-key checks bypass row security, so a
  bare `thing_id` reference lets one user point at another's row. This has bitten the project
  once already (AD-18).
- **Every new table ships an isolation test that executes as a second user** connected as the
  runtime role — proven by running queries, never by reading a policy. A schema audit test
  enumerates every table and fails on anything unprotected (AD-24).
- **A month is the account's, not the calendar's.** `users.budget_start_day` is 1–28; a start
  day of 26 means "September" runs 26 August to 25 September, labelled by the month it ends
  in. Every month-based view already honours this, and the SQL that buckets by month shifts
  `date_trunc` by bound parameters (AD-10). **A calendar grid is inherently calendar-shaped.
  Reconciling those two is your problem to solve, not to ignore.**
- **A reminder is a predicate over stored facts, defined once, never a stored flag** (AD-30).
- **Recurrence materialises on read, idempotently, and proposes before it writes** — there is
  no scheduler in the API, and a wrong amount created silently is worse than one not created
  at all (AD-33).
- **A plan and a record are separate rows and neither rewrites the other.** Deleting a plan
  leaves the records made from it, via `ON DELETE SET NULL (column)` — the column-list form,
  because the plain form nulls the `NOT NULL user_id` too and the delete fails outright
  (AD-35).
- **Modules are independent.** A service imports only its own models. The dashboard *page*
  composes modules by calling each one's endpoint; the dashboard *service* aggregates the
  ledger alone. A cross-module write goes through one explicitly named seam service
  (`services/shopping.py` is the only existing one) (AD-31).
- **Reference data is created by name, idempotently, case-insensitively** — typing a new
  category, vendor or exercise creates it, and a second one differing only in case returns the
  first (AD-12).
- **Money is `NUMERIC(14,2)`, `Decimal` in Python, a two-place string on the wire.** Never a
  float, never a JSON number (AD-5).
- **Every list endpoint returns `{"items": [...]}` with a total, deterministic order** (AD-20).
- **Charts are hand-rolled inline SVG.** No chart library, and none is to be added.
- **Scheduled work runs from cron on the host** (`backend/notify.py`), as the runtime role,
  one tenant at a time, and never writes domain data (AD-34).
- Next migration number is **0016**. Alembic, one migration per story that adds a table.

### The navigation constraint, which is real

The bottom tab bar holds five items — Dashboard, Entries, Plan, Stock, Gym — and that is the
measured maximum at 375 px. "Grow" was already displaced to the top bar to make room for Gym.
**Two new tabs do not fit.** Resolve this explicitly; do not quietly add a sixth and a
seventh. Options include displacing more sections to the top bar, merging tabs, or an
overflow affordance. Whatever you choose, verify it at 375 px in a browser rather than
asserting it.

---

## Feature A — A calendar

> "I want a calendar tab where we can add everything that has been added into this site."

One view of what happened, and what is due, on a given day: entries, savings contributions,
recurring proposals, inventory purchases, workouts.

### Questions to resolve and justify, not merely flag

1. **Is it a window or a workbench?** The request reads two ways: *show* everything already
   recorded, or *record* things from here as well. Decide, say which reading you took, and say
   what the other would have cost.
2. **How does it get its data without breaking AD-31?** A calendar needs rows from four or
   five modules that are forbidden to import each other. The dashboard page's precedent is to
   compose independent endpoints on the client. A read-only aggregator service is the other
   candidate. Pick one, and say what makes it the right seam rather than a convenient one.
3. **Which month does a calendar grid show** for an account whose budget month runs 26th to
   25th? A grid is calendar-shaped; the app's periods are not. Options include: the calendar
   month regardless, the budget period with ragged edges, or the calendar month with the
   budget boundary marked. This is the decision most likely to be silently wrong.
4. **Timestamps versus dates.** Entries, contributions and workouts carry a `DATE` the person
   chose. Inventory changes carry a `TIMESTAMPTZ` (the restock chart already buckets it in UTC
   explicitly, with the limitation stated). Say how the calendar places each without
   pretending they are the same kind of fact.
5. **Does it show the future?** Pending recurring occurrences have a `due_on`. Including them
   makes the calendar a forecast as well as a record; excluding them makes it purely
   historical. Either is defensible; an unstated mix is not.
6. **Density on a phone.** A month grid at 375 px with five kinds of event needs a rule for
   what a day cell shows when it holds nine things.

### Propose 2–4 things not asked for

Say which are v1 and which are later, with reasons. Candidates worth considering, though the
list is not a menu: a day detail view, filtering by module, a week view, jumping to the
underlying record, marking a day as reviewed.

---

## Feature B — Habits

> "I want a habits tab where you can add habits and the period of those and you can check them
> in when you have done them."

A habit is a thing you intend to do repeatedly; a check-in is evidence you did it.

### Questions to resolve and justify

1. **What is a "period"?** This is the crux and it forks hard. Daily; N times per week; every
   N days; specific weekdays; monthly. Each implies a different completion rule and a
   different "am I on track" figure. Pick the smallest model that answers "did I do it enough
   this week", and defer the rest **explicitly**, naming what a later migration would add.
2. **What is a check-in?** One per period, or many? Can it be recorded for a past day, and how
   far back? Is it a boolean, a count, or a quantity (30 minutes, 20 pages)? Note that AD-35
   already says a plan and a record are separate rows — a habit is a plan.
3. **Streaks and completion: derived or stored?** AD-9 and AD-30 both say a figure like this
   is computed, never duplicated into a column that can go stale. Confirm you can compute it
   in SQL, or explain why not.
4. **What happens when the period changes?** Changing "3 times a week" to "daily" re-judges
   every past week. The codebase has two precedents that point opposite ways: the currency and
   weight unit **lock** once data exists because they relabel stored numbers (AD-36), while the
   budget start day changes **freely** because it only re-groups. Say which kind this is.
5. **Deleting a habit.** Its check-ins are a record of things you actually did. `CASCADE`,
   `RESTRICT`, or archive-without-delete? AD-21 fixes delete behaviour in the schema, so
   decide it there rather than in a service.
6. **Do habits join the daily push digest?** `notify.py` already sends one notification per
   device per day for low stock and waiting recurring entries, and never writes domain data.
   Adding "2 habits still to do" is cheap; say whether it belongs, and what it would cost in
   annoyance.

### Propose 2–4 things not asked for

With v1 versus later. Candidates: a note per check-in, pausing a habit without deleting it,
a heat-map of the last N weeks, ordering habits by hand, a "skip" that is distinct from a miss.

---

## What to hand back

1. **A short brief per feature** — what it is, in the voice of the existing `docs/brief.md`.
2. **Every open question above, answered**, each with the trade-off you are accepting and what
   you rejected. An answer without a rejected alternative is not an answer.
3. **An epic and story breakdown in this repo's existing style**: vertical slices, one
   `Given/When/Then` acceptance block per story, matching the shape of `docs/epics.md` from
   Epic 13 onwards. Add rows to the requirements inventory and the coverage map.
4. **New architecture decisions (AD-37 onward) only where you extend an existing invariant**,
   written with the same rigour as AD-29 to AD-36: what it binds, what it prevents, the rule.
   Do not restate an existing AD, and do not mint one for something a story already says.
5. **The navigation answer**, verified at 375 px rather than asserted.

## How the work is expected to be done

- Tests are not optional and are not decoration. Backend tests run against **real Postgres**;
  there is no SQLite path, because SQLite has no row-level security and would make every
  isolation assertion meaningless.
- **Make a new test fail before trusting it.** Break the thing it protects; if it stays green
  it is decoration. Several bugs in this codebase were caught exactly this way, and the
  commits say so.
- Figures asserted in tests are worked out by hand first, in a comment, so a wrong join is
  caught by a number rather than by a person months later.
- Comments explain *why*, especially where a simpler-looking alternative is wrong. The
  codebase is written for the person who returns in six months.
- Nothing is pushed, published or deployed without explicit approval.
