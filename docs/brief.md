# Project Brief — MinimalBudget

> BMAD-shaped artifact. The BMAD CLI installer is interactive and cannot be driven headlessly in
> this environment, so the analyst → PM → architect documents were authored directly in the same
> document shape. Scope below is taken verbatim from the approved spec; no scoping questions were
> re-asked.

> Later features that needed a brief of their own carry it beside their decision record:
> `docs/mood.md` (Epic 24). This document remains the v1 scope, unamended.

## Problem

Personal finance apps are either bank-linked and heavy (Plaid onboarding, account permissions,
categorisation you have to correct) or spreadsheets that rot. There is a gap for a small,
self-hosted, manual-entry tracker whose only job is: *did I earn, spend and save what I meant to
this month?*

## Product

**MinimalBudget** — a single-page dashboard over manually entered income, expenses and savings
contributions, with per-category monthly budgets and per-type monthly savings targets.

Numbers-first. Muted palette. No gamification, no advice, no predictions.

## Target user

One person tracking their own money. Multi-user only in the sense that the deployment hosts many
independent single-user accounts that must never see each other's data.

## Success criteria (v1)

1. A user can register, log in, and reach a dashboard.
2. A user can record income and expense entries with a category, and savings contributions by type.
3. A user can set a monthly budget per expense category and a monthly target per savings type.
4. The dashboard shows, for a chosen month: budget vs actual per category, savings progress vs
   target per type, and month-over-month trends.
5. **A second authenticated user cannot read or write the first user's rows — proven by executing
   queries as that second user, not by reading the policy definition.**

## In scope (v1)

- Income entries: amount, category/source, date, optional note.
- Expense entries: amount, category, date, optional note.
- User-defined categories (freeform entry auto-creates the category, scoped per user and kind).
- Savings types (`startup`, `vacation`, `investment` seeded on registration; user may add more).
- Monthly savings target per type; monthly budget per expense category.
- Savings contributions by type.
- Dashboard: monthly summary, budget vs actual, savings progress, month-over-month trends.
- Per-user accounts with Postgres Row Level Security enforced at the database layer.

## Out of scope (v1) — explicitly not built

- Bank sync (Plaid or equivalent).
- Recurring transactions / bill automation.
- Multi-currency.
- CSV or any data export.
- Native mobile application.

## Future (v2 — no v1 code written toward it)

- React Native (Expo) client reusing this same FastAPI backend and API contract. The v1 API is
  therefore designed as a plain JSON HTTP API with token auth, with no server-rendered coupling to
  the web client.

## Constraints

- Frontend: React.
- Backend: FastAPI (Python).
- Database: Postgres, RLS on by default.
- Deploy target: undecided. The build must stay host-agnostic — no provider-specific SDKs, all
  configuration through environment variables.
