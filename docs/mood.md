# Mood — brief and decision record (Epic 24)

Answers to `docs/prompt-mood-checkin.md`. The epic and its stories live in `docs/epics.md`;
the two new invariants are AD-41 and AD-42 in `docs/architecture.md`. This file is the
argument behind both — every answer with the alternative that was rejected.

---

## Brief

### Problem

MinimalBudget records what a household spends, keeps, owns, lifts and does. It records nothing
about the person doing it. "Was that a bad month or just an expensive one" is a question the
data cannot touch, and the cheapest honest instrument for it is the one every clinic and every
journal already uses: ask, daily, in one tap, and keep the answer.

### Product

Two questions about a day, from the dashboard. **How do you feel** — five drawn faces on one
ordered axis, worst to best. **Was the day any good** — yes or no, asked only in the evening.
Both optional, both changeable, both erasable. The history is a strip of recent days and a
tally of five counts, reached from the Habits tab.

Numbers-first still holds, and so does the brief's line: no gamification, no advice, no
predictions. Nothing here scores a person, and nothing here is averaged.

### Target user

The same one person per account. A household of four on four independent accounts, on four
different phones and three different operating systems — which is why the faces are drawn
rather than typed.

### In scope

- One row per day per account: a five-point mood, a yes/no verdict on the day, an optional note.
- Recording, changing and clearing the day, from a control on the dashboard.
- A backfill: an answer may be recorded for any past day.
- A thirty-day strip and a five-bar tally on the Habits tab.
- A mood layer on the calendar.
- CSV export, on the existing path.

### Out of scope, explicitly

- **A streak, or any "N days in a row" figure.** Rejected on principle, not deferred — see
  *Proposals* below.
- **A correlation with spending.** Deferred, and the schema is deliberately not shaped toward it.
- **Several moods in one day.** A different feature with a different table.
- **A "why" tag list.** Deferred; it is the first thing that turns two taps into a form.
- **A notification.** Decided against, with the reasoning recorded rather than left as a gap.
- **Client-side encryption of the answers.** Decided against for this table specifically, and the
  reason is in question 11 rather than left implicit.

### Constraints

Everything the rest of the system is bound by, unchanged: Postgres row-level security enabled and
forced, composite foreign keys, derived figures computed and never stored, modules independent
and composed at the edge, charts hand-rolled in inline SVG, no modal anywhere.

---

## The questions, answered

### 1. Where does the module live, and how does the Habits page reach it?

`models/mood.py`, `schemas/mood.py`, `services/mood.py`, `api/mood.py`, prefix `/api/mood`. The
service imports its own models and nothing else (AD-31).

The Habits **page** composes `/api/mood/history`. That is confirmed as the **second application
of AD-37**, not a new seam: the dashboard page already composes `/api/inventory/items` beside the
ledger, and a read spanning modules needs no transaction spanning them, so it earns no service.
`services/shopping.py` remains the only cross-module *service*, and it exists because a
cross-module *write* needs both halves in one transaction.

**What happens when the mood endpoint fails:** the mood card shows its own message and the habits
list is untouched. That is not automatic — it is why the mood fetch is a separate effect rather
than a third entry in the habits' `Promise.all`, and a test proves it by 404-ing only the mood
endpoint and asserting the check-in list still renders. Joining the two loads turns that test red.
A fixed path cannot 404 for want of rows, so the message says the API is probably older than the
page, the same wording the habits load already uses.

**How the page says it is not a habit:** the card is last, under its own heading, and the first
line reads *"Not a habit: there is no target here, nothing to be enough of, and nothing to keep a
streak of."* It has no plus/minus row, no "n of m", no streak. Placement alone would not do it —
a chart between two things that have targets is read as a third.

*Rejected:* a `services/mood_habits.py`, or teaching the habits service to read mood. Both would
end the property that there is exactly one named place where modules touch.

### 2. What does the column actually hold?

`mood SMALLINT`, **1 to 5**, **ordered**, on **one axis**: how good you feel, worst to best.

- **Ordered**, so 4 > 3 is a true sentence and the strip can be read as a shape.
- **One axis**, which is why 😡 and 😢 are not on it. Angry and sad are not more or less than each
  other, and a scale that pretended otherwise would be lying in its own units.
