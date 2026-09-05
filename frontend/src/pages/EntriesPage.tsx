import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import type { EntryInput } from "../api/client";
import { UNITS, type Category, type Entry, type EntryKind, type Unit } from "../api/types";
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
import { currentMonth, todayIso } from "../months";

export function EntriesPage() {
  const money = useMoney();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const amountRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [kindFilter, setKindFilter] = useState<EntryKind | "">("");
  const [monthFilter, setMonthFilter] = useState(currentMonth());
  const [categoryFilter, setCategoryFilter] = useState("");
  // Searched on the server, so it looks past the month on screen rather than filtering the
  // rows already fetched — which would quietly answer a different question.
  const [search, setSearch] = useState("");

  const [kind, setKind] = useState<EntryKind>("expense");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [categoryName, setCategoryName] = useState("");
  const [note, setNote] = useState("");
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
      const [nextEntries, nextCategories] = await Promise.all([
        api.listEntries({
          ...(kindFilter ? { kind: kindFilter } : {}),
          ...(monthFilter ? { month: monthFilter } : {}),
          ...(categoryFilter ? { category_id: categoryFilter } : {}),
          ...(search.trim() ? { q: search.trim() } : {}),
        }),
        api.listCategories(),
      ]);
      setEntries(nextEntries);
      setCategories(nextCategories);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load entries.");
    } finally {
      setLoading(false);
    }
  }, [kindFilter, monthFilter, categoryFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  // Arriving from the quick-add button: focus the amount so the keyboard opens straight
  // onto the first thing you would type, then drop the parameter so a refresh is normal.
  useEffect(() => {
    if (searchParams.get("add") !== "1") return;
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
      setError("Enter an amount with at most two decimal places, greater than zero.");
      return;
    }
    const quantified = kind === "expense" && quantity.trim() !== "";
    if (quantified && !isQuantity(quantity)) {
      setError("Enter a quantity with at most three decimal places, greater than zero.");
      return;
    }
    if (quantified && !unit) {
      setError("Choose a unit for the quantity.");
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
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(quantified && unit ? { quantity: quantity.trim(), unit } : {}),
      });
      if (quantified && unit) rememberUnit(categoryName, unit);
      setAmount("");
      setNote("");
      clearQuantity();
      setUnitDismissed(false);
      await load();
      toast.show("Entry added");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the entry.");
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
      setError("Enter an amount with at most two decimal places, greater than zero.");
      return;
    }
    const draftQuantified = draft.quantity.trim() !== "";
    if (draftQuantified && !isQuantity(draft.quantity)) {
      setError("Enter a quantity with at most three decimal places, greater than zero.");
      return;
    }
    if (draftQuantified && !draft.unit) {
      setError("Choose a unit for the quantity.");
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
      toast.show("Entry updated");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that change.");
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
      toast.show(`Deleted ${money.amount(entry.amount)}`, {
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
      setError(caught instanceof Error ? caught.message : "Could not delete the entry.");
    }
  }

  const quantitySectionOpen = kind === "expense" && (showQuantity || quantity !== "" || unit !== "");

  return (
    <>
      <ErrorBanner message={error} />

      <Card title="Record an entry">
        <form className="row" onSubmit={submit} aria-label="Record an entry">
          <label style={{ flex: "0 0 120px" }}>
            Kind
            <select
              aria-label="Kind"
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
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>

          <label style={{ flex: "0 0 130px" }}>
            Amount
            <input
              ref={amountRef}
              className="num"
              inputMode="decimal"
              placeholder="0.00"
              aria-label={`Amount in ${money.currency}`}
              required
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
            />
          </label>

          <label style={{ flex: "1 1 180px" }}>
            Category
            <input
              list="category-names"
              aria-label="Category"
              placeholder="Rent, Salary…"
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
            Date
            <input
              type="date"
              aria-label="Date"
              required
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </label>

          <label style={{ flex: "1 1 160px" }}>
            Note
            <input
              aria-label="Note"
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
              + Quantity
            </button>
          )}

          {quantitySectionOpen && (
            <div className="row quantity-row" role="group" aria-label="Quantity details">
              <label style={{ flex: "0 0 120px" }}>
                Quantity
                <input
                  className="num"
                  inputMode="decimal"
                  placeholder="40"
                  aria-label="Quantity"
                  value={quantity}
                  onChange={(event) => onQuantityChange(event.target.value)}
                />
              </label>
              <label style={{ flex: "0 0 110px" }}>
                Unit
                <select
                  aria-label="Unit"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value as Unit | "")}
                >
                  <option value="">—</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {unitLabel(u)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ flex: "0 0 130px" }}>
                Unit price
                <input
                  className="num"
                  inputMode="decimal"
                  placeholder="1.4990"
                  aria-label={`Unit price in ${money.currency}`}
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
                aria-label="Remove quantity"
              >
                ×
              </button>
            </div>
          )}

          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Add"}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 8 }}>
          A category that does not exist yet is created as you type it.
          {quantitySectionOpen && " Fill any two of amount, quantity and unit price."}
        </p>
      </Card>

      <Card
        title="Entries"
        actions={
          <div className="row">
            <label style={{ flex: "0 0 120px" }}>
              Kind
              <select
                aria-label="Filter by kind"
                value={kindFilter}
                onChange={(event) => setKindFilter(event.target.value as EntryKind | "")}
              >
                <option value="">All</option>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>
            <label style={{ flex: "0 0 150px" }}>
              Month
              <input
                type="month"
                aria-label="Filter by month"
                value={monthFilter}
                onChange={(event) => setMonthFilter(event.target.value)}
              />
            </label>
            <label style={{ flex: "1 1 160px" }}>
              Search
              <input
                type="search"
                aria-label="Search entries"
                placeholder="note or category"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label style={{ flex: "0 0 170px" }}>
              Category
              <select
                aria-label="Filter by category"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="">All</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      >
        {loading ? (
          <p className="empty">Loading…</p>
        ) : entries.length === 0 ? (
          <Empty>
            {search.trim()
              ? `Nothing matching “${search.trim()}” in this month.`
              : "Nothing recorded for this filter."}
          </Empty>
        ) : (
          <TableWrap>
            <table className="stacked" aria-label="Entries">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Kind</th>
                  <th>Category</th>
                  <th className="num">Amount ({money.symbol})</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) =>
                  editing === entry.id && draft ? (
                    <tr key={entry.id}>
                      <td data-label="Date">
                        <input
                          type="date"
                          aria-label="Edit date"
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
                        data-label="Kind"
                        style={{
                          color: entry.kind === "income" ? "var(--accent)" : "var(--spend)",
                        }}
                      >
                        {entry.kind}
                      </td>
                      <td data-label="Category">
                        <select
                          aria-label="Edit category"
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
                      <td className="num" data-label="Amount">
                        <input
                          className="num"
                          inputMode="decimal"
                          aria-label="Edit amount"
                          value={draft.amount}
                          onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                        />
                        {entry.kind === "expense" && (
                          <div className="row" style={{ flexWrap: "nowrap", gap: 6, marginTop: 6 }}>
                            <input
                              className="num"
                              inputMode="decimal"
                              placeholder="qty"
                              aria-label="Edit quantity"
                              value={draft.quantity}
                              onChange={(event) =>
                                setDraft({ ...draft, quantity: event.target.value })
                              }
                            />
                            <select
                              aria-label="Edit unit"
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
                      <td className="wrap" data-label="Note">
                        <input
                          aria-label="Edit note"
                          value={draft.note}
                          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                        />
                      </td>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                          <button type="button" onClick={() => void saveEdit(entry)}>
                            Save
                          </button>
                          <button type="button" className="quiet" onClick={() => setEditing(null)}>
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={entry.id}>
                      <td data-label="Date">{entry.occurred_on}</td>
                      <td
                        data-label="Kind"
                        style={{
                          color: entry.kind === "income" ? "var(--accent)" : "var(--spend)",
                        }}
                      >
                        {entry.kind}
                      </td>
                      <td data-label="Category">
                        <Link to={`/categories/${entry.category_id}`}>
                          {nameOf(entry.category_id)}
                        </Link>
                      </td>
                      <td className="num" data-label="Amount">
                        {money.plain(entry.amount)}
                        {entry.quantity && entry.unit && entry.unit_price && (
                          <div className="hint rate" title={`${formatQuantity(entry.quantity)} ${entry.unit}`}>
                            {formatRate(entry.unit_price, entry.unit)}
                          </div>
                        )}
                      </td>
                      <td className="wrap" data-label="Note">
                        {entry.note ?? ""}
                      </td>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => beginEdit(entry)}
                            aria-label={`Edit entry of ${entry.amount} on ${entry.occurred_on}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => void remove(entry)}
                            aria-label={`Delete entry of ${entry.amount} on ${entry.occurred_on}`}
                          >
                            Delete
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
