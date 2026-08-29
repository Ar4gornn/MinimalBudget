import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import type { Summary, Trends } from "../api/types";
import { Sparkline } from "../charts/Sparkline";
import { ProgressBar } from "../charts/ProgressBar";
import { TrendChart } from "../charts/TrendChart";
import { Card, Empty, ErrorBanner, Stat, TableWrap } from "../components/ui";
import { formatMoney, progress, subtractMoney, toChartNumber, toCents } from "../money";
import { currentMonth, monthLabel, shiftMonth } from "../months";

const TREND_MONTHS = 6;

export function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextTrends] = await Promise.all([
        api.summary(month),
        api.trends(TREND_MONTHS, month),
      ]);
      setSummary(nextSummary);
      setTrends(nextTrends);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

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
        <h1 style={{ fontSize: 18, margin: 0 }}>{monthLabel(month)}</h1>
        <div className="row">
          <button type="button" className="quiet" onClick={() => setMonth(shiftMonth(month, -1))}>
            ← Previous
          </button>
          <label style={{ textTransform: "none" }}>
            <span className="visually-hidden" style={{ display: "none" }}>
              Month
            </span>
            <input
              type="month"
              aria-label="Month"
              value={month}
              onChange={(event) => setMonth(event.target.value || currentMonth())}
            />
          </label>
          <button type="button" className="quiet" onClick={() => setMonth(shiftMonth(month, 1))}>
            Next →
          </button>
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

          <div className="columns" style={{ marginTop: 16 }}>
            <Card title="Budget vs actual">
              {summary.budgets.length === 0 ? (
                <Empty>No budgets set and nothing spent this month.</Empty>
              ) : (
                <TableWrap>
                  <table aria-label="Budget vs actual">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="num">Spent</th>
                        <th className="num">Budget</th>
                        <th className="num">Left</th>
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
                            <td>{row.category_name}</td>
                            <td className="num">{formatMoney(row.actual)}</td>
                            <td className="num">
                              {row.budget === null ? (
                                <span className="hint">not set</span>
                              ) : (
                                formatMoney(row.budget)
                              )}
                            </td>
                            <td className="num" style={over ? { color: "var(--spend)" } : undefined}>
                              {row.budget === null
                                ? "—"
                                : formatMoney(subtractMoney(row.budget, row.actual))}
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

            <Card title="Savings progress">
              {summary.savings.length === 0 ? (
                <Empty>No targets set and nothing put aside this month.</Empty>
              ) : (
                <TableWrap>
                  <table aria-label="Savings progress">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th className="num">Saved</th>
                        <th className="num">Target</th>
                        <th style={{ width: 110 }}>Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.savings.map((row) => (
                        <tr key={row.savings_type_id}>
                          <td>{row.savings_type_name}</td>
                          <td className="num">{formatMoney(row.actual)}</td>
                          <td className="num">
                            {row.target === null ? (
                              <span className="hint">not set</span>
                            ) : (
                              formatMoney(row.target)
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
              <Card title={`Last ${TREND_MONTHS} months`}>
                <TrendChart
                  months={trends.months}
                  income={trends.income}
                  expense={trends.expense}
                  saved={trends.saved}
                />
              </Card>

              <Card title="Expense by category">
                {trends.expense_by_category.length === 0 ? (
                  <Empty>Nothing spent in this window.</Empty>
                ) : (
                  <TableWrap>
                    <table aria-label="Expense by category">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Trend</th>
                          <th className="num">This month</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trends.expense_by_category.map((series) => (
                          <tr key={series.category_id}>
                            <td>{series.category_name}</td>
                            <td>
                              <Sparkline
                                values={series.values}
                                months={trends.months}
                                label={series.category_name}
                                peak={seriesPeak}
                              />
                            </td>
                            <td className="num">
                              {formatMoney(series.values[series.values.length - 1] ?? "0.00")}
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
