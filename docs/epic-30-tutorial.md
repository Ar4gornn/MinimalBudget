# Epic 30: Tutorial Onboarding Flow

**Status:** Built 2026-09-20 on `feat/tutorial` (see §11)  
**Priority:** High  
**Scope:** First-time user experience  
**Timeline:** 1 sprint  

---

## 1. PRD (Product Requirements)

### Goal
Guide new users through Everything Everywhere core features on first login. Get them to "add an entry and see it tracked" within 2 minutes.

### Success Criteria
- Shown once per new account, on first login
- Skippable at any point (no re-nag)
- Covers: entry creation, viewing history, budget viewing, progress visualization
- Does not interrupt existing users (only runs on account creation or first session)
- Dismissible; a help link in Settings lets them re-run it

### Out of Scope
- Habits, Recipes, Inventory, Gym tabs (those are beyond MVP)
- Deep feature exploration (this is a fast ramp, not a comprehensive guide)
- Customization options within the tutorial
- Mobile-only or responsive variants (same UX across 375px and desktop)

### User Stories (locked from scoping)
1. First login shows a modal overlay with step 1
2. User completes a guided entry (with hints)
3. User views their entry in the list (history proved)
4. User sees budget progress feedback (what the app is for)
5. User can skip at any time

---

## 2. Architecture

### Data Model
- **New field on users:** `tutorial_completed` (boolean, default false)
- **New field on users:** `tutorial_skipped_at` (timestamp, optional; marks when they skipped)
- No database changes; persists in the session.

### UI Components

#### `TutorialModal.tsx` (new)
- Renders a centered modal with a semi-transparent overlay
- Step state managed in local React state
- Four steps + completion screen
- Styling: use existing Popover backdrop + card design from Budget cards

#### `TutorialStep.tsx` (internal)
Reusable step frame:
- Header (step N of 5)
- Body (instruction text)
- CTA button (Next, Skip, Done)
- Keyboard support: Escape = skip, Enter = advance

#### `useTutorial.ts` (hook, new)
- `shouldShowTutorial()` → true if `!tutorial_completed && currentUser.just_created`
- `markTutorialCompleted()` → PATCH `/api/users/me` with `tutorial_completed=true`
- `skipTutorial()` → same endpoint, sets `tutorial_skipped_at`

### Flow
1. On app init, check `useTutorial.shouldShowTutorial()`
2. If true, render `<TutorialOverlay>` wrapping the main app (dimmed, with modal on top)
3. Step 1: "Welcome — let's get you set up. Ready?" (intro, no action)
4. Step 2: "Create your first entry" (guide them to press the FAB, highlight it, then show the form)
5. Step 3: "Your entry is saved. View it in the Entries list." (guide to Entries tab)
6. Step 4: "Set a monthly budget to track your spending." (guide to Settings → Budget, show the field)
7. Step 5: "See how you're tracking on the Dashboard." (show progress card with a highlight)
8. Completion: "You're all set! Explore on your own." → Dismiss button → mark tutorial complete

### Interaction Details
- User can skip from any step (Escape key or Skip button)
- Step 2 allows the user to create a real entry; then advances automatically on success
- Step 3 shows the Entries tab opening as a side effect
- Step 4 navigates to Settings, then highlights the budget field
- Step 5 returns to Dashboard and highlights the progress card
- Each step has a "Next" button and a "Skip" option

### Accessibility
- Modal is role="dialog", aria-modal="true"
- Steps are labeled with aria-live="polite" for screen readers
- Keyboard navigation: Tab through buttons, Escape to close
- Don't trap focus (let Escape exit, not modal-trap)

---

## 3. Stories (Sharded for Dev)

### Story 3.1: Core Hook & Data Layer
**Accepts:** User API supports `tutorial_completed` field  
**Delivers:**
- `useTutorial()` hook with `shouldShowTutorial()`, `markComplete()`, `skipTutorial()`
- Backend PATCH `/api/users/me` accepts and persists `tutorial_completed` and `tutorial_skipped_at`
- Tests: verify hook calls the API correctly, handles errors, caches result
- Tests: verify new user account has `tutorial_completed=false` at creation

