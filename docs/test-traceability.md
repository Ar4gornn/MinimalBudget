---
stepsCompleted: [step-01-load-context, step-02-discover-tests, step-03-map-criteria, step-04-analyze-gaps, step-05-gate-decision]
lastStep: 'step-05-gate-decision'
workflowType: 'testarch-trace'
inputDocuments: [docs/epics.md, docs/prd.md, docs/architecture.md]
coverageBasis: 'acceptance_criteria'
oracleConfidence: 'high'
oracleResolutionMode: 'formal_requirements'
oracleSources: [docs/epics.md]
externalPointerStatus: 'not_used'
---

# Traceability Matrix & Gate Decision — MinimalBudget v1

**Target:** MinimalBudget v1 (6 epics, 20 stories)
**Date:** 2026-08-29
**Evaluator:** TEA Agent
**Coverage Oracle:** formal acceptance criteria in `docs/epics.md` (17 FRs, 7 NFRs, 5 ARs)
**Oracle Confidence:** high — the epics document carries explicit Given/When/Then criteria per story
**Gate Type:** release · **Decision Mode:** deterministic

> This workflow does not generate tests. Gaps below were handed to the test-writer agent.

---

## PHASE 1: REQUIREMENTS TRACEABILITY

### Coverage Summary

| Priority | Total Criteria | FULL Coverage | Coverage % | Status |
| --- | --- | --- | --- | --- |
| P0 | 11 | 9 | 82% | ❌ FAIL |
| P1 | 12 | 10 | 83% | ⚠️ WARN |
| P2 | 6 | 5 | 83% | ℹ️ |
| **Total** | **29** | **24** | **83%** | **⚠️** |

Priorities assigned per `test-priorities-matrix`: anything on the isolation guarantee, auth, or
money correctness is P0; primary CRUD journeys are P1; presentation and convenience are P2.

### Detailed Mapping — P0

| ID | Criterion | Coverage | Tests |
| --- | --- | --- | --- |
| NFR-1 | Isolation enforced by RLS, not app filters | FULL ✅ | `test_schema_audit.py:21,46,60,93`, `test_tenancy.py:18,31,43` |
| NFR-2 | Isolation proven by executing as a second user | FULL ✅ | `test_isolation.py:18,38,72`, `test_isolation_ledger.py:31,49`, `test_isolation_savings.py:31` |
| AR-1 | Every inter-table FK carries `user_id` (FK checks bypass RLS) | FULL ✅ | `test_isolation_ledger.py:91`, `test_isolation_savings.py:86` |
| AR-2 | Tenancy set once per request, bound parameter, single commit | FULL ✅ | `test_tenancy.py:56,76,95,107` |
| AR-3 | Another user's row is 404; RESTRICT is 409 | **PARTIAL ⚠️** | `test_isolation.py:85`, `test_categories.py:77`, `test_entries.py:199`, `test_isolation_savings.py:51,73` |
| AR-5 | Two-user isolation test per slice | **PARTIAL ⚠️** | `test_isolation.py`, `test_isolation_ledger.py`, `test_isolation_savings.py` |
| NFR-3 | Money is NUMERIC(14,2), never a float, decimal strings on the wire | FULL ✅ | `test_entries.py:25,34,49,54,60`, `test_dashboard.py:222`, `money.test.ts:6,17` |
| NFR-4 | Argon2id, short-lived HS256 JWT, no refresh | FULL ✅ | `test_auth.py:10,46,59,77`, `test_tenancy.py:76`, `test_schema_audit.py:78` |
| FR-1 | Register | FULL ✅ | `test_auth.py:10,20,32,83` |
| FR-2 | Log in, read own profile | FULL ✅ | `test_auth.py:46,59,71,77` |
| NFR-5 | Config from env only; startup fails without secrets | **NONE ❌** | — |

### Detailed Mapping — P1

