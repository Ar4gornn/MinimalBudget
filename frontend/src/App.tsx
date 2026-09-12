import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { useT } from "./i18n";
import { CalendarPage } from "./pages/CalendarPage";
import { CategoryPage } from "./pages/CategoryPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EntriesPage } from "./pages/EntriesPage";
import { HabitsPage } from "./pages/HabitsPage";
import { InventoryPage } from "./pages/InventoryPage";
import { PlanPage } from "./pages/PlanPage";
import { GymPage } from "./pages/GymPage";
import { ProjectionsPage } from "./pages/ProjectionsPage";
import { RecipePage } from "./pages/RecipePage";
import { RecipesPage } from "./pages/RecipesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignInPage } from "./pages/SignInPage";

/**
 * The navigation answer, in full, because it is the constraint two new features collided
 * with rather than a styling preference.
 *
 * The bottom bar holds **five** items at 375px — measured, not guessed — and Grow was
 * already displaced to the top bar to make room for Gym (Epic 19). A calendar and a habits
 * tab would make seven. Both were resolved explicitly:
 *
 * 1. **Habits takes a bottom tab, and Plan moves to the top bar.** The bottom bar is for
 *    what is opened at the moment it is needed. A check-in is a several-times-a-day thumb
 *    action — the highest-frequency tap in the app for anyone who keeps habits — while a
 *    budget is a *standing* monthly amount (AD-11) and a recurring template is edited
 *    perhaps twice a year. Ranking the sections by how often they are opened puts Plan
 *    eighth and Habits third, so Plan is the one that goes up top beside Grow.
 * 2. **The calendar takes no tab at all: it is the Dashboard's second view.** The dashboard
 *    already answers "what happened, and what is due" — in totals. The calendar answers the
 *    same question day by day. They are two views of one section, switched by a control at
 *    the top of the page, and `/calendar` is a real route so it can be linked and shared.
 *    What that costs: the calendar is one tap deeper than a tab would be.
 *
 * 3. **Recipes joins the top bar, and the app's name leaves it on a phone (Epic 27).**
 *    Ranked the same way: a recipe is consulted while cooking and a food is typed once, so
 *    the book sits well below the five thumb tabs. The frequent act in this module is "I
 *    ate this", and that is not a page — it is one control on the recipe and a layer on the
 *    calendar. But a third link did not fit for free. Measured at 375px, the phone bar's
 *    content box is 335px, and in French the three links are 193px ("Budget · Épargne ·
 *    Recettes") against English's 154px — so brand + links + a 44px settings target came to
 *    363 and wrapped to two rows on every French phone, which is the thing item 1's note
 *    refuses. The name is the item a phone needs least: the bottom tab says which section
 *    you are in, the page says what it is, and the installed app's name is on the home
 *    screen. It is now visually hidden at that width — out of flow, still in the
 *    accessibility tree — which leaves French at 245 of 335 and English at 206.
 *
 * Rejected: a sixth tab (does not fit — the labels wrap and the targets fall under 44px);
 * a "More" overflow tab (spends a slot to hide two sections and demotes Gym, which Epic 19
 * deliberately promoted); merging Habits into Gym (one page with two unrelated jobs, and it
 * contradicts the interview that scoped Gym). For Epic 27, also rejected: displacing Stock
 * from the bottom bar — eating is more frequent than checking the pantry, so the ranking
 * argues for it, but Stock is wired to the shopping list Epic 14 built around a thumb tap
 * in a shop; and hanging /recipes off Entries as a second view the way /calendar hangs off
 * Dashboard — an entry is money and a recipe is not, so the two would share a tab and
 * nothing else.
 *
 * Verified at 375px in a browser rather than asserted — and at 320px, and in both
 * languages, because French is the longer one and is where this broke.
 */

/**
 * Reachable from the top bar only. The bottom bar holds the five thumb-reachable ones.
 *
 * `label` is a message key rather than a word: the bar is drawn on every page, so a word
 * baked in here would be the one English string a French reader could never get away from.
 */