- **Odd, so a neutral middle exists.** Forced-choice even scales are a survey device for pulling
  signal out of respondents who do not care; the respondent here is the only person who will ever
  read the result, and "fine, nothing to report" is the most common truthful answer anyone has
  about a day. Removing it would make the data worse.

**What the ordering licenses:** a count per point, and a per-day strip. It does **not** license an
average. A five-point scale is *ordinal* — the distance from 2 to 3 is not the distance from 4 to
5 — so a mean over it is arithmetic on labels, and "your week was 3.4" is a number nobody chose
and nothing can check. Five counts and a denominator of *days answered* say everything the data
supports. This is the same reasoning as AD-29's refusal to store a unit price: state the fact,
derive only what the fact can carry.

*Rejected:* an unordered set of named emotions (happy/sad/angry/tired). It is the honest shape for
emotions that are not comparable — and it was rejected because its only summary is a per-name
tally, the names would change the first time anybody restyled them, and a household produces a few
dozen points a month, which is too few for a per-name tally to say anything. Also rejected: a
0–10 slider, which asks for a precision nobody has about a day.

### 3. The per-device problem

**Solved by drawing the faces here**, in inline SVG, in `components/MoodFace.tsx` — the same
machinery and the same convention as every chart in this repository. Five faces, one monotone
mouth curve from a deep frown to a wide smile, plus a dashed outline for "not answered yet".

**Every face ships with its word.** `Bad · Low · Fine · Good · Great`. The SVG is `aria-hidden`
and the word is real text, so the word *is* the accessible name — which is the whole answer to
*what happens to a face nobody can name*: nothing, because no face is ever shipped alone. It is
speakable, searchable, and readable by a screen reader; a test asserts all five buttons are
findable by their word, which fails the moment a face loses one.

**Cost:** five small drawings that have to stay legible at 26px, and they are less expressive than
a real emoji set. Accepted.

*Rejected:* native emoji codepoints — the same codepoint is a different drawing on iOS, Android
and Windows, and this family shares neither, so two people picking "the flat-mouthed one" would
store different numbers. Also rejected: shipping an emoji font, which would be the first binary
asset in the repository, megabytes of it, and would not fix the picker in anyone's OS keyboard.
Written up as **AD-42**.

### 4. Is "satisfied with your day" a second question?

**Yes, and they are orthogonal.** The proof is that both off-diagonal evenings are real and
storable: *tired but productive* is `(2, true)`, *cheerful but wasted* is `(4, false)`. A test
records both; if the two were names for one thing, one of those rows could not exist.

**Satisfaction is a boolean, not a second five-point scale.** Two identical scales side by side
invite the reader to treat the pair as one two-dimensional score and average it, which is the
failure AD-41 exists to prevent — and the question genuinely has a yes/no answer in the way the
first one does not. Two different shapes in one panel is therefore the choice, and the panel
draws them differently on purpose: five faces, then two chips.

**Cost:** a boolean cannot say "mostly". Accepted — the graded axis is the mood, and the day's
verdict is the thing a person can actually answer in one tap on the way to bed.

### 5. Satisfaction is retrospective; a mood is not

**The verdict is not asked before 18:00 local.** Not disabled — *not rendered*. No control means
no early answer can exist, so every stored verdict means the same thing: a judgement of a day that
had mostly happened. A disabled button would still advertise the question and invite a guess about
what it will mean later.

**It is a rule of the interface, not of the API**, and that is stated rather than left to be
discovered. An hour rule in the service would need a per-account time zone this system does not
have — AD-38 already names that limitation and picks UTC for the one place it matters — and it
would refuse a legitimate late-night answer from a family member in another country. So the server
accepts a verdict for any past day and the interface is what makes it consistently an evening
answer. A past day is always askable: a finished day is finished at any hour.

*Rejected:* asking both questions about **yesterday**, which would make "how do you feel" —
the one question that has an answer right now — impossible to record when you notice it. Also
rejected: asking anyway and accepting that early answers mean something different, which is
precisely the unstated mix that makes every figure over the field ambiguous.

### 6. One a day or many, and how "did not say" differs from "no"

**One row per day, carrying both answers, re-answerable.** `UNIQUE (user_id, on_day)`.