| ID | Criterion | Coverage | Tests |
| --- | --- | --- | --- |
| FR-3 | Registration seeds three savings types | FULL ✅ | `test_auth.py:20`, `test_savings.py:19` |
| FR-4 | Category CRUD | FULL ✅ | `test_categories.py:14,26,37,43,50,59,89` |
| FR-5/6 | Income and expense entries | FULL ✅ | `test_entries.py:25,78,86,120` |
| FR-7 | Unknown category name auto-creates | FULL ✅ | `test_entries.py:96,105,112`, `test_categories.py:93`, `EntriesPage.test.tsx:60` |
| FR-8 | List, amend, delete entries with filters | FULL ✅ | `test_entries.py:120,165,181,192,199` |
| FR-9/10 | Savings types and contributions | FULL ✅ | `test_savings.py:27,39,50,57,63,82,101,110` |
| FR-11/12 | Standing budgets and targets | FULL ✅ | `test_savings.py:119,138,154,173,186,203` |
| FR-13/14/15 | Monthly summary, budget vs actual, savings vs target | FULL ✅ | `test_dashboard.py:101,118,125,131,144,155` |
| FR-16 | Month-over-month trends | FULL ✅ | `test_dashboard.py:176,189,202` |
| AR-4 | Enveloped, deterministically ordered collections | FULL ✅ | `test_categories.py:14`, `test_entries.py:120`, `client.test.ts:22` |
| FR-17a | Client: auth, entries, dashboard | FULL ✅ | `client.test.ts` (8), `DashboardPage.test.tsx` (7), `EntriesPage.test.tsx` (4) |
| FR-17b | Client: savings and budgets management (Story 5.3) | **NONE ❌** | — |

### Detailed Mapping — P2

| ID | Criterion | Coverage | Tests |
| --- | --- | --- | --- |
| NFR-6 | API reusable by a mobile client (no cookies, JSON only) | FULL ✅ | `test_auth.py:46` |
| NFR-7 | Aggregation in SQL; empty months are explicit zeroes | FULL ✅ | `test_dashboard.py:176,189`, mutation-verified |
| — | Month arithmetic and boundaries | FULL ✅ | `months.test.ts` (4), `test_entries.py:120` |
| — | Client error surfacing | FULL ✅ | `DashboardPage.test.tsx:153`, `EntriesPage.test.tsx:98`, `client.test.ts:64,76` |
| — | Trend chart is inline SVG, no library | FULL ✅ | `DashboardPage.test.tsx:142` |
| — | Trends `ending` defaults to the current month | **NONE ⚠️** | — |

---

### Gap Analysis

#### Critical Gaps (BLOCKER) ❌

**2 gaps.**

1. **AR-3 / AR-5 — cross-user coverage stops short of two write paths** (P0)
   - Current: PARTIAL. `POST /api/savings/contributions` and `PUT /api/savings/targets/{id}` are
     proven to answer 404 for another user's savings type, and category/entry writes are covered.
   - Missing: `PATCH` and `DELETE` of **another user's contribution**, and `DELETE` of **another
     user's savings type**. Nothing asserts those answer 404 rather than acting.
   - Impact: these are the only remaining mutating endpoints with no executed cross-user proof.
     The project's own standard (NFR-2) is that isolation is demonstrated, not reasoned about, and
     for these three routes it currently is not.
   - Recommend: extend `test_isolation_savings.py`.

2. **NFR-5 — nothing proves the app refuses to start without its secrets** (P0)
   - Current: NONE. Story 1.1 states "a missing `SECRET_KEY` or database URL fails startup with a
     clear error" and "no secret has a working default". Both are unasserted.
   - Impact: a future default added for convenience would silently ship a known signing key, and
     no test would notice. This is the failure mode that makes a JWT forgeable.
   - Recommend: a settings test asserting construction fails without `SECRET_KEY` / `DATABASE_URL`,
     and that a placeholder secret is rejected.

#### High Priority Gaps (PR BLOCKER) ⚠️

**1 gap.**