**Dev Notes:** Use existing `useApiClient` and the users endpoint. Add the two fields to the User schema in `backend/schemas.py`.

---

### Story 3.2: TutorialModal Component & Overlay
**Accepts:** useTutorial hook works; user sees the modal on first login  
**Delivers:**
- `<TutorialModal>` with 5 steps + completion screen
- `<TutorialOverlay>` wraps the app with darkened background when modal is active
- Step navigation: Next, Skip, completion (Done) buttons all work
- Escape key closes and marks as skipped
- RTL tests: render each step, click buttons, verify navigation
- Styling matches existing card/popover design (use tailwind theme colors)

**Dev Notes:** Modal lives in `frontend/src/components/Tutorial/` folder. No icons or complex imagery; text-only for now. Use existing `Button`, `Card` components.

---

### Story 3.3: Step 2 — Entry Creation Integration
**Accepts:** Modal renders, Entry creation works  
**Delivers:**
- Step 2 highlights the FAB and opens the entry form
- Form is shown with a tooltip: "Enter an amount, category, and date"
- On successful submit, the form closes and step advances automatically
- If user cancels the form, step 2 stays (they can try again or skip)
- Tests: render step 2, submit a form, verify auto-advance; cancel form, verify step stays

**Dev Notes:** Reuse the existing `EntryForm` component. Add a "tutorial hint" mode that shows extra tooltips.

---

### Story 3.4: Step 3 — History View
**Accepts:** Entry created in step 2  
**Delivers:**
- Step 3 shows with the Entries tab highlighted
- The new entry from step 2 is visible in the list
- Button to close tutorial and explore on their own
- Tests: create entry, advance to step 3, verify entry is in the list

**Dev Notes:** No new code; just navigate to `/entries` and highlight the tab. The entry is already there from step 2.

---

### Story 3.5: Step 4 — Budget Setup
**Accepts:** Navigation works  
**Delivers:**
- Step 4 highlights the Settings button (or navigates to Settings)
- Highlights the Budget field with a tooltip: "Set a monthly limit to track spending"
- User can type a budget value or skip to next step
- Tests: navigate to step 4, verify Settings tab is shown/highlighted, budget field is visible

**Dev Notes:** Navigate to `/settings`. Highlight the budget amount field. No form submission required; user just sees it.

---

### Story 3.6: Step 5 — Progress Card & Completion
**Accepts:** Steps 1–4 complete  
**Delivers:**
- Step 5 returns to Dashboard
- Highlights the progress card with the text: "This shows how much you've spent vs. your budget"
- Done button marks tutorial complete and closes the modal
- If user skipped at any point, mark `tutorial_skipped_at` instead
- Tests: complete all steps, verify tutorial marked complete; skip at step 3, verify skipped_at is set

**Dev Notes:** No new components. Highlight existing progress card on Dashboard. Call `markTutorialCompleted()` on Done.

---

### Story 3.7: QA & Integration
**Accepts:** All steps work; user sees tutorial on first login  
**Delivers:**
- End-to-end test: new account created, sign in, tutorial shows, complete all steps, close, verify `tutorial_completed=true`
- Test: skip at step 2, verify modal closes and `tutorial_skipped_at` is set
- Test: sign in again as the same user, verify tutorial does NOT show
- Cross-browser: desktop and mobile (375px) viewport
- Performance: no jank, modal appears within 500ms of app load
- Accessibility: keyboard navigation works, screen reader announces steps

**Dev Notes:** Use existing test fixtures. Add a "clear tutorial" button to dev Settings for testing. No API mocking; run against real test user.

---

## 4. Acceptance Criteria (Epic Level)

- [ ] `tutorial_completed` field persists and prevents re-show
- [ ] Modal displays on first login only
- [ ] User can skip at any time
- [ ] All 5 steps navigate correctly and highlight/guide the user
- [ ] No errors in browser console
- [ ] Mobile and desktop layouts both work
- [ ] Tutorial can be re-triggered from Settings (for testing / re-onboarding)
- [ ] New user accounts show `tutorial_completed=false` at signup