const TOP_ONLY = [
  { to: "/plan", label: "nav.plan" },
  { to: "/projections", label: "nav.grow" },
  // Epic 27; the measurement and the rejected alternatives are in the block above.
  { to: "/recipes", label: "nav.recipes" },
] as const;

const SECTIONS = [
  // The Dashboard tab covers both of its views, so the calendar does not look like a place
  // outside the app while you are standing in it.
  { to: "/", label: "nav.dashboard", glyph: "◪", end: true, also: ["/calendar"] },
  { to: "/entries", label: "nav.entries", glyph: "≡", end: false, also: [] as string[] },
  { to: "/habits", label: "nav.habits", glyph: "✓", end: false, also: [] as string[] },
  { to: "/inventory", label: "nav.stock", glyph: "▤", end: false, also: [] as string[] },
  // Gym is a thing you open at the gym, so it keeps its thumb-reachable tab.
  { to: "/gym", label: "nav.gym", glyph: "◈", end: false, also: [] as string[] },
] as const;

export function App() {
  const { user, loading } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Quick add belongs where entries do — and on the calendar, where a day is exactly the
  // thing you would want to record against. On the projections page there is nothing to
  // add, and the button sat on top of a form field.
  const showQuickAdd = pathname === "/" || pathname.startsWith("/entries") ||
    pathname.startsWith("/categories") || pathname.startsWith("/calendar");

  /** A section owns more than its own path when it has two views (Dashboard / Calendar). */
  const extra = (section: (typeof SECTIONS)[number]) =>
    section.also.some((path) => pathname.startsWith(path)) ? "on" : "";

  // Without this the sign-in page flashes on every reload before /me answers.
  if (loading) return <main className="shell" />;
  if (!user) return <SignInPage />;

  return (
    <div className="shell">
      <header className="topbar">
        <h1 className="brand">{t("app.name")}</h1>
        <nav className="nav">
          {SECTIONS.map((section) => (
            <NavLink key={section.to} to={section.to} end={section.end} className={extra(section)}>
              {t(section.label)}
            </NavLink>
          ))}
        </nav>

        {/* Plan and Grow live here rather than in the bottom bar: a standing budget and an
            interest projection are consulted now and then, while the bottom bar is for the
            five things you open at the moment you need them. Its own element, not part of
            .nav, because .nav is hidden on a phone — which would strand both. */}
        <nav className="nav-extra" aria-label={t("nav.more")}>
          {TOP_ONLY.map((section) => (
            <NavLink key={section.to} to={section.to}>
              {t(section.label)}
            </NavLink>
          ))}
        </nav>
        {/* The email is the way into Settings: currency, password, recovery codes and
            sign-out all live there, so the top bar carries one link instead of a button
            for each. Six bottom tabs would not fit a phone; one link here does. */}
        <div className="identity">
          <NavLink to="/settings" aria-label={t("nav.settings")} title={t("nav.settings")}>
            <span className="glyph" aria-hidden="true">
              ⚙
            </span>
            <span className="email">{user.email}</span>
          </NavLink>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/entries" element={<EntriesPage />} />
          <Route path="/categories/:categoryId" element={<CategoryPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/projections" element={<ProjectionsPage />} />
          <Route path="/habits" element={<HabitsPage />} />
          <Route path="/gym" element={<GymPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/recipes" element={<RecipesPage />} />
          <Route path="/recipes/:recipeId" element={<RecipePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Quick add: recording a transaction is the loop people repeat, so on a phone it
          should never cost a navigation to reach. Hidden on desktop, where the entry form
          is already one click away and a floating button would just be clutter. */}
      {showQuickAdd && (
        <button
          type="button"
          className="fab"
          aria-label={t("nav.addEntry")}
          onClick={() => navigate("/entries?add=1")}
        >
          +
        </button>
      )}

      {/* Thumb-reachable navigation. This is the single thing that stops an installed PWA
          feeling like a website in a frameless window. */}
      <nav className="bottom-nav" aria-label={t("nav.sections")}>
        {SECTIONS.map((section) => (
          <NavLink key={section.to} to={section.to} end={section.end} className={extra(section)}>
            <span className="glyph" aria-hidden="true">
              {section.glyph}
            </span>
            {t(section.label)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
