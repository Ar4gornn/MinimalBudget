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
import { MoodCheckin } from "../components/MoodCheckin";
import { Card, Empty, ErrorBanner, Stat, TableWrap } from "../components/ui";
import { ViewSwitch } from "../components/ViewSwitch";
import { progress, subtractMoney, toChartNumber, toCents } from "../money";
import { useMoney } from "../useMoney";
import { useT } from "../i18n";
import { errorMessage } from "../i18n/errors";
import { useDates } from "../useDates";
import { budgetMonth, shiftMonth } from "../months";

/** The three windows, as message keys: the chips are drawn on every dashboard. */
const PERIODS = [
  { value: "month", label: "dash.month" },
  { value: "year", label: "dash.year" },
  { value: "all", label: "dash.allTime" },
] as const;
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
  const t = useT();
  const dates = useDates();
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
      setError(errorMessage(t, caught, "dash.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [month, period, trendMonths, t]);

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

  /**
   * What to call the window on screen.
   *
   * The server's `summary.label` is `"2026-09"`, `"2026"` or the words `"All time"` — and
   * that last one is the only English word the dashboard would otherwise render. A month
   * is named from the catalogue, a year is a number that needs no translating, and
   * all-time gets its own message. The server keeps sending its label; it is simply not
   * the thing a person reads (AD-44's rule, applied to a heading rather than an error).
   */
  const periodLabel = (): string => {
    if (period === "month") return dates.month(month);
    if (period === "all") return t("dash.allTime");
    return summary?.label ?? "…";
  };

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
          {/* The mood control sits beside the heading rather than in the cluster on the
              right, and the placement is a decision rather than a spare corner. That
              cluster already carries three groups — the Summary/Calendar switch, the
              Month/Year/All-time chips and the month navigator — and it is the half of
              this header that wraps at 375px. The left half is one line of text with room
              beside it at every width, so a 40px target goes there and nothing else moves.
              Verified in a browser at 375px, not asserted. */}
          <div className="dash-title">
            {/* Before the heading, not after it, and that is a measurement rather than a
                preference. The panel is anchored to this button, and a heading that reads
                "September 2026" in one month and "2026" in another moves the anchor by
                ~115px — with the button after the title, the panel hung 98px off the right
                edge of a 375px screen and put a horizontal scrollbar on the page. First in
                the row, the anchor is at the shell's left padding whatever the month is
                called. */}
            <MoodCheckin />
            <h1 style={{ fontSize: 18, margin: 0 }}>
              {periodLabel()}
            </h1>
          </div>
          {/* Spelled out, because "September" meaning 26 Aug - 25 Sep is exactly the sort
              of thing a person should never have to infer from a total. The server sends
              the real bounds, so the client never has to reconstruct them. */}
          {period === "month" ? (
            dates.monthRange(month, startDay) && (
              <p className="hint" style={{ margin: 0 }}>
                {dates.monthRange(month, startDay)}
              </p>
            )
          ) : summary?.start && summary?.end ? (
            <p className="hint" style={{ margin: 0 }}>
              {t("dash.rangeTo", { start: summary.start, end: summary.end })}
            </p>
          ) : null}
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {/* Two views of one question: totals here, day by day next door. The calendar
              takes no bottom tab of its own — see App.tsx for the whole argument. */}
          <ViewSwitch current="summary" />
          <div className="chips" role="group" aria-label={t("dash.period")}>
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
                {t(option.label)}
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
            aria-label={t("month.previous")}
            onClick={() => setMonth(shiftMonth(month, period === "year" ? -12 : -1))}
          >
            ←
          </button>
          <label style={{ textTransform: "none" }}>
            <span className="visually-hidden" style={{ display: "none" }}>
              {t("dash.month")}
            </span>
            <input
              type="month"
              aria-label={t("dash.month")}
              value={month}
              onChange={(event) => setMonth(event.target.value || budgetMonth(startDay))}
            />
          </label>
          <button
            type="button"
            className="quiet"
            aria-label={t("month.next")}
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
        <p className="empty">{t("state.loading")}</p>
      ) : summary ? (
        <>
          <div className="grid">
            <Stat label={t("dash.income")} value={summary.income} tone="in" />
            <Stat label={t("dash.expense")} value={summary.expense} tone="out" />
            <Stat label={t("dash.net")} value={summary.net} />
            <Stat label={t("dash.saved")} value={summary.saved} />
          </div>

          {pending && pending.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Card
                title={t("dash.toConfirm")}
                collapseKey="dashboard.pending"
                summary={t.n("dash.pendingCount", pending.length)}
              >
                <p style={{ margin: "0 0 6px" }} data-stat="To confirm">
                  <Link to="/plan">{t.n("dash.pendingWaiting", pending.length)}</Link>
                </p>
                <p className="hint" style={{ margin: 0 }}>
                  {pending
                    .slice(0, 3)
                    .map((row) => `${row.category_name} · ${row.due_on}`)
                    .join(", ")}
                  {pending.length > 3 ? t("dash.andMore") : ""}
                </p>
              </Card>
            </div>
          )}

          {lowItems && lowItems.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Card
                title={t("dash.restock")}
                collapseKey="dashboard.restock"
                summary={t.n("dash.restockCount", lowItems.length)}
              >
                <p style={{ margin: "0 0 6px" }} data-stat="Restock">
                  <Link to="/inventory?filter=restock">
                    {t.n("dash.restockNeed", lowItems.length)}
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
                  {lowItems.length > 3 ? t("dash.andMore") : ""}
                </p>
              </Card>
            </div>
          )}

          {period !== "month" && (
            <p className="hint" style={{ marginTop: 16 }}>
              {t("dash.periodNote", { label: periodLabel().toLowerCase() })}
            </p>
          )}

          <div className="columns" style={{ marginTop: 16, display: period === "month" ? undefined : "none" }}>
            <Card
              title={t("dash.budgetVsActual")}
              collapseKey="dashboard.budgets"
              summary={
                summary.budgets.length === 0
                  ? t("dash.summaryNone")
                  : t("dash.categoriesCount", { count: summary.budgets.length }) +
                    (overspent > 0 ? t("dash.overCount", { count: overspent }) : "")
              }
            >
              {summary.budgets.length === 0 ? (
                <Empty>{t("dash.noBudgets")}</Empty>
              ) : (
                <TableWrap>
                  <table className="stacked" aria-label={t("dash.budgetVsActual")}>
                    <thead>
                      <tr>
                        <th>{t("dash.colCategory")}</th>
                        <th className="num">{t("dash.colSpent", { symbol: money.symbol })}</th>
                        <th className="num">{t("dash.colBudget", { symbol: money.symbol })}</th>
                        <th className="num">{t("dash.colLeft", { symbol: money.symbol })}</th>
                        <th style={{ width: 110 }}>{t("dash.colProgress")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.budgets.map((row) => {
                        const percent = progress(row.actual, row.budget);
                        const over =
                          row.budget !== null && toCents(row.actual) > toCents(row.budget);
                        return (
                          <tr key={row.category_id}>
                            <td data-label={t("dash.colCategory")}>
                              <Link to={`/categories/${row.category_id}`}>
                                {row.category_name}
                              </Link>
                            </td>
                            <td className="num" data-label={t("dash.colSpentShort")}>
                              {money.plain(row.actual)}
                            </td>
                            <td className="num" data-label={t("dash.colBudgetShort")}>
                              {row.budget === null ? (
                                <span className="hint">{t("dash.notSet")}</span>
                              ) : (
                                money.plain(row.budget)
                              )}
                            </td>
                            <td
                              className="num"
                              data-label={t("dash.colLeftShort")}
                              style={over ? { color: "var(--spend)" } : undefined}
                            >
                              {row.budget === null
                                ? "—"
                                : money.plain(subtractMoney(row.budget, row.actual))}
                            </td>
                            <td>
                              <ProgressBar
                                percent={percent}
                                over={over}
                                label={t("dash.budgetUsed", { name: row.category_name })}
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
              title={t("dash.savingsProgress")}
              collapseKey="dashboard.savings"
              summary={
                summary.savings.length === 0
                  ? t("dash.summaryNone")
                  : t.n("dash.savingsCount", summary.savings.length)
              }
            >
              {summary.savings.length === 0 ? (
                <Empty>{t("dash.noSavings")}</Empty>
              ) : (
                <TableWrap>
                  <table className="stacked" aria-label={t("dash.savingsProgress")}>
                    <thead>
                      <tr>
                        <th>{t("dash.colType")}</th>
                        <th className="num">{t("dash.colSaved", { symbol: money.symbol })}</th>
                        <th className="num">{t("dash.colTarget", { symbol: money.symbol })}</th>
                        <th style={{ width: 110 }}>{t("dash.colProgress")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.savings.map((row) => (
                        <tr key={row.savings_type_id}>
                          <td data-label={t("dash.colType")}>{row.savings_type_name}</td>
                          <td className="num" data-label={t("dash.colSavedShort")}>
                            {money.plain(row.actual)}
                          </td>
                          <td className="num" data-label={t("dash.colTargetShort")}>
                            {row.target === null ? (
                              <span className="hint">{t("dash.notSet")}</span>
                            ) : (
                              money.plain(row.target)
                            )}
                          </td>
                          <td>
                            <ProgressBar
                              percent={progress(row.actual, row.target)}
                              over={false}
                              label={t("dash.targetReached", { name: row.savings_type_name })}
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
                title={t("dash.lastMonths", { count: trendMonths })}
                actions={
                  <div className="chips" role="group" aria-label={t("dash.trendWindow")}>
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
                        {t("dash.monthsChip", { count: months })}
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
                title={t("dash.expenseByCategory")}
                collapseKey="dashboard.categories"
                summary={t("dash.categoriesCount", {
                  count: trends.expense_by_category.length,
                })}
              >
                {trends.expense_by_category.length === 0 ? (
                  <Empty>{t("dash.nothingSpent")}</Empty>
                ) : (
                  <TableWrap>
                    <table className="stacked" aria-label={t("dash.expenseByCategory")}>
                      <thead>
                        <tr>
                          <th>{t("dash.colCategory")}</th>
                          <th>{t("dash.colTrend")}</th>
                          <th className="num">
                            {t("dash.colThisMonth", { symbol: money.symbol })}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {trends.expense_by_category.map((series) => (
                          <tr key={series.category_id}>
                            <td data-label={t("dash.colCategory")}>
                              <Link to={`/categories/${series.category_id}`}>
                                {series.category_name}
                              </Link>
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
