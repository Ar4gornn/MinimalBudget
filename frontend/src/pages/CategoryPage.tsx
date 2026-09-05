import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { Category, Entry, Trends, UnitPrices } from "../api/types";
import { RateChart } from "../charts/RateChart";
import { Sparkline } from "../charts/Sparkline";
import { Card, Empty, ErrorBanner, Stat, TableWrap } from "../components/ui";
import { useToast } from "../components/Toast";
import { addMonths, currentMonth, monthLabel } from "../months";
import { toChartNumber } from "../money";
import { formatQuantity, formatRate, unitSingular } from "../quantity";
import { useMoney } from "../useMoney";

const TREND_MONTHS = 6;

/**
 * One category: what was spent on it, and when.
 *
 * The dashboard can tell you that Groceries went over by two euros. It could not tell you
 * what you actually bought, which is the obvious next question and previously had no answer
 * anywhere in the app.
 *
 * For a category bought by the litre or the kilo, this is also where the unit price lives
 * (AD-29): a fuel page that shows the price per litre by month is the whole reason the
 * quantity exists, and it belongs beside the fuel entries rather than on the dashboard.
 */
export function CategoryPage() {
  const { categoryId = "" } = useParams();
  const money = useMoney();
  const toast = useToast();

  const [category, setCategory] = useState<Category | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [unitPrices, setUnitPrices] = useState<UnitPrices | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [categories, rows, nextTrends, nextUnitPrices] = await Promise.all([
        api.listCategories(),
        api.listEntries({ category_id: categoryId, month }),
        api.trends(TREND_MONTHS, month),
        api.unitPrices(TREND_MONTHS, month),
      ]);
      setCategory(categories.find((c) => c.id === categoryId) ?? null);
      setEntries(rows);
      setTrends(nextTrends);
      setUnitPrices(nextUnitPrices);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this category.");
    } finally {
      setLoading(false);
    }
  }, [categoryId, month]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(entry: Entry) {
    setError(null);
    try {
      await api.deleteEntry(entry.id);
      await load();
      toast.show(`Deleted ${money.amount(entry.amount)}`, {
        onUndo: async () => {
          // Recreated rather than restored: the server has no undelete, and inventing one
          // for a five-person app would be a table and a sweeper job for a rare mistake.
          await api.createEntry({
            kind: entry.kind,
            amount: entry.amount,
            occurred_on: entry.occurred_on,
            category_id: entry.category_id,
            ...(entry.note ? { note: entry.note } : {}),
            ...(entry.quantity && entry.unit
              ? { quantity: entry.quantity, unit: entry.unit }
              : {}),
          });
          await load();
        },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete that entry.");
    }
  }

  const series = trends?.expense_by_category.find((s) => s.category_id === categoryId);
  const rateSeries = (unitPrices?.series ?? []).filter((s) => s.category_id === categoryId);
  const total = entries.reduce((sum, entry) => sum + Number(entry.amount), 0).toFixed(2);
  const quantified = entries.some((entry) => entry.quantity !== null);

  if (loading && !category) return <p className="empty">Loading…</p>;

  return (
    <>
      <ErrorBanner message={error} />

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <Link to="/" className="hint">
            ← Dashboard
          </Link>
          <h1 style={{ fontSize: 18, margin: "4px 0 0" }}>{category?.name ?? "Category"}</h1>
        </div>
        <label style={{ flex: "0 0 150px" }}>
          Month
          <input
            type="month"
            aria-label="Month"
            value={month}
            onChange={(event) => setMonth(event.target.value || currentMonth())}
          />
        </label>
      </div>

      <div className="grid">
        <Stat
          label={monthLabel(month)}
          value={total}
          tone={category?.kind === "income" ? "in" : "out"}
        />
        <div className="card stat" data-stat="Entries">
          <div className="label">Entries</div>
          <div className="value">{entries.length}</div>
        </div>
      </div>

      {series && (
        <Card title={`Last ${TREND_MONTHS} months`}>
          <Sparkline
            values={series.values}
            months={trends?.months ?? []}
            label={series.category_name}
            peak={Math.max(1, ...series.values.map(toChartNumber))}
          />
          <div className="legend">
            {(trends?.months ?? []).map((m, index) => (
              <span key={m}>
                {monthLabel(m).slice(0, 3)} {money.plain(series.values[index] ?? "0.00")}
              </span>
            ))}
          </div>
        </Card>
      )}

      {rateSeries.map((rates) => (
        <Card
          key={rates.unit}
          title={`Price per ${unitSingular(rates.unit)} (${money.symbol})`}
        >
          <RateChart
            values={rates.unit_price}
            months={unitPrices?.months ?? []}
            unit={rates.unit}
            label={rates.category_name}
          />
          <div className="legend">
            {(unitPrices?.months ?? []).map((m, index) => {
              const rate = rates.unit_price[index] ?? null;
              const qty = rates.quantity[index] ?? "0.000";
              return (
                <span key={m} title={`${formatQuantity(qty)} ${rates.unit}`}>
                  {monthLabel(m).slice(0, 3)} {rate === null ? "—" : rate}
                </span>
              );
            })}
          </div>
        </Card>
      ))}

      <Card title="Entries">
        {entries.length === 0 ? (
          <Empty>
            Nothing recorded here in {monthLabel(month)}.{" "}
            <Link to="/entries?add=1">Add an entry</Link>, or{" "}
            <button type="button" className="link" onClick={() => setMonth(addMonths(month, -1))}>
              look at the previous month
            </button>
            .
          </Empty>
        ) : (
          <TableWrap>
            <table className="stacked" aria-label="Category entries">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Amount ({money.symbol})</th>
                  {quantified && <th className="num">Quantity</th>}
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Date">{entry.occurred_on}</td>
                    <td className="num" data-label="Amount">
                      {money.plain(entry.amount)}
                      {entry.unit_price && entry.unit && (
                        <div className="hint rate">{formatRate(entry.unit_price, entry.unit)}</div>
                      )}
                    </td>
                    {quantified && (
                      <td className="num" data-label="Quantity">
                        {entry.quantity && entry.unit
                          ? `${formatQuantity(entry.quantity)} ${entry.unit}`
                          : ""}
                      </td>
                    )}
                    <td className="wrap" data-label="Note">
                      {entry.note ?? ""}
                    </td>
                    <td>
                      <button type="button" className="quiet" onClick={() => void remove(entry)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
