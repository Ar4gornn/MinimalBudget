import { Link } from "react-router-dom";

import { useT, type MessageKey } from "../i18n";

/**
 * Two views of one section, switched by a control at the top of the page.
 *
 * A section is one bottom tab; a view is a route under it. The Dashboard has the summary
 * and the calendar — "what happened, and what is due", in totals or day by day. The Habits
 * tab has the habits and the books (Epic 28) — both records of what a person is doing with
 * their own time, neither money. Each view is a real route so it can be linked and shared;
 * the tab stays lit for both (`also` in App.tsx). See App.tsx for the whole navigation
 * argument, including why neither view gets a tab of its own.
 */
export interface View {
  to: string;
  label: MessageKey;
}

export const DASHBOARD_VIEWS: readonly View[] = [
  { to: "/", label: "view.summary" },
  { to: "/calendar", label: "view.calendar" },
];

export const HABITS_VIEWS: readonly View[] = [
  { to: "/habits", label: "view.habits" },
  { to: "/books", label: "view.books" },
];

export function ViewSwitch({
  label,
  views,
  current,
}: {
  /** The group's accessible name — "Dashboard view", "Habits view". */
  label: MessageKey;
  views: readonly View[];
  /** The `to` of the view being drawn. */
  current: string;
}) {
  const t = useT();
  return (
    <div className="chips" role="group" aria-label={t(label)}>
      {views.map((view) => (
        <Link
          key={view.to}
          to={view.to}
          className={`chip ${current === view.to ? "on" : ""}`}
          aria-current={current === view.to ? "page" : undefined}
        >
          {t(view.label)}
        </Link>
      ))}
    </div>
  );
}
