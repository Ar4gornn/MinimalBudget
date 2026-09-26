# Epic 33: Make it yours — modules, tab order, dashboard cards, more looks

**Status:** Scoped 2026-09-26, not built
**Depends on:** the themes work (`feat/themes`, `a8e8d77`) merged first — Story 33.6 extends it
**New decision record:** AD-49 (preferences on the account, one slot per layout)
**Migration:** `0025_user_preferences`

---

## 1. Scope (locked in the interview, 2026-09-26)

| Question | Chosen | Rejected |
|---|---|---|
| Scope | **Modules on/off, tab order, dashboard cards** | + density and font size; everything incl. free-form layout |
| Phone vs PC | **Two layout slots on the account** (`phone`, `desktop`) | Per device (lost with site data, set again on every browser) |
| Colours | **More preset accents and themes** | Custom hex with a contrast guard |
| Reorder UX | **Up/down buttons** | Drag-and-drop (a dependency or ~150 lines of pointer code, weak on touch and keyboard) |

### Goal

Someone who never lifts should not see Gym. Someone who opens Habits ten times a day should
have it next to their thumb. Someone who only cares about budgets should see budgets first
on the Dashboard. And someone who wants the app a different colour should have more than six
to choose from.

### Explicitly out, recorded as choices

- **Drag-and-drop.** Buttons first; drag can be added over the same data later.
- **Custom colours.** Every free colour would need a contrast check against every theme,
  and `TEXT_PAIRS` in `theme.test.tsx` can only guard colours it knows.
- **Density, font size, card sizes, column counts, free-form grids.**
- **Per-device layouts.** Colour and theme stay per device (they have to apply before the
  first paint). Layout lives on the account.
- **Turning off the core.** Dashboard, Entries, Plan and Grow are the budget. They can be
  moved but never hidden.
- **Blocking the API for a module that is off.** Off hides the UI. The data stays, the
  endpoints still answer, the CSV export still includes it, and switching the module back
  on shows everything as it was.
- **Home-screen shortcuts per user.** The manifest is static. If Notes is off, the Note and
  Sketch shortcuts land on the "turned off" page (§2.4).
- **Copying one layout to the other.** "Reset to default" per layout is in scope; "use my
  phone layout on desktop" is not.
- **Sharing layouts between accounts.**

---

## 2. Design

### 2.1 Storage — AD-49

One column: `users.preferences JSONB NOT NULL DEFAULT '{}'`. It is **sparse**: a missing
key means "default", so a card or module added in a later epic appears for everyone without
a data migration.

```json
{
  "modules": { "gym": false, "books": true },
  "phone":   { "tabs": [{ "id": "dashboard", "slot": "bar" }, ...],
               "cards": [{ "id": "budgets", "on": true }, ...] },
  "desktop": { "tabs": [...], "cards": [...] }
}
```

**Why a JSONB column and not one `PATCH /me/x` per setting.** There are about 30 values,
all read together, all belonging to one row, and none of them queried by the server except
`modules` (§2.6). The per-setting pattern (`currency`, `weight-unit`, ...) would add a
column, an endpoint and a migration for each one. Validation lives in one pydantic model
instead of the schema. A CHECK constraint that duplicated it would have to change with
every new card.

**Why not a separate table.** It would be 1:1 with `users` and add a join to `/me` for
nothing.

**Grants.** The app role has column-level grants on `users` (lab note: `password_hash`).
`preferences` needs an explicit `SELECT, UPDATE` grant, and it must be added to the named
column list in every read of `users`. Without that, `/me` returns a 500.

**API.**
- `GET /api/auth/me` → `UserOut` gains `preferences`, **resolved**: defaults merged in, so
  the client never has to guess. Preferences arrive with the one call `App` already waits
  on, so nothing flashes.
- `PATCH /api/auth/me/preferences` takes any of `modules`, `phone`, `desktop`. Each
  top-level key that is present **replaces** that subtree; absent keys are untouched.
  Returns `UserOut`.
- 422 codes: `pref_unknown_id` (a module, tab or card that does not exist),
  `pref_duplicate`, `pref_core_module` (trying to turn off a core section),
  `pref_slot_full` (the caps in §2.3), `pref_incomplete` (a `tabs` list that does not list
  every section exactly once). The size is bounded by the schema (at most 32 items per list, ids of at most 32
characters), and booleans are strict, so `"off"` is a 422 and not `false`.