---

## 5. Dependencies & Constraints

- Requires: User sign-up flow already working (Epic 1)
- Requires: Entry creation form exists (Dashboard, Entries tab)
- Requires: Settings page exists with budget field
- Blocks: None (feature is independent)
- Database: No migrations; just add two new optional fields to the users table
- API: One new PATCH endpoint or reuse existing users/me endpoint

---

## 6. Design Notes

### Style
- Modal: center of screen, 500px wide max, rounded corners, drop shadow
- Text: clear, friendly, instructional tone
- Button styling: use existing primary/secondary button colors
- Overlay: semi-transparent dark (rgba(0,0,0,0.5)) to dim the background

### Tone
Target: encouraging, simple, no jargon
- "Let's add your first expense"
- "Track your spending over time"
- "You're ready to go!"

### Iteration Notes (Future)
- Could add GIFs or illustrations in a later pass
- Could record video walkthrough for YouTube
- Could detect if the user abandons the tutorial early and surface help UI

---

## 7. Estimation & Schedule

| Story | Effort | Dev Days |
|---|---|---|
| 3.1 Hook & API | M | 1 |
| 3.2 Modal UI | M | 1 |
| 3.3 Entry Integration | S | 0.5 |
| 3.4 History View | S | 0.25 |
| 3.5 Budget Setup | S | 0.25 |
| 3.6 Progress & Completion | S | 0.5 |
| 3.7 QA & Integration | L | 1.5 |
| **Total** | | **5** |

**Timeline:** 1 week (5 dev days)

---

## 8. Testing Strategy (from TEA Module)

### Unit Tests
- `useTutorial` hook: initialization, state transitions, API calls
- `TutorialStep` component: render each step, button clicks, props
- Modal: open/close, overlay visibility, keyboard handling

### Integration Tests
- New user account → sees tutorial → completes steps → marked complete
- Skip at various steps → `tutorial_skipped_at` recorded
- Existing user (already completed) → sign in → no tutorial shown
- Form submission in step 2 → entry created → advances

### E2E Tests (Playwright or Cypress)
- Create account, sign in, tutorial visible
- Click through all steps
- Verify entry in history, budget in settings, progress on dashboard
- Close tutorial, sign out, sign in again → no tutorial shown

### Performance Tests
- Modal loads within 500ms
- No layout shift on modal open
- No unnecessary re-renders of main app during tutorial

### Accessibility Checklist
- [ ] Modal is keyboard navigable (Tab, Escape)
- [ ] Screen reader announces each step
- [ ] Color contrast on text and buttons meets WCAG AA
- [ ] No focus traps

---

## 9. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| User skips tutorial before completing, feels lost | Medium | Medium | Offer "Help" link in Settings to re-run; show gentle contextual hints in the app |
| Tutorial doesn't fit all screen sizes | Low | High | Test at 375px, 768px, 1920px viewports during story 3.2 |
| Entry form submission fails in step 2 | Low | High | Add fallback: "You can create entries manually too" message if form errors; auto-advance anyway |
| New user never sees the tutorial (flag not set) | Low | High | Verify in QA story that `tutorial_completed` is correctly initialized |

---

## 10. Success Metrics (Post-Launch)

Track via analytics or logging:
- % of new users who see the tutorial
- % who complete it vs. skip it
- Avg time spent in tutorial
- Did completing the tutorial correlate with more entries created in the first week?

---

## Appendix: API Changes

### PATCH `/api/users/me`
Add support for:
```json
{
  "tutorial_completed": true,
  "tutorial_skipped_at": "2026-09-20T15:30:00Z"  // optional
}
```

### User Schema (backend/schemas.py)
```python
class UserUpdate(BaseModel):
    ...
    tutorial_completed: Optional[bool] = None
    tutorial_skipped_at: Optional[datetime] = None
```

### User DB Model (backend/models.py)
```python
class User(Base):
    ...
    tutorial_completed: bool = Column(Boolean, default=False)
    tutorial_skipped_at: datetime = Column(DateTime, nullable=True)
```