1. **FR-17b — Story 5.3's screen has no component test** (P1)
   - Current: NONE. `PlanPage.tsx` is the largest untested component: savings types, contributions,
     budgets and targets all run through it, including the PUT-upsert semantics of AD-11 and the
     409 explanation path.
   - Impact: the one screen where a wrong call shape silently duplicates a budget instead of
     updating it.
   - Recommend: `PlanPage.test.tsx` covering save-as-PUT, the 409 message, and amount validation.

#### Medium Priority Gaps (Nightly) ⚠️

1. `GET /api/dashboard/trends` with no `ending` parameter (defaults to the current month) — the
   default branch is never exercised.

#### Low Priority Gaps ℹ️

None outstanding. `SignInPage` and `AuthContext` are exercised end to end through the browser run
rather than by a component test; that is acceptable at this scale and is recorded as residual risk
rather than a gap.

---

### Coverage Heuristics Findings

**Endpoint coverage.** The live OpenAPI schema exposes 23 API operations plus `/health`; all 24
have at least one test. Ten of those mutate while referencing a resource by id — in the path or in
the body — and so can be pointed at another user's row. Seven have an executed cross-user negative
path:

| Route | Cross-user proof |
| --- | --- |
| `POST /api/entries` (body `category_id`) | ✅ `test_isolation_ledger.py:75,91` |
| `PATCH /api/entries/{id}` | ✅ `test_entries.py:199` |
| `DELETE /api/entries/{id}` | ✅ `test_entries.py:199` |
| `DELETE /api/categories/{id}` | ✅ `test_categories.py:77` |
| `POST /api/savings/contributions` (body `savings_type_id`) | ✅ `test_isolation_savings.py:51` |
| `PUT /api/savings/targets/{type_id}` | ✅ `test_isolation_savings.py:51` |
| `PUT /api/budgets/{category_id}` | ✅ `test_isolation_savings.py:73` |
| `PATCH /api/savings/contributions/{id}` | ❌ **gap** |
| `DELETE /api/savings/contributions/{id}` | ❌ **gap** |
| `DELETE /api/savings/types/{id}` | ❌ **gap** |

**Auth/authz negative paths.** Strong. Unauthenticated (401), wrong credentials (401,
indistinguishable from unknown email), forged and unsigned tokens, non-UUID `sub`, unset tenant,
and the password-hash column grant are all asserted.

**Happy-path-only criteria.** None. Every FR with a test has at least one error or edge assertion.

---

### Quality Assessment

**BLOCKER issues:** none.

**WARNING issues:** none.

**INFO issues:**

- `test_dashboard.py` and `test_entries.py` each define a `test_a_malformed_month_is_rejected`.
  Distinct modules, so no collision, but the names do not distinguish the endpoint under test.

**Notable strengths, recorded because they change the confidence in this matrix:**

- Three invariants were **mutation-verified**, not merely asserted: weakening the RLS policy to
  `USING (true)` turned 8 tests red; reducing the entries→categories foreign key to a single column
  turned `test_the_foreign_key_itself_refuses_a_cross_user_reference` red; reversing the
  budget-vs-actual join direction and removing the trend gap-fill turned 4 dashboard tests red.
  Coverage claims for NFR-1, AR-1 and NFR-7 rest on observed failure, not on the tests being green.
- Every backend test runs against real Postgres as the **runtime role**. There is no SQLite path,
  so the isolation assertions exercise the same policies production would.
- `test_isolation*.py` each carry a positive-case test, so "zero rows" can never pass because the
  database was empty.

**124/124 tests pass** (95 backend, 29 frontend).

---

### Coverage by Test Level

| Test Level | Tests | Criteria Covered | Coverage % |
| --- | --- | --- | --- |
| API / integration (real Postgres) | 95 | 24 | 83% |
| Component (RTL) | 11 | 6 | 21% |
| Unit | 18 | 5 | 17% |
| **Total** | **124** | **24 / 29** | **83%** |

---

## PHASE 2: QUALITY GATE DECISION

### Evidence Summary