**Merge rule, in one function (`services/preferences.py`), tested on its own.** Take the
stored order. Drop ids that no longer exist. Append ids the stored list does not have, at
their default position relative to their default neighbours. Module flags default to on.

### 2.2 Layout: phone or desktop

`useLayout()` returns `"phone"` when `matchMedia("(max-width: 720px)")` matches, otherwise
`"desktop"`. That is the breakpoint every phone rule in `styles.css` already uses. The hook
updates live, so rotating a tablet across 720px switches layouts; that is accepted.

### 2.3 Sections and tabs

The navigation becomes data: eight **sections**. Each has an id, a primary route, the
routes it also lights (`also`), its label and glyph, and the module it belongs to (if any).

| Section | Routes | Core? | Default phone slot | Default desktop slot |
|---|---|---|---|---|
| `dashboard` | `/`, `/calendar`, `/notes*` | core | bar 1 | bar 1 |
| `entries` | `/entries`, `/categories/*` | core | bar 2 | bar 2 |
| `habits` | `/habits`, `/books` | — | bar 3 | bar 3 |
| `stock` | `/inventory` | — | bar 4 | bar 4 |
| `gym` | `/gym` | — | bar 5 | bar 5 |
| `plan` | `/plan` | core | top 1 | top 1 |
| `grow` | `/projections` | core | top 2 | top 2 |
| `recipes` | `/recipes*` | — | top 3 | top 3 |

**Slots.** `bar` is the bottom tab bar on a phone and `.nav` on a desktop. `top` is
`.nav-extra`. The defaults reproduce today's app exactly.

**Caps, phone only: `bar` holds at most 5 and `top` at most 3.** With all eight sections
on, those caps are also minimums, so moving a section between slots is a swap: it goes last in
the other row, and that row's last section takes its place (`switchSlot`, built 2026-09-26). They come
from measurement, not taste: the phone top bar's content box is 335px at 375 and French is
the wide language (Epic 27 lab note). Story 33.4 re-measures the worst case: the three
longest French labels in `top` at 320 and 375. **Measured 2026-09-26 on a production build:**
Opérations/Habitudes/Recettes at 375 stays one row, with a 56px pill (floor 44) and no clipping
or sideways scroll; at 320 it wraps the pill to a second row, 79px tall, exactly as today's
default does at 320. English (Dashboard/Entries/Recipes) behaves the same. The cap stays 3. On a desktop there are no caps; order and slot are
free.

**A section with more than one view.** The Habits section is Habits plus Books. If `habits`
is off and `books` is on, the section keeps its tab, points at `/books`, and takes its label
from Books. A section whose views are all off disappears from the tab list. This generalises
the existing `ViewSwitch`/`also` mechanism; it does not add a second one.

**Editor (Settings → Layout).** Two tabs, "Phone" and "Desktop". The one matching the
current screen opens first, and each tab is editable from any device. Each row shows the
section name, ↑ and ↓ buttons, and a "Move to top bar / Move to tab bar" button. A disabled
button says why in its accessible name ("Tab bar is full: 5 of 5"). Every change is saved at
once (§2.7). "Reset to default" sits at the bottom, behind a confirmation.

### 2.4 Modules

| Module | Section / view | Everywhere else it disappears from |
|---|---|---|
| `habits` | Habits view | Calendar habits layer; habit reminders in the push digest |
| `books` | Books view | Dashboard "Reading now" and quote cards; calendar quote card |
| `mood` | Mood card on Habits | Dashboard mood popover trigger; calendar mood layer; `?mood=1` shortcut |
| `stock` | Stock section (the shopping list lives inside it) | Dashboard "Restock" card; calendar stock layer; restock push digest |
| `gym` | Gym section | Calendar gym layer |
| `recipes` | Recipes section | Calendar meals layer |
| `notes` | `/notes*` | Dashboard Notes link and floating note button; Note/Sketch shortcuts land on the off page. Drafts already written still sync: that is data, not UI |

The table is authoritative, and it is enforced: `layout/modules.test.tsx` derives each
module's API functions from `api/client.ts` and fails if any file outside the listed callers
uses one. (Built 2026-09-26: the grep found no entry-form purchase link. The spec's first
draft had listed one that does not exist.)

**A route to a module that is off** renders a short page: "Gym is turned off", with a link
to Settings → Layout. It does not silently redirect, because a bookmark or a home-screen
shortcut would then look broken. **Toggles** sit in Settings → Layout, above the tab editor,
one switch per module, with a line saying the data is kept.

### 2.5 Dashboard cards

