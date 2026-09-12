# Feature request: a daily check-in — how you feel, and whether the day was any good

## Context

MinimalBudget is a personal tracker in production use by one family, each member on an
independent account. FastAPI + Postgres, React + Vite + TypeScript, mobile-first and
installable as a PWA. It began as a budgeting app and has grown past that: a ledger,
savings, budgets, an inventory with a shopping list, recurring entries, a gym log, a
calendar over all of it, and habits with check-ins and streaks.

Read `docs/architecture.md` (AD-1 to AD-40), `docs/epics.md` (Epics 1 to 23) and
`docs/brief.md` before designing anything. The list below is the subset you will collide
with; it is ground truth, not suggestion. Do not weaken or redesign any of it.

### Fixed ground truth

- **Isolation is the database's job.** Postgres row-level security, enabled *and* forced, on
  every user-scoped table. Application `WHERE user_id` filters are defence in depth and never
  the only thing between two people's data (AD-1).
- **Every foreign key between user-scoped tables is composite and includes `user_id`**,
  backed by a matching composite unique key, because Postgres foreign-key checks bypass row
  security (AD-18).
- **Every new table ships an isolation test that executes as a second user** connected as the
  runtime role — proven by running queries, never by reading a policy. A schema audit test
  enumerates every table and fails on anything unprotected (AD-24).
- **A month is the account's, not the calendar's.** `users.budget_start_day` is 1–28 (AD-10).
- **A derived figure is computed, never stored.** No `is_low` flag, no `streak` column, no
  "done today" boolean. A stored one goes stale the moment its definition moves (AD-9, AD-30,
  AD-40).
- **A plan and a record are separate rows and neither rewrites the other** (AD-35).
- **Modules are independent.** A service imports only its own models. A cross-module *read*
  is composed at the edge — the page calls each module's endpoint; a cross-module *write* is
  the one named seam, `services/shopping.py` (AD-31, AD-37).
- **A calendar surface shows the account's period**, and a stored instant is placed by **UTC
  day**, said out loud rather than left for the reader to discover (AD-38).
- **Every list endpoint returns `{"items": [...]}` with a total, deterministic order** (AD-20).
- **Store the fact, derive the presentation.** AD-29 is the precedent: no table stores a unit
  price, because it is `amount / quantity` and a stored copy drifts. Apply the same reasoning
  to anything you are tempted to store because it is what the screen happens to show.
- **Charts are hand-rolled inline SVG.** No chart library, and none is to be added.
- **Scheduled work runs from cron on the host** (`backend/notify.py`), as the runtime role,
  one tenant at a time, and never writes domain data (AD-34).
- **The brief's line, still binding:** *"No gamification, no advice, no predictions."*
- Next migration number is **0017**. Next epic is **24**. Next requirement is **FR-53**, next
  additional requirement **AR-23**, next architecture decision **AD-41**.

### Two constraints that are real, and specific to this feature

**1. There is no modal anywhere in this application.** Verified, not assumed: zero
`role="dialog"`, zero `<dialog>`, zero `showModal`, one `window.confirm` (the habit delete),
and one overlay — the toast, which is `role="status"` and never takes focus. `EntriesPage`
says why in a comment: inline editing "rather than a modal: the rows already become cards on
a phone, so the same markup turns into a sensible form without needing focus trapping,
escape handling and scroll locking to be got right."

So the word **"popup" in the request is new machinery**, not a component you are picking up.
Either justify introducing it — and then get it right: focus trap, Escape, scroll lock,
focus restored to the icon on close, `aria-modal`, and a decision about what it does at
375 px where a centred dialog and a bottom sheet are different things — or replace it with
something this codebase already does, and say what that costs the person tapping it.

**2. The dashboard header is already full.** It carries the section switch
(Summary | Calendar), the period chips (Month | Year | All time) and the month navigator; the
top bar carries Plan, Grow and the identity pill; the bottom bar holds five items and that is
the measured maximum at 375 px. An icon has to go somewhere, and "somewhere" is a decision
with a cost. Resolve it explicitly and **verify it at 375 px in a browser rather than
asserting it** — the last two features each turned up a real layout defect that only a
measurement found.

