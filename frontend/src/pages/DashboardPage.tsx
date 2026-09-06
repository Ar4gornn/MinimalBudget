import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { useOptionalAuth } from "../auth/AuthContext";
import type {
  InventoryItem,
  PendingEntry,
  Period,
  Space,
  Summary,
  Trends,
} from "../api/types";
import { Sparkline } from "../charts/Sparkline";
import { ProgressBar } from "../charts/ProgressBar";
import { TrendChart } from "../charts/TrendChart";
import { Card, Empty, ErrorBanner, Stat, TableWrap } from "../components/ui";
import {progress, subtractMoney, toChartNumber, toCents } from "../money";
import { useMoney } from "../useMoney";
import { budgetMonth, monthLabel, monthRangeLabel, shiftMonth } from "../months";

const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];
const PERIOD_KEY = "minimalbudget.period";

function readPeriod(): Period {
  try {
    const stored = window.localStorage.getItem(PERIOD_KEY);
    return PERIODS.some((p) => p.value === stored) ? (stored as Period) : "month";
  } catch {
    return "month";
  }
}

const TREND_WINDOWS = [6, 12] as const;
const TREND_KEY = "minimalbudget.trendMonths";

/** Remembered per device, like the collapsed sections. */
function readTrendMonths(): number {
  try {
    const stored = Number(window.localStorage.getItem(TREND_KEY));
    return TREND_WINDOWS.includes(stored as (typeof TREND_WINDOWS)[number]) ? stored : 6;
  } catch {
    return 6;
  }
}