Nine cards, each with a stable id. These are the `collapseKey` suffixes that already exist,
plus `stats` and `trends`, which have none today:

| id | Card | Module | Default order |
|---|---|---|---|
| `stats` | Income / expense / net / saved | — | 1 |
| `pending` | To confirm (recurring) | — | 2 |
| `reading` | Reading now | books | 3 |
| `quote` | Quote | books | 4 |
| `restock` | Restock | stock | 5 |
| `budgets` | Budget vs actual | — | 6 |
| `savings` | Savings progress | — | 7 |
| `trends` | Last N months | — | 8 |
| `categories` | Expense by category | — | 9 |

The default order must equal today's render order. Story 33.5 reads it off the page before
refactoring and pins it with a test.

**Refactor:** a registry, `id → { module?, render }`, and the page maps over the resolved
order. Card state that the page shares (month, period, trend window) stays in the page.

**A hidden card is not fetched.** Cards whose data has its own request (`reading`, `quote`,
`restock`, `pending`) skip that request when hidden. `stats`, `budgets`, `savings`,
`trends` and `categories` share the summary/trends responses. Hiding some of them saves no
request, and hiding all of them skips both calls. Collapsed stays per device and independent
of hidden: a collapsed card is still fetched, because it shows a summary line.

**Built 2026-09-26.** Neighbouring cards of one family are grouped as before: budgets
beside savings (a lone one takes the full width), trends above categories. The period note
sits before the monthly group. One consequence is recorded rather than hidden: reading the
pending list is what materialises recurring proposals, so with the "To confirm" card hidden
the dashboard no longer does that, and the Plan page and the calendar still do.
"Reset this layout" restores the tabs **and** the cards of the layout being edited.

**Editor:** Settings → Layout, a "Dashboard" list under each layout tab. Each row has a
show/hide switch plus ↑/↓. Cards of a module that is off are listed greyed out, with
"Gym is turned off" in place of the switch, so turning the module back on restores the card
where it was. The tour step anchored on `budget-progress` is skipped if `budgets` is hidden
(§2.8).

### 2.6 Server-side reader: the push digest

`backend/notify.py` reads `preferences.modules` and leaves out the restock section when
`stock` is off, and the habit section when `habits` is off. This is the only server-side
consumer. It reads through the same merge function, so a missing key means on.

### 2.7 Saving

Preferences live on the auth context's `user`, so every consumer re-renders from one
source. A change applies optimistically, then `PATCH`es. The PATCH goes through one
single-flight queue with a generation counter (same shape as `useLoad`): quick taps
coalesce, and the answer that lands last cannot overwrite a newer local state. If the PATCH
fails, the change reverts and an inline error appears. No full-page banner.

### 2.8 The tour (Epic 30)

The tour's steps name a section or card id, not a DOM position. A step whose target is off
or hidden in the current layout is skipped. The step count shown ("2 of 5") counts only the
steps that will run.

### 2.9 More looks (per device, unchanged storage)

- **Three more accents: `slate`, `cobalt`, `plum`** (built 2026-09-26). The brief asked for
  `green`, `amber`, `rose`, `slate`, with a hue check first. Rule applied: an accent's hue
  must sit at least 45° from money in (green, 130°), money out (red, 1°) and the warning
  (orange, 30°) — the three meanings `styles.css` already refuses as accents.

  | Proposed | Hue | Nearest meaning | Verdict |
  |---|---|---|---|
  | green | 142° | in, 12° | dropped |
  | rose | 347° | out, 14° | dropped |
  | amber | 26° | warning 4°, out 25° | dropped |
  | slate | 215° | in, 84° | kept |

  What passes the rule lies between the existing presets: cobalt (224°, 94° from in) and
  plum (295°, 66° from out) were taken; cyan (7° from blue) and olive (44° from in) were
  not. Four was not reachable without an accent that reads as a meaning or as another
  preset, so Alex chose three.
- **One more theme: `sepia`** (warm light, for evening reading). It is a full `data-theme`
  block, so every colour token needs a value, and every `TEXT_PAIRS` entry must pass AA.
- `ACCENTS` in `theme.tsx` and in `public/theme.js` change together. Bump `?v=` in
  `index.html`, or the worker keeps serving the old `theme.js` cache-first.

---

## 3. Stories

### Story 33.1: Preferences on the account

