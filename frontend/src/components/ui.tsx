import type { ReactNode } from "react";

import { useMoney } from "../useMoney";
import type { Money } from "../api/types";

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          {title ? <h2>{title}</h2> : <span />}
          {actions}
        </div>
      )}
      {children}
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
