import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { CategoryPage } from "./pages/CategoryPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EntriesPage } from "./pages/EntriesPage";
import { InventoryPage } from "./pages/InventoryPage";
import { PlanPage } from "./pages/PlanPage";
import { GymPage } from "./pages/GymPage";
import { ProjectionsPage } from "./pages/ProjectionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignInPage } from "./pages/SignInPage";

/** Reachable from the top bar only; the bottom bar holds the five thumb-reachable ones. */
const TOP_ONLY = [{ to: "/projections", label: "Grow" }];

const SECTIONS = [
  { to: "/", label: "Dashboard", glyph: "◪", end: true },
  { to: "/entries", label: "Entries", glyph: "≡", end: false },
  { to: "/plan", label: "Plan", glyph: "◎", end: false },
  { to: "/inventory", label: "Stock", glyph: "▤", end: false },
  // Gym is a thing you open at the gym, so it earns a thumb-reachable tab. Grow is a thing
  // you consult occasionally, so it moved to the top bar — six tabs do not fit 375px.
  { to: "/gym", label: "Gym", glyph: "◈", end: false },
];

export function App() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Quick add belongs where entries do. On the projections page there is nothing to add,
  // and the button sat on top of a form field.
  const showQuickAdd = pathname === "/" || pathname.startsWith("/entries") ||
    pathname.startsWith("/categories");

  // Without this the sign-in page flashes on every reload before /me answers.
  if (loading) return <main className="shell" />;
  if (!user) return <SignInPage />;

  return (
    <div className="shell">
      <header className="topbar">
        <h1 className="brand">MinimalBudget</h1>
        <nav className="nav">
          {SECTIONS.map((section) => (
            <NavLink key={section.to} to={section.to} end={section.end}>
              {section.label}
            </NavLink>
          ))}
        </nav>

        {/* Grow lives here rather than in the bottom bar: interest projections are a thing
            you consult now and then, and the bottom bar is for the five things you open at
            the moment you need them. Its own element, not part of .nav, because .nav is
            hidden on a phone — which would leave Grow unreachable there. */}
        <nav className="nav-extra" aria-label="More">
          {TOP_ONLY.map((section) => (
            <NavLink key={section.to} to={section.to}>
              {section.label}
            </NavLink>
          ))}
        </nav>
        {/* The email is the way into Settings: currency, password, recovery codes and
            sign-out all live there, so the top bar carries one link instead of a button
            for each. Six bottom tabs would not fit a phone; one link here does. */}
        <div className="identity">
          <NavLink to="/settings" aria-label="Settings" title="Settings">
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
          <Route path="/entries" element={<EntriesPage />} />
          <Route path="/categories/:categoryId" element={<CategoryPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/projections" element={<ProjectionsPage />} />
          <Route path="/gym" element={<GymPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
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
          aria-label="Add an entry"
          onClick={() => navigate("/entries?add=1")}
        >
          +
        </button>
      )}

      {/* Thumb-reachable navigation. This is the single thing that stops an installed PWA
          feeling like a website in a frameless window. */}
      <nav className="bottom-nav" aria-label="Sections">
        {SECTIONS.map((section) => (
          <NavLink key={section.to} to={section.to} end={section.end}>
            <span className="glyph" aria-hidden="true">
              {section.glyph}
            </span>
            {section.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