---

## The feature

> "I want an icon in the dashboard that when you click it, it will turn into a popup and ask
> the user how it feels from a range of different emoji."
>
> "A mood isn't a habit, but its graph can be accessed from the Habits tab."
>
> "Add as well in the popup if the user is satisfied of its day."

### Already settled — do not re-litigate these

Four decisions were taken before this document was handed over. Treat them the way you treat
an AD: build to them, and if one of them turns out to be wrong, say so explicitly rather than
quietly working around it.

- **A mood is not a habit.** It gets its own table and its own module. It has no target, no
  period and no notion of "enough", so a streak of feeling would be meaningless.
- **Its history is reached from the Habits tab.** The chart lives there even though the model
  does not. The icon that records a mood stays on the dashboard.
- **The emoji is presentation.** The column holds the fact; the face is how the fact is drawn.
  Restyling the faces later must not rewrite a single stored row.
- **Per-device rendering is a real problem, not a nitpick.** The same codepoint is a different
  drawing on iOS, Android and Windows, and this family shares neither device nor OS. It has to
  be resolved rather than accepted silently.

### Questions to resolve and justify, not merely flag

An answer without a rejected alternative is not an answer.

1. **Where does the module live, and how does the Habits page reach it?** Mood is its own
   module (settled), so it gets its own router, service and models, and imports nothing else's
   (AD-31). Its chart is on the Habits tab (settled), which makes this the **second
   application of AD-37**: the Habits *page* composes the mood module's endpoint, exactly as
   the dashboard page composes the inventory's. Confirm that rather than inventing a seam, and
   say what happens to the Habits tab when the mood endpoint is the one that fails.
   Then say how the page makes clear that a mood is **not** a habit, sitting as it does among
   things that have targets and streaks — a chart dropped between them without a word will be
   read as one.

2. **What does the column actually hold?** The emoji is presentation (settled), so decide the
   fact. How many points on the scale? Ordered or unordered — is 🙂 greater than 😐, and is 😡
   comparable to 😢 at all? Odd (a neutral middle exists) or even (it does not)? If it is
   ordered, say what the ordering licenses: an average over a week is a very different claim
   from a count of each face, and one of the two is defensible on a household's data.

3. **Resolve the per-device problem.** Options include a word beside each face, a locally drawn
   SVG set — this codebase already hand-rolls every chart in inline SVG, so the machinery and
   the convention both exist — or an accepted and stated limitation. Pick one, say what it
   costs, and say what happens to a face nobody can name.

4. **"Satisfied with your day" is a second question, not a second copy of the first.** Prove
   they are orthogonal before storing both: tired but productive is a real evening, and so is
   cheerful but wasted. If you cannot separate them, one of the two should not exist. If you
   can, is satisfaction a boolean or the same scale as the mood? Two different shapes in one
   popup is a choice, not an accident.

5. **Satisfaction is retrospective; a mood is not.** At nine in the morning "how do you feel"
   has an answer and "were you satisfied with your day" does not. Say what the popup does about
   that: refuse the second question before some hour, ask it anyway and accept that early
   answers mean something different, or ask both about *yesterday*. An unstated mix is the
   thing to avoid — it makes every figure derived from the field ambiguous.

6. **One a day or many, and how does "did not say" differ from "no"?** A mood changes between
   breakfast and bedtime; a verdict on the day does not. If they share a row, its columns are
   nullable, and a nullable boolean has three states that the UI must not flatten. Habits
   already settled the neighbouring case — the check-in row is deleted rather than left at
   zero, so "no row" is the only way the data says "did not do it". Apply that reasoning or
   defeat it. And note that if the mood is many-per-day while satisfaction is once, they
   cannot share a row at all.

7. **If you store an instant rather than a day, say which day it belongs to.** AD-38 already
   fixed this: a `TIMESTAMPTZ` has no calendar day until one is picked, and the pick is stated
   in the interface rather than left to be discovered.

