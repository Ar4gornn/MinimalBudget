import { Link } from "react-router-dom";

import { useT } from "../i18n";

/**
 * The Dashboard section has two views of the same question.
 *
 * "What happened, and what is due" is the dashboard's job; the calendar answers it day by
 * day instead of in totals. They are one section rather than two tabs because the bottom
 * bar holds five and both belong to the same question — see App.tsx for the whole
 * navigation argument.
 */
export function ViewSwitch({ current }: { current: "summary" | "calendar" }) {
  const t = useT();
  return (
    <div className="chips" role="group" aria-label={t("view.dashboardView")}>
      <Link
        to="/"
        className={`chip ${current === "summary" ? "on" : ""}`}
        aria-current={current === "summary" ? "page" : undefined}
      >
        {t("view.summary")}
      </Link>
      <Link
        to="/calendar"
        className={`chip ${current === "calendar" ? "on" : ""}`}
        aria-current={current === "calendar" ? "page" : undefined}
      >
        {t("view.calendar")}
      </Link>
    </div>
  );
}
