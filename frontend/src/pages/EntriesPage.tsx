import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import type { Category, Entry, EntryKind } from "../api/types";
import { Card, Empty, ErrorBanner, TableWrap } from "../components/ui";
import { useToast } from "../components/Toast";
import {isPositiveMoney } from "../money";
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

  const [kind, setKind] = useState<EntryKind>("expense");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [categoryName, setCategoryName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextEntries, nextCategories] = await Promise.all([
        api.listEntries({
          ...(kindFilter ? { kind: kindFilter } : {}),
          ...(monthFilter ? { month: monthFilter } : {}),
          ...(categoryFilter ? { category_id: categoryFilter } : {}),
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
  }, [kindFilter, monthFilter, categoryFilter]);

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isPositiveMoney(amount)) {
      setError("Enter an amount with at most two decimal places, greater than zero.");
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
      });
      setAmount("");
      setNote("");
      await load();
      toast.show("Entry added");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the entry.");
    } finally {
      setSaving(false);
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
          });
          await load();
        },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the entry.");
    }
  }

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
              onChange={(event) => setKind(event.target.value as EntryKind)}
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
              onChange={(event) => setAmount(event.target.value)}
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
              onChange={(event) => setCategoryName(event.target.value)}
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

          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Add"}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 8 }}>
          A category that does not exist yet is created as you type it.
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
          <Empty>Nothing recorded for this filter.</Empty>
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
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Date">{entry.occurred_on}</td>
                    <td data-label="Kind" style={{ color: entry.kind === "income" ? "var(--accent)" : "var(--spend)" }}>
                      {entry.kind}
                    </td>
                    <td data-label="Category">
                      <Link to={`/categories/${entry.category_id}`}>{nameOf(entry.category_id)}</Link>
                    </td>
                    <td className="num" data-label="Amount">{money.plain(entry.amount)}</td>
                    <td className="wrap" data-label="Note">{entry.note ?? ""}</td>
                    <td>
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => void remove(entry)}
                        aria-label={`Delete entry of ${entry.amount} on ${entry.occurred_on}`}
                      >
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