8. **Can a past answer be changed or deleted?** Habits settled the neighbour: a check-in may be
   recorded for a past day, never for the future. Is rewriting last Tuesday's mood the same act
   as correcting a mistyped amount, or a different one?

9. **The popup.** See the constraint above — there is no modal in this application today.
   Justify the new machinery or replace it with something the codebase already does. If you
   build it: focus trap, Escape, scroll lock, focus restored to the icon on close, `aria-modal`,
   and a decision about 375 px, where a centred dialog and a bottom sheet are different things.
   Say how somebody using a keyboard closes it.

10. **Does it reach the calendar and the digest?** The calendar composes module endpoints and a
    further layer is nearly free (AD-37); `notify.py` sends one digest a day, and habits joined
    it **opt-in, off by default**, because a daily prompt turns an exceptional notification into
    a routine one that people switch off entirely, taking the stock and recurring reminders with
    it (AD-34). Decide both, with the annoyance cost stated.

11. **Is this datum more sensitive than the rest?** It is the first *subjective* record in the
    system and it is health-adjacent; every other table holds what a family spent. Say whether
    it changes anything about CSV export (Epic 16), `pg_dump` backups (AD-28), or the fact that
    whoever operates the instance can read the database. If it changes nothing, say why that is
    defensible rather than assuming it silently.

12. **Correlation is deferred, not refused — so do not build toward it either.** "You spend more
    when you are sad" is the obvious next feature and it is explicitly **not the goal for now**.
    That means two things. Do not build it. And do not shape the schema so that it only makes
    sense as an analytics substrate — store what the person answered, not what a future chart
    would want. Then say, in one paragraph, what a later correlation feature would actually
    need, so the deferral is a decision somebody can pick up rather than a shrug. Note that the
    brief's line has not lapsed: no gamification, no advice, no predictions. A correlation over
    a household's few dozen points would be noise wearing a lab coat, and whoever revisits this
    should have to argue past that rather than around it.

### Propose 2–4 things not asked for

With v1 versus later, and reasons. Candidates, though the list is not a menu: a note beside the
answer; a strip or heat-map of recent days, reusing the habits chart; a mood layer on the
calendar; a "why" tag; a reminder to answer. At least one of your proposals should be something
you **reject on principle** rather than defer — the last two features each turned up one
(marking a day "reviewed" was a stored flag over facts AD-30 forbids), and naming it is more
useful than a longer backlog.

---

## What to hand back

1. **A short brief** — what this is, in the voice of the existing `docs/brief.md`.
2. **Every question above, answered**, each with the trade-off accepted and the alternative
   rejected.
3. **An epic and story breakdown in this repo's existing style**: vertical slices, one
   `Given/When/Then` acceptance block per story, matching the shape of `docs/epics.md` from
   Epic 13 onwards. Add rows to the requirements inventory and to the coverage map.
4. **New architecture decisions (AD-41 onward) only where you extend an existing invariant**,
   written with the rigour of AD-37 to AD-40: what it binds, what it prevents, the rule. Do
   not restate an existing AD, and do not mint one for something a story already says.
5. **The placement answer** — where the icon sits on a dashboard header that already
   carries the section switch, the period chips and the month navigator, and how the
   chart earns its place on the Habits tab without reading as a habit. Verified at 375 px
   in a browser rather than asserted.

## How the work is expected to be done

- Tests are not optional and are not decoration. Backend tests run against **real Postgres**;
  there is no SQLite path, because SQLite has no row-level security and would make every
  isolation assertion meaningless.
- **Make a new test fail before trusting it.** Break the thing it protects; if it stays green
  it is decoration. Say in the commit or the report which mutation turned which test red.
- Figures asserted in tests are worked out by hand first, in a comment, so a wrong join is
  caught by a number rather than by a person months later.
- Comments explain *why*, especially where a simpler-looking alternative is wrong. The
  codebase is written for the person who returns in six months.
- The frontend suite and the backend suite must both stay green — currently 176 and 493.
- Nothing is pushed, published or deployed without explicit approval.