- **Total tests:** 124 · **Passed:** 124 (100%) · **Failed:** 0 · **Skipped:** 0
- **Duration:** ~36s backend, ~25s frontend
- **Source:** local run, 2026-08-29
- **P0 coverage:** 9/11 (82%) ❌ · **P1 coverage:** 10/12 (83%) ⚠️ · **Overall:** 83%
- **Security:** CONCERNS — no test defends the "no working default secret" rule (NFR-5)
- **Performance / reliability:** NOT_ASSESSED (out of scope for v1)
- **Flakiness:** not burned in; no flakiness observed across ~12 full runs during development

### Decision Criteria Evaluation

| Criterion | Threshold | Actual | Status |
| --- | --- | --- | --- |
| P0 coverage | 100% | 82% | ❌ FAIL |
| P0 pass rate | 100% | 100% | ✅ PASS |
| Security issues | 0 | 1 (untested guarantee) | ❌ FAIL |
| P1 coverage | ≥90% | 83% | ❌ FAIL |
| Overall pass rate | ≥95% | 100% | ✅ PASS |

### GATE DECISION (initial run): ❌ FAIL → remediated below, now PASS

### Rationale

Every test that exists passes, and the invariants that matter most were verified by making them
fail on purpose. But the gate is about coverage, not about green: two P0 criteria are not covered
at all.

`AR-3`/`AR-5` is the sharper of the two. This project's stated standard is that isolation is
proven by executing queries as a second user — and for three mutating routes it simply has not
been. Those routes are almost certainly correct, since they go through the same
`require_type` / RLS path as their tested siblings. "Almost certainly correct" is exactly the claim
the standard exists to refuse.

`NFR-5` fails for a different reason: the rule it protects ("no secret has a working default") is
one a future change could break silently and cheaply, and nothing would go red.

Neither gap justifies shipping and fixing later, because both are small. Fix, re-run, re-gate.

### Next Steps

**Immediate (before publish):**

1. Extend `test_isolation_savings.py` with cross-user `PATCH`/`DELETE` on contributions and
   `DELETE` on savings types.
2. Add a settings test for the missing-secret and placeholder-secret paths.
3. Add `PlanPage.test.tsx`.

**Follow-up (next milestone):**

1. Cover the `trends` default-month branch.
2. Consider a burn-in run once CI exists.

---

## Related Artifacts

- Epics / acceptance criteria: `docs/epics.md`
- Architecture invariants: `docs/architecture.md`
- Tests: `backend/tests/`, `frontend/src/**/*.test.ts(x)`


---

## REMEDIATION & RE-GATE — 2026-08-29

All three gaps closed. Re-run: **112 backend + 33 frontend = 145 tests, all passing.**
`ruff check` clean, `tsc -b` and `vite build` clean.

| Gap | Closed by |
| --- | --- |
| AR-3 / AR-5 — three mutating routes with no cross-user proof | `test_isolation_savings.py` + 3 tests: `test_b_cannot_patch_a_contribution_of_a`, `test_b_cannot_delete_a_contribution_of_a`, `test_b_cannot_delete_a_savings_type_of_a`. Each asserts 404 **and** that A's data is unchanged afterwards. |
| NFR-5 — no proof the app refuses to start without secrets | `test_settings.py`, 14 tests: missing `SECRET_KEY`, missing `DATABASE_URL`, placeholder secrets, short secrets, padded secrets, and a positive case over 20 generated tokens. |
| FR-17b — savings & budgets screen untested | `PlanPage.test.tsx`, 4 tests: budget save is a PUT with a two-place decimal string and never a POST; target save is a PUT; three-decimal and negative amounts are refused client-side with no request sent; a 409 surfaces the server's `detail`. |

### Defect found by writing the tests

Writing the NFR-5 tests exposed that the guarantee was **not actually enforced**, in two layers:

1. `_reject_placeholder_secret` was declared as a plain `field_validator`, which in pydantic v2
   runs *after* the field's constraints. Every literal it checked (`changeme`, `secret`, …) is
   shorter than 32 characters, so `min_length=32` rejected them first and the validator never ran.
   It read as a guard and was dead code.