export function DashboardPage() {
  const money = useMoney();
  // The account's month need not be the calendar one (AD-10).
  // Optional, like useMoney: a month boundary has an obvious default, and crashing a
  // whole page for want of context is worse than falling back to the calendar month.
  const startDay = useOptionalAuth()?.user?.budget_start_day ?? 1;
  const [month, setMonth] = useState(() => budgetMonth(startDay));
  // Month, year or everything. Remembered per device, like the trend window.
  const [period, setPeriod] = useState<Period>(readPeriod);
  const [trendMonths, setTrendMonths] = useState(readTrendMonths);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // AD-31: the inventory is its own module, composed here by calling its own endpoint —
  // the same one the inventory page filters on, so the count can never disagree with
  // the list (AD-30). It is allowed to fail on its own: a broken inventory must not
  // blank the ledger.
  const [lowItems, setLowItems] = useState<InventoryItem[] | null>(null);
  const [pending, setPending] = useState<PendingEntry[] | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextTrends] = await Promise.all([
        api.summary(month, period),
        api.trends(trendMonths, month),
      ]);
      setSummary(nextSummary);
      setTrends(nextTrends);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, [month, period, trendMonths]);

  useEffect(() => {
    void load();
  }, [load]);

  // Proposals from recurring templates. Reading the list is what materialises them, so the
  // dashboard is where a family member finds out there is something to confirm.
  useEffect(() => {
    let cancelled = false;
    void api.listPending().then(
      (rows) => {
        if (!cancelled) setPending(rows);
      },
      () => {
        if (!cancelled) setPending(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Spaces only decorate the names; their request failing must not hide the count.
    void Promise.all([
      api.listItems({ needs_restock: true }),
      api.listSpaces().then(
        (value) => value,
        () => [] as Space[],
      ),
    ])
      .then(([items, nextSpaces]) => {
        if (cancelled) return;
        setLowItems(items);
        setSpaces(nextSpaces);
      })
      .catch(() => {
        if (!cancelled) setLowItems(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const spaceName = (id: string) => spaces.find((space) => space.id === id)?.name ?? "";

  // How many categories are over budget: the one number worth keeping visible when the
  // section is folded away, because it is the only one that asks you to do something.
  const overspent = useMemo(
    () =>
      (summary?.budgets ?? []).filter(
        (row) => row.budget !== null && toCents(row.actual) > toCents(row.budget),
      ).length,
    [summary],
  );

  // One scale across every sparkline, so the rows can be compared to each other.
  const seriesPeak = useMemo(() => {
    if (!trends) return 1;
    return Math.max(
      1,
      ...trends.expense_by_category.flatMap((series) => series.values.map(toChartNumber)),
    );
  }, [trends]);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>
            {period === "month" ? monthLabel(month) : (summary?.label ?? "…")}
          </h1>
          {/* Spelled out, because "September" meaning 26 Aug - 25 Sep is exactly the sort
              of thing a person should never have to infer from a total. The server sends
              the real bounds, so the client never has to reconstruct them. */}
          {period === "month" ? (
            monthRangeLabel(month, startDay) && (
              <p className="hint" style={{ margin: 0 }}>{monthRangeLabel(month, startDay)}</p>
            )
          ) : summary?.start && summary?.end ? (
            <p className="hint" style={{ margin: 0 }}>
              {summary.start} to {summary.end}
            </p>
          ) : null}
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <div className="chips" role="group" aria-label="Period">
            {PERIODS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`chip ${period === option.value ? "on" : ""}`}
                aria-pressed={period === option.value}
                onClick={() => {
                  setPeriod(option.value);
                  try {
                    window.localStorage.setItem(PERIOD_KEY, option.value);
                  } catch {
                    /* a forgotten preference is not worth a crash */
                  }
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          {/* Hidden for all-time, where picking a month would change nothing — a control
              that does nothing is worse than no control. */}
          {period !== "all" && (
        <div className="month-nav">
          <button
            type="button"
            className="quiet"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, period === "year" ? -12 : -1))}
          >
            ←
          </button>
          <label style={{ textTransform: "none" }}>
            <span className="visually-hidden" style={{ display: "none" }}>
              Month
            </span>
            <input
              type="month"
              aria-label="Month"
              value={month}
              onChange={(event) => setMonth(event.target.value || budgetMonth(startDay))}
            />
          </label>
          <button
            type="button"
            className="quiet"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, period === "year" ? 12 : 1))}
          >
            →
          </button>
        </div>
          )}
        </div>
      </div>

      <ErrorBanner message={error} />

      {loading && !summary ? (
        <p className="empty">Loading…</p>
      ) : summary ? (
        <>
          <div className="grid">
            <Stat label="Income" value={summary.income} tone="in" />
            <Stat label="Expense" value={summary.expense} tone="out" />
            <Stat label="Net" value={summary.net} />
            <Stat label="Saved" value={summary.saved} />
          </div>

          {pending && pending.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Card
                title="To confirm"
                collapseKey="dashboard.pending"
                summary={`${pending.length} ${pending.length === 1 ? "entry" : "entries"}`}
              >
                <p style={{ margin: "0 0 6px" }} data-stat="To confirm">
                  <Link to="/plan">
                    {pending.length} recurring{" "}
                    {pending.length === 1 ? "entry is" : "entries are"} waiting for you
                  </Link>
                </p>
                <p className="hint" style={{ margin: 0 }}>
                  {pending
                    .slice(0, 3)
                    .map((row) => `${row.category_name} · ${row.due_on}`)
                    .join(", ")}
                  {pending.length > 3 ? ", …" : ""}
                </p>
              </Card>
            </div>
          )}

          {lowItems && lowItems.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Card
                title="Restock"
                collapseKey="dashboard.restock"
                summary={`${lowItems.length} ${lowItems.length === 1 ? "item" : "items"}`}
              >
                <p style={{ margin: "0 0 6px" }} data-stat="Restock">
                  <Link to="/inventory?filter=restock">
                    {lowItems.length} {lowItems.length === 1 ? "item needs" : "items need"}{" "}
                    restocking
                  </Link>
                </p>
                <p className="hint" style={{ margin: 0 }}>
                  {lowItems
                    .slice(0, 3)
                    .map((item) => {
                      const space = spaceName(item.space_id);
                      return space ? `${item.name} · ${space}` : item.name;
                    })
                    .join(", ")}
                  {lowItems.length > 3 ? ", …" : ""}
                </p>
              </Card>
            </div>
          )}

          {period !== "month" && (
            <p className="hint" style={{ marginTop: 16 }}>
              Budgets and savings targets are monthly amounts, so they are shown for a month
              only. The figures above cover {summary.label.toLowerCase()}.
            </p>
          )}

          <div className="columns" style={{ marginTop: 16, display: period === "month" ? undefined : "none" }}>
            <Card
              title="Budget vs actual"
              collapseKey="dashboard.budgets"
              summary={
                summary.budgets.length === 0
                  ? "none"
                  : `${summary.budgets.length} categories${
                      overspent > 0 ? ` · ${overspent} over` : ""
                    }`
              }
            >
              {summary.budgets.length === 0 ? (
                <Empty>No budgets set and nothing spent this month.</Empty>
              ) : (
                <TableWrap>
                  <table className="stacked" aria-label="Budget vs actual">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="num">
                          Spent ({money.symbol})
                        </th>
                        <th className="num">
                          Budget ({money.symbol})
                        </th>
                        <th className="num">
                          Left ({money.symbol})
                        </th>
                        <th style={{ width: 110 }}>Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.budgets.map((row) => {
                        const percent = progress(row.actual, row.budget);
                        const over =
                          row.budget !== null && toCents(row.actual) > toCents(row.budget);
                        return (
                          <tr key={row.category_id}>
                            <td data-label="Category">
                              <Link to={`/categories/${row.category_id}`}>{row.category_name}</Link>
                            </td>
                            <td className="num" data-label="Spent">{money.plain(row.actual)}</td>
                            <td className="num" data-label="Budget">
                              {row.budget === null ? (
                                <span className="hint">not set</span>
                              ) : (
                                money.plain(row.budget)
                              )}
                            </td>
                            <td className="num" data-label="Left" style={over ? { color: "var(--spend)" } : undefined}>
                              {row.budget === null
                                ? "—"
                                : money.plain(subtractMoney(row.budget, row.actual))}
                            </td>
                            <td>
                              <ProgressBar
                                percent={percent}
                                over={over}
                                label={`${row.category_name} budget used`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>

            <Card
              title="Savings progress"
              collapseKey="dashboard.savings"
              summary={
                summary.savings.length === 0
                  ? "none"
                  : `${summary.savings.length} ${summary.savings.length === 1 ? "type" : "types"}`
              }
            >
              {summary.savings.length === 0 ? (
                <Empty>No targets set and nothing put aside this month.</Empty>
              ) : (
                <TableWrap>
                  <table className="stacked" aria-label="Savings progress">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th className="num">
                          Saved ({money.symbol})
                        </th>
                        <th className="num">
                          Target ({money.symbol})
                        </th>
                        <th style={{ width: 110 }}>Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.savings.map((row) => (
                        <tr key={row.savings_type_id}>
                          <td data-label="Type">{row.savings_type_name}</td>
                          <td className="num" data-label="Saved">{money.plain(row.actual)}</td>
                          <td className="num" data-label="Target">
                            {row.target === null ? (
                              <span className="hint">not set</span>
                            ) : (
                              money.plain(row.target)
                            )}
                          </td>
                          <td>
                            <ProgressBar
                              percent={progress(row.actual, row.target)}
                              over={false}
                              label={`${row.savings_type_name} target reached`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>
          </div>

          {trends && (
            <div style={{ marginTop: 16 }}>
              <Card
                title={`Last ${trendMonths} months`}
                actions={
                  <div className="chips" role="group" aria-label="Trend window">
                    {TREND_WINDOWS.map((months) => (
                      <button
                        key={months}
                        type="button"
                        className={`chip ${trendMonths === months ? "on" : ""}`}
                        aria-pressed={trendMonths === months}
                        onClick={() => {
                          setTrendMonths(months);
                          try {
                            window.localStorage.setItem(TREND_KEY, String(months));
                          } catch {
                            /* a forgotten preference is not worth a crash */
                          }
                        }}
                      >
                        {months} months
                      </button>
                    ))}
                  </div>
                }
              >
                <TrendChart
                  months={trends.months}
                  income={trends.income}
                  expense={trends.expense}
                  saved={trends.saved}
                />
              </Card>

              <Card
                title="Expense by category"
                collapseKey="dashboard.categories"
                summary={`${trends.expense_by_category.length} categories`}
              >
                {trends.expense_by_category.length === 0 ? (
                  <Empty>Nothing spent in this window.</Empty>
                ) : (
                  <TableWrap>
                    <table className="stacked" aria-label="Expense by category">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Trend</th>
                          <th className="num">This month ({money.symbol})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trends.expense_by_category.map((series) => (
                          <tr key={series.category_id}>
                            <td data-label="Category">
                              <Link to={`/categories/${series.category_id}`}>{series.category_name}</Link>
                            </td>
                            <td>
                              <Sparkline
                                values={series.values}
                                months={trends.months}
                                label={series.category_name}
                                peak={seriesPeak}
                              />
                            </td>
                            <td className="num">
                              {money.plain(series.values[series.values.length - 1] ?? "0.00")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                )}
              </Card>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