- **Not many per day.** The chart the request asks for is a chart over days, so a many-per-day
  model makes every point on it an aggregate — a mean (refused in question 2) or an arbitrary
  pick. The habits precedent is exactly this: one row per `(habit, day)` carrying a count, not one
  row per tap, because a per-tap row makes correction ambiguous.
- **They share a row** because both are once-a-day. Question 6's own warning applies only if the
  mood were many-per-day and the verdict once — it is not.
- **Both columns nullable, with `CHECK (mood IS NOT NULL OR day_ok IS NOT NULL)`**, so a row
  always says something.
- **Three states, never flattened.** `true`, `false`, and *no answer*. The panel leaves both chips
  unpressed when nobody has said; the SQL counts with `FILTER (WHERE day_ok)` and
  `FILTER (WHERE NOT day_ok)`, which both exclude a null; the calendar says nothing at all about a
  day nobody judged. A test pins this, and writing the filter as `day_ok IS NOT TRUE` turns it red
  — that mutation reported an unanswered day as a bad one.
- **Clearing the last answer deletes the row**, applying the habits rule rather than defeating it:
  "no row" is the only way the data says *did not say*, so no `LEFT JOIN` ever has to know that a
  blank row and a missing row mean the same thing. A note alone is therefore not an answer.

**Cost:** the intraday shape is lost — "fine at nine, awful at six" is not recordable. Accepted,
and the deferral is written down as a *different feature*: a second table for an intraday log, with
this row remaining the person's answer about the day rather than becoming an aggregate of the log.

### 7. An instant, or a day?

**A day.** `on_day DATE`, chosen by the person, defaulting to today, placed unconverted — the
first half of AD-38. `created_at` and `updated_at` are audit stamps and no figure is ever bucketed
by them, so AD-38's UTC-placement half does not arise here. Said out loud rather than left for a
reader to discover, and recorded in the migration so nobody adds a timestamp-derived chart later
without noticing.

### 8. Can a past answer be changed or deleted?

**Yes, freely, for any past day; never for the future.** The future rule is enforced in the service,
because `CHECK (on_day <= current_date)` is refused by Postgres — `current_date` is not IMMUTABLE,
the same wall `habit_checkins.done_on` hit. Unlike a check-in there is **no lower bound**: a habit
has a `started_on`, a mood has no plan behind it, so writing down how a day last March felt is a
backfill rather than an error. The only floor is the schema's sanity `DATE '2000-01-01'`, guarded
in the service too so a hand-typed year answers 422 rather than 500.

**Is rewriting last Tuesday's mood the same act as correcting a mistyped amount?** No, and it is
worth the sentence. An amount has an external referent — the receipt — so an edit moves the row
toward a truth that exists outside it. A mood has no referent but the person's memory, so a later
answer is not a correction, it is a **second answer** from someone who now remembers the day
differently. The system cannot tell the two apart and does not pretend to: it keeps the latest.

**Cost:** you cannot ask "was this revised", and a chart cannot tell a same-day answer from one
backfilled a month later. The partial answer already present is `created_at` versus `updated_at`.
Accepted, because the alternative is an append-only answer log plus a rule about which of two
answers is *the* day's mood — an ambiguity nothing in the product needs. Recorded so somebody can
pick it up rather than rediscover it.

### 9. The popup

**Not a modal.** Verified rather than assumed: this application has zero `role="dialog"`, zero
`<dialog>`, zero `showModal`, one `window.confirm` and one overlay — the toast, which is
`role="status"` and never takes focus. `EntriesPage` records why it edits inline instead.

**What ships is an anchored popover**: the disclosure this codebase already uses — a real button
carrying `aria-expanded` and `aria-controls`, the same shape as `Card`'s collapse toggle —
positioned under its trigger. It sits immediately after the button in document order, so a
keyboard or screen-reader user reaches it by carrying on rather than by being moved into it.

**How somebody using a keyboard closes it:** Escape, from anywhere on the page, and focus returns
to the trigger. Or Tab to the panel's own Close button. A pointer tap outside also closes it. None
of that needs a focus trap, and there is no backdrop to make the rest of the page inert. A test
asserts Escape closes it *and* that focus is back on the button, and a second test asserts there is
no `dialog` role and no `aria-modal` — the test to rewrite, rather than delete, if a real dialog is
ever argued for.

