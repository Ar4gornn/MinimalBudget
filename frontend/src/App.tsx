import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { DashboardPage } from "./pages/DashboardPage";
import { EntriesPage } from "./pages/EntriesPage";
import { PlanPage } from "./pages/PlanPage";
import { SignInPage } from "./pages/SignInPage";

export function App() {
  const { user, loading, signOut } = useAuth();

  // Without this the sign-in page flashes on every reload before /me answers.
  if (loading) return <main className="shell" />;
  if (!user) return <SignInPage />;

  return (
    <div className="shell">
      <header className="topbar">
        <h1 className="brand">MinimalBudget</h1>
        <nav className="nav">
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/entries">Entries</NavLink>
          <NavLink to="/plan">Savings &amp; budgets</NavLink>
        </nav>
        <div className="identity">
          <span>{user.email}</span>
          <button type="button" className="quiet" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/entries" element={<EntriesPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