---

**Next Step:** Hand this to `bmad-agent-dev` or dev team to execute stories 3.1–3.7 in order.

---

## 11. Build notes (2026-09-20)

What was built differs from §2 and the appendix where the spec was written against files
this codebase does not have. The *behaviour* in §1 and §4 is what was delivered; the
mechanics were adapted to the repo. Recorded here so the next reader does not hunt for
`backend/schemas.py` or a tailwind theme.

**Data and API.**
- Two columns on `users` by migration **0022**, not "no database changes": a column is a
  migration. `tutorial_completed boolean NOT NULL DEFAULT false`, `tutorial_skipped_at
  timestamptz NULL`, both granted to the runtime role column by column (AD-19).
- **Existing accounts are marked completed by the migration.** The default is what new
  rows get; a household that has been recording entries for a year is not new, and a
  welcome screen on its next sign-in is an interruption. This is how "does not interrupt
  existing users" is actually enforced — there is no `just_created` field.
- Endpoint is `PATCH /api/auth/me/tutorial` with `{"outcome": "completed" | "skipped"}`,
  matching the one-setting-per-route shape of `me/language`, `me/currency` and the
  rest; there is no `/api/users/me`. The client never sends a timestamp — the server
  stamps `now()`, like every other `*_at`. Idempotent, so a replay from Settings is a 200.
- Both fields are on `UserOut` / the client's `User`. The client only opens the tour when
  `tutorial_completed === false && tutorial_skipped_at === null` — strict, so a server
  older than 0022 (neither field) reads as "seen", never as "new".

**UI.**
- Not one modal. The welcome and the closing screen dim the page (`aria-modal`), because
  there is nothing to do behind them. Steps 2–5 are a **corner panel with no backdrop**:
  each asks the person to use a real control on a real page, and a backdrop that blocked
  clicks would block the thing the step is for. The control is ringed by CSS keyed off
  `body[data-tour-step]` + the page's `data-tour` tag, so it survives the page mounting
  late, and scrolled to the top of the viewport (the panel owns the bottom on a phone —
  centring put the target behind it; measured at 375 and 320).
- **Step 4 is the Plan page, not Settings.** Monthly budgets live at `/plan` per category
  (AD-11); Settings has no budget field. Step 5 rings the dashboard's "Budget vs actual"
  card.
- Step 2 sends the person to `/entries?add=1` (the quick-add arrival that focuses the
  amount) on every screen size; the FAB itself is phone-only. `EntriesPage` reports a
  successful save to the tour, which advances only if it is on that step. There is no
  "tutorial hint mode" on the form — the panel names the form's own submit label instead.
- No focus trap, as specified. The two dimmed screens focus their primary button so Enter
  and Escape work at once; the panel steps leave focus where the page put it. Escape on
  the dialog skips; Enter advances when focus is not already on a button.
- Replay: a **Help** card in Settings with "Show the tour again". It opens the tour
  client-side; nothing is cleared on the server. No separate dev "clear" button.
- Files: `frontend/src/components/Tutorial/useTutorial.tsx` (provider + hook + step
  table), `TutorialModal.tsx`, `Tutorial.test.tsx`; messages in
  `i18n/messages/tour.ts` (both languages, per Epic 25). Provider is mounted inside
  `App` so every test that mounts `<App />` gets it; pages outside a provider get an
  inert one.

**Tests.** 8 backend (`tests/test_tutorial.py`), 10 frontend through the real App and
pages. Three guards were mutation-tested: the strict field check, the `notify` call in
`EntriesPage`, and the once-per-session guard — each mutation turned exactly the test
that claims to hold it red. The first version of the "does not open" tests stayed green
under mutation (the effect had not flushed yet); they now wait 300ms for a dialog and
insist there is none.

**Not done, deliberately.** Playwright/Cypress E2E, performance timing, and analytics
(§8, §10): none exists in this repo and the epic is not the place to introduce them.
The two-language, two-width check was done in the built app against a throwaway DB.