**At 375px it is the same panel as on a desktop**, not a bottom sheet. That is the whole trade: one
behaviour at every width instead of two designs with a breakpoint between them.

**Cost, stated plainly:** the page behind stays scrollable and clickable, so the panel can be
scrolled off screen; nothing announces "you are inside a thing you must leave"; and it wins no
thumb-reach that a bottom sheet would.

*Rejected:* a real dialog. It would mean a focus trap, scroll locking, `aria-modal`, an inert
background and a 375px fork — a component and a maintenance burden for a control whose whole job is
two taps, in an application that has managed without one for twenty-three epics. Recorded as a
Consistency Convention ("Disclosure, not dialog") rather than an AD, because it is a UI rule and
the spine holds data invariants.

### 10. The calendar and the digest

**Calendar: yes.** A mood is a dated fact a person wrote down, which is exactly what that page
shows, and the layer machinery already exists — a key, a bucket, a chip, a dot, a row in the day
panel. It is one more endpoint composed at the edge and no new machinery (AD-37). Cost: one more
toggle in a chip row that now holds seven, and one more possible dot on a 43px phone cell — which
is why the cell draws a dot rather than a face, and the day panel draws the face.

**Digest: no, decided rather than skipped.** The digest fires when something is **exceptional** —
stock is out, an entry is waiting. "You have not said how you feel today" is true every day by
construction, which is precisely the failure Epic 23 named when it made habit reminders off by
default. Worse here: a nightly notification from a budgeting app asking about your feelings is the
one that gets the whole digest switched off, taking the stock and recurring reminders with it.
Habits could opt in because a habit is a commitment the person made; a mood is not a commitment.

**Annoyance cost of the refusal:** somebody who wants a nightly prompt has to open the app.
Accepted. If anyone insists, the shape is one `users` column and one clause in `Digest.body` — one
sentence of work, so the decision can be revisited without being rediscovered.

### 11. Is this datum more sensitive than the rest?

**Yes, in kind.** It is the first subjective, health-adjacent record here; every other table holds
what a family spent or owns. What that changes:

- **Isolation, grants, foreign keys: nothing changes.** The machinery is already the strongest
  thing this project has and it is uniform — RLS enabled and forced, a policy per role, a two-user
  proof executed as the runtime role. Making one table special would be a claim that the others are
  less protected, which is not true.
- **No per-column encryption**, and the reason is not laziness. A key the server holds is no
  protection from whoever operates the server; a key the server does not hold makes the column
  unreadable by the export and the chart, and needs a passphrase flow, a recovery story and a
  threat model this application does not have. That is the same argument the password-wallet idea
  runs into, and it is a design decision to be taken deliberately rather than a feature to be
  slotted in.
- **CSV export: yes, it is exported**, in its own file, on Epic 16's existing streaming and
  formula-neutralising path. Epic 16's whole point is that the data can leave; a category that
  could not leave would be a lock-in this project already rejected. "It is sensitive" is an
  argument for the person having their own copy, not against.
- **`pg_dump` and AD-28: unchanged, and the plain fact is worth writing down.** Whoever operates
  the instance can read every mood row, exactly as they can read every amount. Why that is
  defensible here rather than merely assumed: the instance is invite-only, single-household, and
  the operator is a member of it. It would **not** be defensible on a shared or hosted instance,
  and that is the line to re-examine if this is ever deployed for anyone outside the family.
- **Logging: unchanged and reaffirmed.** The existing convention already forbids logging a request
  body; nothing here needs an exception, and nothing here gets one.

### 12. Correlation is deferred, not refused — and not built toward

**Not built.** And the schema is not shaped as an analytics substrate: it holds one row per day
with the two answers a person gave, which is exactly the shape it would have if no chart existed.
There is no denormalised join key, no pre-bucketed month, no numeric "score".

**What a later correlation feature would actually need**, so the deferral is something somebody can
pick up: it is a *page*, not a service — AD-31 forbids the join inside a service and AD-37 routes a
cross-module read to the edge — reading `/api/mood/history` and `/api/dashboard/trends` and drawing
two series on one time axis, with no server-side statistic at all. To say anything stronger than
"here are two lines" it would need three things it does not have. Enough paired points that a
coefficient is not noise: a household produces a few dozen a month, at which size a correlation's
confidence interval comfortably contains zero for any effect this would find. A hypothesis fixed
before looking, or it is a search across however many categories the account happens to have. And a
decision about dating, since an expense is dated by `occurred_on` — a day the person chose, often
typed days later — while a mood is dated by the day it is about.

