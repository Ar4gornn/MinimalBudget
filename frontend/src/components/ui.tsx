import { useCallback, useState, type ReactNode } from "react";

import { useMoney } from "../useMoney";
import type { Money } from "../api/types";

/** Collapsed sections are remembered per person, per device. */
function readCollapsed(key: string): boolean {
  try {
    return window.localStorage.getItem(`minimalbudget.collapsed.${key}`) === "1";
  } catch {
    // Private windows and blocked site data throw. A section that will not remember being
    // collapsed is a smaller problem than a page that will not render.
    return false;
  }
}

function writeCollapsed(key: string, collapsed: boolean): void {
  try {
    if (collapsed) window.localStorage.setItem(`minimalbudget.collapsed.${key}`, "1");
    else window.localStorage.removeItem(`minimalbudget.collapsed.${key}`);
  } catch {
    /* see readCollapsed */
  }
}

export function Card({
  title,
  children,
  actions,
  /** Pass a stable key to make the section collapsible and remember its state. */
  collapseKey,
  /** Shown in the header while collapsed, so folding it away does not hide everything. */
  summary,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  collapseKey?: string;
  summary?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() =>
    collapseKey ? readCollapsed(collapseKey) : false,
  );

  const toggle = useCallback(() => {
    if (!collapseKey) return;
    setCollapsed((was) => {
      writeCollapsed(collapseKey, !was);
      return !was;
    });
  }, [collapseKey]);

  const heading = title ? <h2 style={{ margin: 0 }}>{title}</h2> : <span />;

  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-head">
          {collapseKey ? (
            // A real button, so it is reachable by keyboard and announces its state rather
            // than being a div that happens to respond to clicks.
            <button
              type="button"
              className="card-toggle"
              onClick={toggle}
              aria-expanded={!collapsed}
            >
              <span className={`chevron ${collapsed ? "closed" : ""}`} aria-hidden="true">
                ▾
              </span>
              {heading}
              {collapsed && summary ? <span className="card-summary">{summary}</span> : null}
            </button>
          ) : (
            heading
          )}
          {actions}
        </div>
      )}
      {!collapsed && children}
    </section>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: Money;
  tone?: "in" | "out" | "plain";
}) {
  const money = useMoney();
  const negative = value.trimStart().startsWith("-");
  const classes = ["value", tone === "in" ? "in" : "", tone === "out" ? "out" : ""];
  if (negative) classes.push("negative");
  return (
    <div className="card stat" data-stat={label}>
      <div className="label">{label}</div>
      <div className={classes.filter(Boolean).join(" ")}>{money.amount(value)}</div>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="error" role="alert">
      {message}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  // Wide tables scroll inside their own container rather than the page.
  return <div className="table-wrap">{children}</div>;
}
