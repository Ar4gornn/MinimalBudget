import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import { useOptionalAuth } from "../auth/AuthContext";
import type { EntryInput } from "../api/client";
import {
  UNITS,
  type Category,
  type Entry,
  type EntryKind,
  type Unit,
  type Vendor,
} from "../api/types";
import { Card, Empty, ErrorBanner, TableWrap } from "../components/ui";
import { useToast } from "../components/Toast";
import { isPositiveMoney } from "../money";
import {
  formatQuantity,
  formatRate,
  isQuantity,
  isRate,
  recallUnit,
  rememberUnit,
  solveAmount,
  solveQuantity,
  solveRate,
  toMilli,
  unitLabel,
} from "../quantity";
import { useMoney } from "../useMoney";
import { useT } from "../i18n";
import type { MessageKey } from "../i18n/catalogue";
import { errorMessage } from "../i18n/errors";
import { useDates } from "../useDates";
import { budgetMonth, todayIso } from "../months";

export function EntriesPage() {
  const money = useMoney();
  const t = useT();
  const dates = useDates();
  // Optional, like useMoney: a month boundary has an obvious default, and crashing a
  // whole page for want of context is worse than falling back to the calendar month.
  const startDay = useOptionalAuth()?.user?.budget_start_day ?? 1;
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const amountRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [kindFilter, setKindFilter] = useState<EntryKind | "">("");
  const [monthFilter, setMonthFilter] = useState(() => budgetMonth(startDay));
  const [categoryFilter, setCategoryFilter] = useState("");
  // Searched on the server, so it looks past the month on screen rather than filtering the
  // rows already fetched — which would quietly answer a different question.
  const [search, setSearch] = useState("");

  const [kind, setKind] = useState<EntryKind>("expense");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [categoryName, setCategoryName] = useState("");
  const [note, setNote] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [saving, setSaving] = useState(false);

  // AD-29: the optional "how much of what" section. Any two of amount, quantity and unit
  // price fill in the third — the pump shows a total, the receipt shows a rate, and the
  // person should be able to type whichever they are looking at.
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit | "">("");
  const [rate, setRate] = useState("");
  const [showQuantity, setShowQuantity] = useState(false);
  // Set by the × button and cleared on submit: a remembered unit must not reopen a section
  // the person just closed, however many more characters they type into the category.
  const [unitDismissed, setUnitDismissed] = useState(false);

  // Inline editing rather than a modal: the rows already become cards on a phone, so the
  // same markup turns into a sensible form without needing focus trapping, escape
  // handling and scroll locking to be got right.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    amount: string;
    occurred_on: string;
    category_id: string;
    note: string;
    quantity: string;
    unit: Unit | "";
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextEntries, nextCategories, nextVendors] = await Promise.all([
        api.listEntries({
          ...(kindFilter ? { kind: kindFilter } : {}),
          ...(monthFilter ? { month: monthFilter } : {}),
          ...(categoryFilter ? { category_id: categoryFilter } : {}),
          ...(search.trim() ? { q: search.trim() } : {}),
        }),
        api.listCategories(),
        api.listVendors(),
      ]);
      setEntries(nextEntries);
      setCategories(nextCategories);
      setVendors(nextVendors);
    } catch (caught) {
      setError(errorMessage(t, caught, "entries.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [kindFilter, monthFilter, categoryFilter, search, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Arriving from the quick-add button: focus the amount so the keyboard opens straight
  // onto the first thing you would type, then drop the parameter so a refresh is normal.
  useEffect(() => {
    if (searchParams.get("add") !== "1") return;
    // Arriving from a day on the calendar: that day is the one being recorded, so prefill
    // it rather than leaving today's date to be corrected by hand.
    const date = searchParams.get("date");
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) setOccurredOn(date);
    amountRef.current?.focus();
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const nameOf = useMemo(() => {
    const lookup = new Map(categories.map((category) => [category.id, category.name]));
    return (id: string) => lookup.get(id) ?? "—";
  }, [categories]);

  // --- the three-way solve -------------------------------------------------------

  function onAmountChange(value: string) {
    setAmount(value);
    if (!isPositiveMoney(value)) return;
    if (isQuantity(quantity)) setRate(solveRate(value.trim(), quantity.trim()));
    else if (isRate(rate) && !quantity) setQuantity(solveQuantity(value.trim(), rate.trim()));
  }

  function onQuantityChange(value: string) {
    setQuantity(value);
    if (!isQuantity(value)) return;
    if (isPositiveMoney(amount)) setRate(solveRate(amount.trim(), value.trim()));
    else if (isRate(rate) && !amount) setAmount(solveAmount(value.trim(), rate.trim()));
  }

  function onRateChange(value: string) {
    setRate(value);
    if (!isRate(value)) return;
    if (isQuantity(quantity)) setAmount(solveAmount(quantity.trim(), value.trim()));
    else if (isPositiveMoney(amount) && !quantity) {
      setQuantity(solveQuantity(amount.trim(), value.trim()));
    }
  }

  function onCategoryNameChange(value: string) {
    setCategoryName(value);
    // Pre-fill the unit this category was last quantified in. Only for an expense, only
    // when the section is untouched, and never after it was dismissed for this entry.
    if (kind === "expense" && !unitDismissed && !unit && !quantity) {
      const remembered = recallUnit(value);
      if (remembered) {
        setUnit(remembered);
        setShowQuantity(true);
      }
    }
  }

  function clearQuantity() {
    setQuantity("");
    setUnit("");
    setRate("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isPositiveMoney(amount)) {
      setError(t("entries.badAmount"));
      return;
    }
    const quantified = kind === "expense" && quantity.trim() !== "";
    if (quantified && !isQuantity(quantity)) {
      setError(t("entries.badQuantity"));
      return;
    }
    if (quantified && !unit) {
      setError(t("entries.needUnit"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // AD-12: exactly one of category_id or category_name. Typing a new name here
      // creates the category, so recording a transaction never needs a detour.
      await api.createEntry({
        kind,
        amount: amount.trim(),
        occurred_on: occurredOn,
        category_name: categoryName.trim(),
        ...(vendorName.trim() ? { vendor_name: vendorName.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(quantified && unit ? { quantity: quantity.trim(), unit } : {}),
      });
      if (quantified && unit) rememberUnit(categoryName, unit);
      setAmount("");
      setNote("");
      clearQuantity();
      setUnitDismissed(false);
      await load();
      toast.show(t("entries.added"));
    } catch (caught) {
      setError(errorMessage(t, caught, "entries.couldNotSave"));
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(entry: Entry) {
    setEditing(entry.id);
    setDraft({
      amount: entry.amount,
      occurred_on: entry.occurred_on,
      category_id: entry.category_id,
      note: entry.note ?? "",
      quantity: entry.quantity ?? "",
      unit: entry.unit ?? "",
    });
  }

  async function saveEdit(entry: Entry) {
    if (!draft) return;
    if (!isPositiveMoney(draft.amount)) {
      setError(t("entries.badAmount"));
      return;
    }
    const draftQuantified = draft.quantity.trim() !== "";
    if (draftQuantified && !isQuantity(draft.quantity)) {
      setError(t("entries.badQuantity"));
      return;
    }
    if (draftQuantified && !draft.unit) {
      setError(t("entries.needUnit"));
      return;
    }

    // Send only what changed. PATCH means "these fields"; including the untouched ones
    // would write a stale copy over anything edited elsewhere since this list loaded.
    const patch: Partial<EntryInput> = {};
    if (draft.amount.trim() !== entry.amount) patch.amount = draft.amount.trim();
    if (draft.occurred_on !== entry.occurred_on) patch.occurred_on = draft.occurred_on;
    if (draft.category_id !== entry.category_id) patch.category_id = draft.category_id;
    if (draft.note.trim() !== (entry.note ?? "")) {
      // An emptied note is a deliberate clear, which is null rather than "".
      patch.note = draft.note.trim() === "" ? null : draft.note.trim();
    }
    // The pair travels together (AD-29): both values, or both null to clear.
    const wasQuantified = Boolean(entry.quantity);
    // Compared as milli-units, not as text: "40" and "40.000" are the same quantity, and
    // re-sending an unchanged pair would overwrite an edit made elsewhere.
    const pairChanged =
      draftQuantified !== wasQuantified ||
      (draftQuantified &&
        (toMilli(draft.quantity) !== toMilli(entry.quantity ?? "0") ||
          draft.unit !== entry.unit));
    if (pairChanged) {
      if (draftQuantified && draft.unit) {
        patch.quantity = draft.quantity.trim();
        patch.unit = draft.unit;
      } else {
        patch.quantity = null;
        patch.unit = null;
      }
    }

    if (Object.keys(patch).length === 0) {
      setEditing(null);
      return;
    }

    setError(null);
    try {
      await api.updateEntry(entry.id, patch);
      setEditing(null);
      await load();
      toast.show(t("entries.updated"));
    } catch (caught) {
      setError(errorMessage(t, caught, "entries.couldNotSaveChange"));
    }
  }

  async function remove(entry: Entry) {
    setError(null);
    try {
      await api.deleteEntry(entry.id);
      await load();
      // Undo rather than a confirmation dialog: the common case stays one tap, and the
      // rare mis-tap is recoverable. A confirm would tax every deliberate delete to
      // protect against the occasional accident.
      toast.show(t("entries.deleted", { amount: money.amount(entry.amount) }), {
        onUndo: async () => {
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
      setError(errorMessage(t, caught, "entries.couldNotDelete"));
    }
  }

  const quantitySectionOpen = kind === "expense" && (showQuantity || quantity !== "" || unit !== "");

  return (
    <>
      <ErrorBanner message={error} />

      <Card title={t("entries.record")}>
        <form className="row" onSubmit={submit} aria-label={t("entries.record")}>
          <label style={{ flex: "0 0 120px" }}>
            {t("entries.kind")}
            <select
              aria-label={t("entries.kind")}
              value={kind}
              onChange={(event) => {
                const next = event.target.value as EntryKind;
                setKind(next);
                // Only an expense buys something. Drop the section rather than send a
                // payload the API would refuse.
                if (next === "income") {
                  clearQuantity();
                  setShowQuantity(false);
                }
              }}
            >
              <option value="expense">{t("kind.expense")}</option>
              <option value="income">{t("kind.income")}</option>
            </select>
          </label>

          <label style={{ flex: "0 0 130px" }}>
            {t("field.amount")}
            <input
              ref={amountRef}
              className="num"
              inputMode="decimal"
              placeholder="0.00"
              aria-label={t("entries.amountAria", { currency: money.currency })}
              required
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
            />
          </label>

          <label style={{ flex: "1 1 180px" }}>
            {t("field.category")}
            <input
              list="category-names"
              aria-label={t("field.category")}
              placeholder={t("entries.categoryPlaceholder")}
              required
              value={categoryName}
              onChange={(event) => onCategoryNameChange(event.target.value)}
            />
          </label>
          <datalist id="category-names">
            {categories
              .filter((category) => category.kind === kind)
              .map((category) => (
                <option key={category.id} value={category.name} />
              ))}
          </datalist>

          <label style={{ flex: "0 0 150px" }}>
            {t("field.date")}
            <input
              type="date"
              aria-label={t("field.date")}
              required
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </label>

          <label style={{ flex: "1 1 140px" }}>
            {t("entries.vendor")}
            <input
              list="vendor-names"
              aria-label={t("entries.vendor")}
              placeholder={t("entries.vendorPlaceholder")}
              value={vendorName}
              onChange={(event) => setVendorName(event.target.value)}
            />
          </label>
          <datalist id="vendor-names">
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.name} />
            ))}
          </datalist>

          <label style={{ flex: "1 1 160px" }}>
            {t("field.note")}
            <input
              aria-label={t("field.note")}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          {kind === "expense" && !quantitySectionOpen && (
            <button
              type="button"
              className="quiet"
              onClick={() => setShowQuantity(true)}
              aria-expanded={false}
            >
              {t("entries.addQuantity")}
            </button>
          )}

          {quantitySectionOpen && (
            <div
              className="row quantity-row"
              role="group"
              aria-label={t("entries.quantityDetails")}
            >
              <label style={{ flex: "0 0 120px" }}>
                {t("field.quantity")}
                <input
                  className="num"
                  inputMode="decimal"
                  placeholder={t("entries.quantityPlaceholder")}
                  aria-label={t("field.quantity")}
                  value={quantity}
                  onChange={(event) => onQuantityChange(event.target.value)}
                />
              </label>
              <label style={{ flex: "0 0 110px" }}>
                {t("entries.unit")}
                <select
                  aria-label={t("entries.unit")}
                  value={unit}
                  onChange={(event) => setUnit(event.target.value as Unit | "")}
                >
                  <option value="">—</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {unitLabel(u, t)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ flex: "0 0 130px" }}>
                {t("entries.unitPrice")}
                <input
                  className="num"
                  inputMode="decimal"
                  placeholder="1.4990"
                  aria-label={t("entries.unitPriceAria", { currency: money.currency })}
                  value={rate}
                  onChange={(event) => onRateChange(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  clearQuantity();
                  setShowQuantity(false);
                  setUnitDismissed(true);
                }}
                aria-label={t("entries.removeQuantity")}
              >
                ×
              </button>
            </div>
          )}

          <button type="submit" disabled={saving}>
            {saving ? t("entries.saving") : t("action.add")}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 8 }}>
          {t("entries.formHint")}
          {quantitySectionOpen && t("entries.formHintQuantity")}
        </p>
      </Card>

      <Card title={t("entries.title")}>
        {/* A filter bar, not a header action: four controls and a note do not belong on the
            same baseline as a card title, which is what wrapped them into two ragged rows.
            A grid rather than flex bases, so it reflows on its own instead of being tuned. */}
        <div className="filters">
          <label>
            {t("entries.kind")}
            <select
              aria-label={t("entries.filterKind")}
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as EntryKind | "")}
            >
              <option value="">{t("entries.filterAll")}</option>
              <option value="expense">{t("kind.expense")}</option>
              <option value="income">{t("kind.income")}</option>
            </select>
          </label>
          <label>
            {t("field.month")}
            <input
              type="month"
              aria-label={t("entries.filterMonth")}
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
            />
          </label>
          <label>
            {t("field.category")}
            <select
              aria-label={t("entries.filterCategory")}
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="">{t("entries.filterAll")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("entries.search")}
            <input
              type="search"
              aria-label={t("entries.searchAria")}
              placeholder={t("entries.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {/* Its own full-width line: inside the Month label it made that one control taller
              than the other three and broke the row's alignment. */}
          {dates.monthRange(monthFilter, startDay) && (
            <p className="filter-note hint">
              {t("entries.monthRuns", {
                month: dates.month(monthFilter),
                range: dates.monthRange(monthFilter, startDay),
              })}
            </p>
          )}
        </div>

        {loading ? (
          <p className="empty">{t("state.loading")}</p>
        ) : entries.length === 0 ? (
          <Empty>
            {search.trim()
              ? t("entries.noneMatching", { search: search.trim() })
              : t("entries.noneForFilter")}
          </Empty>
        ) : (
          <TableWrap>
            <table className="stacked" aria-label={t("entries.title")}>
              <thead>
                <tr>
                  <th>{t("field.date")}</th>
                  <th>{t("entries.kind")}</th>
                  <th>{t("field.category")}</th>
                  <th className="num">
                    {t("entries.colAmount", { symbol: money.symbol })}
                  </th>
                  <th>{t("field.note")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) =>
                  editing === entry.id && draft ? (
                    <tr key={entry.id}>
                      <td data-label={t("field.date")}>
                        <input
                          type="date"
                          aria-label={t("entries.editDate")}
                          value={draft.occurred_on}
                          onChange={(event) =>
                            setDraft({ ...draft, occurred_on: event.target.value })
                          }
                        />
                      </td>
                      {/* Kind is shown, never edited. It is bound to the category by a
                          single foreign key (AD-7), so changing it would have to move the
                          entry to a different category at the same time. Delete and re-add
                          is the honest path, and the API refuses it for the same reason. */}
                      <td
                        data-label={t("entries.kind")}
                        style={{
                          color: entry.kind === "income" ? "var(--accent)" : "var(--spend)",
                        }}
                      >
                        {t(`kind.${entry.kind}` as MessageKey)}
                      </td>
                      <td data-label={t("field.category")}>
                        <select
                          aria-label={t("entries.editCategory")}
                          value={draft.category_id}
                          onChange={(event) =>
                            setDraft({ ...draft, category_id: event.target.value })
                          }
                        >
                          {categories
                            // Same kind only. The database refuses a mismatch anyway, so
                            // offering one would just be a 404 waiting to happen.
                            .filter((category) => category.kind === entry.kind)
                            .map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="num" data-label={t("entries.colAmountShort")}>
                        <input
                          className="num"
                          inputMode="decimal"
                          aria-label={t("entries.editAmount")}
                          value={draft.amount}
                          onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                        />
                        {entry.kind === "expense" && (
                          <div className="row" style={{ flexWrap: "nowrap", gap: 6, marginTop: 6 }}>
                            <input
                              className="num"
                              inputMode="decimal"
                              placeholder={t("entries.quantityShort")}
                              aria-label={t("entries.editQuantity")}
                              value={draft.quantity}
                              onChange={(event) =>
                                setDraft({ ...draft, quantity: event.target.value })
                              }
                            />
                            <select
                              aria-label={t("entries.editUnit")}
                              value={draft.unit}
                              onChange={(event) =>
                                setDraft({ ...draft, unit: event.target.value as Unit | "" })
                              }
                            >
                              <option value="">—</option>
                              {UNITS.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>
                      <td className="wrap" data-label={t("field.note")}>
                        <input
                          aria-label={t("entries.editNote")}
                          value={draft.note}
                          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                        />
                      </td>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                          <button type="button" onClick={() => void saveEdit(entry)}>
                            {t("action.save")}
                          </button>
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => setEditing(null)}
                          >
                            {t("action.cancel")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={entry.id}>
                      <td data-label={t("field.date")}>{entry.occurred_on}</td>
                      <td
                        data-label={t("entries.kind")}
                        style={{
                          color: entry.kind === "income" ? "var(--accent)" : "var(--spend)",
                        }}
                      >
                        {t(`kind.${entry.kind}` as MessageKey)}
                      </td>
                      <td data-label={t("field.category")}>
                        <Link to={`/categories/${entry.category_id}`}>
                          {nameOf(entry.category_id)}
                        </Link>
                      </td>
                      <td className="num" data-label={t("entries.colAmountShort")}>
                        {money.plain(entry.amount)}
                        {entry.quantity && entry.unit && entry.unit_price && (
                          <div className="hint rate" title={`${formatQuantity(entry.quantity)} ${entry.unit}`}>
                            {formatRate(entry.unit_price, entry.unit)}
                          </div>
                        )}
                      </td>
                      <td className="wrap" data-label={t("field.note")}>
                        {entry.note ?? ""}
                      </td>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => beginEdit(entry)}
                            aria-label={t("entries.editRow", {
                              amount: entry.amount,
                              date: entry.occurred_on,
                            })}
                          >
                            {t("action.edit")}
                          </button>
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => void remove(entry)}
                            aria-label={t("entries.deleteRow", {
                              amount: entry.amount,
                              date: entry.occurred_on,
                            })}
                          >
                            {t("action.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
