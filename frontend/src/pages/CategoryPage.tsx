import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../api/client";
import { useOptionalAuth } from "../auth/AuthContext";
import type { Category, Entry, Trends, UnitPrices, VendorPrices } from "../api/types";
import { RateChart } from "../charts/RateChart";
import { Sparkline } from "../charts/Sparkline";
import { Card, Empty, ErrorBanner, Stat, TableWrap } from "../components/ui";
import { useToast } from "../components/Toast";
import { useT } from "../i18n";
import { errorMessage } from "../i18n/errors";
import { useDates } from "../useDates";
import { addMonths, budgetMonth } from "../months";
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
  const t = useT();
  const dates = useDates();
  // Optional, like useMoney: a month boundary has an obvious default, and crashing a
  // whole page for want of context is worse than falling back to the calendar month.
  const startDay = useOptionalAuth()?.user?.budget_start_day ?? 1;
  const toast = useToast();

  const [category, setCategory] = useState<Category | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [unitPrices, setUnitPrices] = useState<UnitPrices | null>(null);
  const [vendorPrices, setVendorPrices] = useState<VendorPrices | null>(null);
  const [month, setMonth] = useState(() => budgetMonth(startDay));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The unit-price series is an addition to this page, not its reason to exist: if
      // that one request fails the entries and the spend chart still render.
      const [categories, rows, nextTrends, unitPricesResult, vendorResult] = await Promise.all([
        api.listCategories(),
        api.listEntries({ category_id: categoryId, month }),
        api.trends(TREND_MONTHS, month),
        api.unitPrices(TREND_MONTHS, month).then(
          (value) => value,
          () => null,
        ),
        // Same posture: an addition to the page, not a reason for it to fail.
        api.vendorPrices(categoryId, TREND_MONTHS, month).then(
          (value) => value,
          () => null,
        ),
      ]);
      setCategory(categories.find((c) => c.id === categoryId) ?? null);
      setEntries(rows);
      setTrends(nextTrends);
      setUnitPrices(unitPricesResult);
      setVendorPrices(vendorResult);
    } catch (caught) {
      setError(errorMessage(t, caught, "category.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [categoryId, month, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(entry: Entry) {
    setError(null);
    try {
      await api.deleteEntry(entry.id);
      await load();
      toast.show(t("entries.deleted", { amount: money.amount(entry.amount) }), {
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
      setError(errorMessage(t, caught, "category.couldNotDelete"));
    }
  }

  const series = trends?.expense_by_category.find((s) => s.category_id === categoryId);
  const rateSeries = (unitPrices?.series ?? []).filter((s) => s.category_id === categoryId);
  const total = entries.reduce((sum, entry) => sum + Number(entry.amount), 0).toFixed(2);
  const quantified = entries.some((entry) => entry.quantity !== null);

  if (loading && !category) return <p className="empty">{t("state.loading")}</p>;

  return (
    <>
      <ErrorBanner message={error} />

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <Link to="/" className="hint">
            {t("category.backToDashboard")}
          </Link>
          <h1 style={{ fontSize: 18, margin: "4px 0 0" }}>
            {category?.name ?? t("category.fallbackName")}
          </h1>
        </div>
        <label style={{ flex: "0 0 150px" }}>
          {t("field.month")}
          <input
            type="month"
            aria-label={t("field.month")}
            value={month}
            onChange={(event) => setMonth(event.target.value || budgetMonth(startDay))}
          />
        </label>
      </div>

      <div className="grid">
        <Stat
          label={dates.month(month)}
          value={total}
          tone={category?.kind === "income" ? "in" : "out"}
        />
        <div className="card stat" data-stat="Entries">
          <div className="label">{t("category.entries")}</div>
          <div className="value">{entries.length}</div>
        </div>
      </div>

      {vendorPrices && vendorPrices.vendors.length > 1 && (
        <Card
          title={t("category.byVendor")}
          collapseKey="category.vendors"
          summary={t("category.vendorRows", { count: vendorPrices.vendors.length })}
        >
          <TableWrap>
            <table className="stacked" aria-label={t("category.byVendor")}>
              <thead>
                <tr>
                  <th>{t("category.colVendor")}</th>
                  <th className="num">{t("dash.colSpent", { symbol: money.symbol })}</th>
                  <th className="num">{t("category.colPerUnit")}</th>
                  <th className="num">{t("category.entries")}</th>
                </tr>
              </thead>
              <tbody>
                {vendorPrices.vendors.map((row) => (
                  <tr key={`${row.vendor_id}-${row.unit ?? "none"}`}>
                    <td data-label={t("category.colVendor")}>{row.vendor_name}</td>
                    <td className="num" data-label={t("dash.colSpentShort")}>
                      {money.plain(row.spent)}
                    </td>
                    <td className="num" data-label={t("category.colPerUnit")}>
                      {row.unit_price === null ? (
                        <span className="hint">—</span>
                      ) : (
                        `${row.unit_price} /${row.unit}`
                      )}
                    </td>
                    <td className="num" data-label={t("category.entries")}>
                      {row.entries}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="hint" style={{ marginTop: 8 }}>
            {t("category.vendorHint", { months: TREND_MONTHS })}
          </p>
        </Card>
      )}

      {series && (
        <Card title={t("dash.lastMonths", { count: TREND_MONTHS })}>
          <Sparkline
            values={series.values}
            months={trends?.months ?? []}
            label={series.category_name}
            peak={Math.max(1, ...series.values.map(toChartNumber))}
          />
          <div className="legend">
            {(trends?.months ?? []).map((m, index) => (
              <span key={m}>
                {dates.monthTick(m)} {money.plain(series.values[index] ?? "0.00")}
              </span>
            ))}
          </div>
        </Card>
      )}

      {rateSeries.map((rates) => (
        <Card
          key={rates.unit}
          title={t("category.pricePer", {
            unit: unitSingular(rates.unit, t),
            symbol: money.symbol,
          })}
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
                  {dates.monthTick(m)} {rate === null ? "—" : rate}
                </span>
              );
            })}
          </div>
        </Card>
      ))}

      <Card title={t("category.entries")}>
        {entries.length === 0 ? (
          <Empty>
            {t("category.nothingIn", { month: dates.month(month) })}{" "}
            <Link to="/entries?add=1">{t("category.addAnEntry")}</Link>
            {t("category.or")}
            <button
              type="button"
              className="link"
              onClick={() => setMonth(addMonths(month, -1))}
            >
              {t("category.previousMonth")}
            </button>
            .
          </Empty>
        ) : (
          <TableWrap>
            <table className="stacked" aria-label={t("category.tableAria")}>
              <thead>
                <tr>
                  <th>{t("field.date")}</th>
                  <th className="num">
                    {t("entries.colAmount", { symbol: money.symbol })}
                  </th>
                  {quantified && <th className="num">{t("field.quantity")}</th>}
                  <th>{t("field.note")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label={t("field.date")}>{entry.occurred_on}</td>
                    <td className="num" data-label={t("entries.colAmountShort")}>
                      {money.plain(entry.amount)}
                      {entry.unit_price && entry.unit && (
                        <div className="hint rate">{formatRate(entry.unit_price, entry.unit)}</div>
                      )}
                    </td>
                    {quantified && (
                      <td className="num" data-label={t("field.quantity")}>
                        {entry.quantity && entry.unit
                          ? `${formatQuantity(entry.quantity)} ${entry.unit}`
                          : ""}
                      </td>
                    )}
                    <td className="wrap" data-label={t("field.note")}>
                      {entry.note ?? ""}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => void remove(entry)}
                      >
                        {t("action.delete")}
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