2. Worse, and only visible once the first point was investigated: `"0" * 32`, `"a" * 40` and
   `"changeme" * 4` were all **accepted**. Those clear `min_length` and are exactly what someone
   types to satisfy a length rule without generating anything.

Fixed in `app/core/config.py`: the validator now runs in `mode="before"` — so a placeholder gets
"this is a placeholder" instead of "too short" — and rejects any value of 16+ characters with
fewer than 8 distinct characters. Verified by probing each case directly before and after, and by
a positive test over 20 real `token_urlsafe` values so the rule cannot be over-tight.

This is the gate earning its keep: the criterion was not merely untested, it was untrue.

### Decision Criteria — re-evaluated

| Criterion | Threshold | Before | After | Status |
| --- | --- | --- | --- | --- |
| P0 coverage | 100% | 82% | 100% | ✅ PASS |
| P0 pass rate | 100% | 100% | 100% | ✅ PASS |
| Security issues | 0 | 1 | 0 | ✅ PASS |
| P1 coverage | ≥90% | 83% | 100% | ✅ PASS |
| Overall pass rate | ≥95% | 100% | 100% | ✅ PASS |

### GATE DECISION: ✅ PASS

Every P0 and P1 criterion is now covered and passing. Residual, accepted rather than fixed:

- `GET /api/dashboard/trends` without `ending` (the current-month default branch) is still
  unexercised — P2, and the parameterised path is covered.
- `SignInPage` and `AuthContext` have no component test; both are exercised end to end through the
  browser run. Residual risk: LOW.
- No burn-in for flakiness. No flakiness observed across ~15 full runs, but that is observation,
  not a controlled result. Revisit when CI exists.

Next: pre-publish review over the full diff.

---

## PRE-PUBLISH REVIEW — 2026-08-29

Verdict: safe to publish, after one blocking fix. Findings acted on:

| Severity | Finding | Outcome |
| --- | --- | --- |
| HIGH | Every money field returned **500** on a malformed amount. `Decimal("abc")` raises `decimal.InvalidOperation` — an `ArithmeticError`, not a `ValueError` — so pydantic never turned it into a 422. `"NaN"`/`"Infinity"` raised `TypeError` on a non-finite exponent. | Fixed, plus a worse one the review missed: `"1_0"` was **accepted** as 10.00, because Decimal honours PEP 515 underscores. Amount strings are now shape-checked before Decimal sees them. 54 regression tests across all four money endpoints. |
| LOW | The database init script interpolated passwords into SQL through the shell, as the superuser. | Fixed with psql variables. Verified by creating a role whose password is `'; ALTER ROLE moneymap_app SUPERUSER; --` and confirming it did not. (Quoted as it was actually executed. The runtime role was renamed to `minimalbudget_app` afterwards, when the project took its published name — the payload is left verbatim rather than back-dated.) |
| LOW | The dashboard's six aggregates were the only queries with no redundant `user_id` filter. | Made consistent with AD-1's defence-in-depth rule. |
| LOW | `isValidMoney` accepted `"0"` while both call sites said "greater than zero". | Split into `isPositiveMoney` and `isNonNegativeMoney`; also removes a regex PlanPage had inlined. |
| LOW | PlanPage fetched all five collections twice on mount. | Fixed; verified in the browser that it now matches the StrictMode baseline of every other page. |
| LOW | Vite reads env files from its own directory, so a production build never saw `VITE_API_BASE_URL`. | `envDir` set; default value is now empty, since same-origin is what the dev proxy serves. |
| LOW | `addMoney` was referenced only by its own test. | Removed. |

Confirmed clean by the review, each traced rather than inferred: no secret in any of the 12
commits or in history; no route reaches the database without a tenant; `auth_lookup` is
`SECURITY DEFINER` with a pinned `search_path` and cannot be made to return another user's row;
the owner-only policy is unreachable by the API because it never holds the owner credentials;
every dependency resolves to the public registry.

**Final: 199 tests (166 backend, 33 frontend), verified from a destroyed and rebuilt database.**