**The brief's line has not lapsed: no gamification, no advice, no predictions.** Two lines on one
axis is a picture. "You spend more when you are sad" is a claim, and a household's few dozen points
cannot carry it. Whoever revisits this should have to argue past that rather than around it.

---

## Proposals — things not asked for

**1. A note beside the answer. — v1, shipped.** One nullable column and one optional input, and it
is the only thing that makes a past point legible: a `2` with no context is unreadable a month
later, and the note is what turns the strip's tooltip into a sentence. It is disabled until one of
the questions is answered, because a note is not an answer and the schema refuses a row that only
carries one.

**2. A thirty-day strip and a five-bar tally. — v1, shipped.** The request asked for a graph; the
part that was not asked for is the *shape*. It is a **strip**, days left to right, not the habit
heat-map's Monday-aligned week grid — a heat-map's columns exist so "only at weekends" is visible,
which is a question about an act, while a mood is read as a trend. And the summary is five counts
rather than a line through the points, because a line implies an interval scale this is not.

**3. A mood layer on the calendar. — v1, shipped.** Nearly free (AD-37), and a dated fact belongs
on the page that exists to show dated facts. Cost: one more chip in a row of seven and one more
possible dot in a 43px cell.

**4. A mood streak. — REJECTED ON PRINCIPLE, not deferred.** "You have logged 7 days in a row", or
any figure that rewards the act of answering. The brief says no gamification, and a streak over a
*feeling* is worse than gamification: it rewards answering rather than answering honestly, and the
cheapest way to keep one is to tap the same face every night — which corrupts the only data this
feature has. Habits earn a streak because what is counted is an act somebody chose to do (AD-40); a
mood is not an act. Named here because it is the obvious symmetry with the card sitting directly
above it, and somebody will propose it.

**5. A "why" tag list** (work, sleep, people, health). **Deferred, not refused.** It is the first
thing that turns a two-tap answer into a form, and a fixed tag list is itself a claim about what
makes people feel things. Its own decision, on the AD-12 reference-data pattern, if anyone misses it.

---

## The placement answer

**Where the icon sits.** At the **start of the dashboard's title line**, before the heading.

The header's right-hand cluster already carries three groups — the Summary/Calendar switch, the
Month/Year/All time chips, and the month navigator — and it is the half that wraps at 375px. The
left half is one line of text with room beside it at every width. So the control goes left.

**Measured at 375px in a browser, not asserted:**

| | |
| --- | --- |
| Viewport | 375 × 812, no horizontal overflow |
| Trigger | 40 × 40, at x = 20 — the shell's left padding |
| Right-hand cluster | already on its own row **before** this change (y = 136) and after it (y = 152) |
| Cost of the control | 16px of height on the left block. **No new wrapping.** |
| Panel | x = 20 → 340, inside the 375 viewport, page `scrollWidth` still 375 |
| Face targets | 56 × 57 each |
| Verdict chips | 40px tall, matching the habit stepper Epic 23 settled on |
| Desktop (1280) | title and control cluster on one row, panel 320px wide, no overflow |

**The defect the measurement found.** The button was first placed *after* the heading. The popover
is anchored to it, and the heading is a month name — "September 2026" is about 115px wider than
"2026" — so the anchor moves with the calendar. At 375px in September the panel ran from x = 153 to
x = 473: 98px off the right edge, with a horizontal scrollbar on the page. Putting the button first
pins the anchor to the shell's left padding whatever the month is called. No width would have been
safe with the button second, which is exactly the class of thing that only a measurement finds.

**How the chart earns its place on the Habits tab.** It is the last card, under its own heading,
and its first line says what it is not: *"Not a habit: there is no target here, nothing to be
enough of, and nothing to keep a streak of. Recorded from the dashboard."* It has no stepper, no
"n of m this week", no streak — different controls and different words from every row above it.
And it is loaded on its own request, so the two modules stay two modules where it matters: when the
mood endpoint fails, the check-in list this page exists for is untouched.