**Given** an account with no stored preferences
**When** it reads `/me`
**Then** `preferences` is the full resolved default, identical to today's layout
**And** `PATCH /me/preferences` with only `modules` leaves `phone` and `desktop` untouched
**And** every 422 code in §2.1 is reachable and tested, including a `tabs` list that misses
a section and a phone layout with 6 in `bar`
**And** a stored id that no longer exists is dropped from the answer, and a new id is
inserted at its default position (merge function unit-tested with both cases)
**And** a second user can neither read nor change the first user's preferences (RLS,
tested as that user, not by reading the policy)
**And** the migration grants `SELECT, UPDATE (preferences)` to the app role, and a `/me`
read after it is a 200. Mutation: remove the grant, and the test goes red.

### Story 33.2: The client knows its layout and its preferences

**Given** `useLayout()` and `usePreferences()`
**Then** the layout follows the 720px query live, and preferences come from the auth
context with no extra request
**And** a change is optimistic, single-flight, last-asked-wins, and reverts on failure.
Test: two changes where the first response lands second, and the second change wins.
Mutation: remove the generation check, and the test goes red.

### Story 33.3: Turning a module off

**Given** a module switched off in Settings → Layout
**Then** every place in the §2.4 table stops showing it, in both layouts, with no reload
**And** its routes render the "turned off" page with a link to Settings
**And** Habits off with Books on leaves one tab, labelled Books, pointing at `/books`
**And** the calendar neither draws nor requests the layer
**And** the push digest leaves out its section (backend test per module)
**And** turning it back on restores everything, data included
**And** a grep of each module's API client imports matches the table. Any extra caller is
fixed or added to the table.

### Story 33.4: Tab order and placement

**Given** Settings → Layout → Phone
**When** I move sections with ↑/↓ and between slots
**Then** the bottom bar and top bar follow at once, and after a reload
**And** the caps hold. On a phone both rows are full, so moving a section across swaps it
with the last of the other row, and the button's accessible name says who comes back ("Move
Gym to the top bar, and Recipes to the tab bar"). Nothing is ever blocked except ↑ at the
top and ↓ at the bottom of a row
**And** the Desktop tab edits the desktop layout while I am on a phone, without changing
what I see
**And** "Reset to default" restores today's layout after a confirmation
**And** the worst-case `top` in French fits at 320 and 375 with no horizontal scroll and a
settings pill of at least 44px. Measured with `getBoundingClientRect` in the harness, both
languages.

### Story 33.5: Dashboard cards

**Given** today's Dashboard
**Then** a test pins the current card order *before* the refactor, and the refactor keeps
it green
**When** I hide, show and reorder cards per layout
**Then** the Dashboard follows at once, and after a reload
**And** a hidden `reading`, `quote`, `restock` or `pending` card makes no request (network
assertion in the test). Mutation: always fetch, and the test goes red.
**And** cards of a module that is off are greyed in the editor and absent on the Dashboard
**And** the tour skips the budget step when `budgets` is hidden, and its count says so

### Story 33.6: More accents and a sepia theme

**Given** Settings → Appearance
**Then** three more accents (slate, cobalt, plum — §2.9) and a sepia mode are offered, previewed and saved as today
(per device, Save/Cancel)
**And** every `TEXT_PAIRS` pair passes AA in sepia, and every accent passes the accent
contrast check in every theme
**And** `theme.js` and `theme.tsx` agree (existing parity test) and the `?v=` is bumped

### Story 33.7: QA

- Every new label is `{ en, fr }`, no full sentence is identical across the two, and no key
  is unused (the ten-line grep from Epic 27).
- 375/320 × EN/FR × light/dark overflow sweep against a `main` baseline, as for the reskin.
- Browser run on the verify stack. A fixture account turns Gym off, moves Habits to bar 1,
  hides Savings on phone only, then checks the phone and desktop widths show different
  dashboards.
- Lint, backend and frontend suites, build, all green.

---

## 4. Risks

| Risk | Mitigation |
|---|---|
| The top bar overflows in French with a user-chosen trio | Worst case measured in 33.4. The cap drops to 2 if it fails. |
| A module-off leak: some corner still links to Gym | The table in §2.4 plus the import grep in 33.3 |
| Preferences drift as epics add cards | Sparse storage plus the merge function. Adding a card is one registry entry and one default position. |
| The Dashboard refactor reorders cards by accident | Order pinned by a test before the refactor |
| Optimistic saves race | Single-flight with a generation counter, tested with an out-of-order response |
| The column grant is forgotten and `/me` returns a 500 in production | Migration test plus mutation in 33.1 |
