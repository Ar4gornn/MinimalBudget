import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api } from "../api/client";
import { CADENCE_LABELS, type Cadence, type Category, type EntryKind, type PendingEntry, type RecurringTemplate } from "../api/types";
import { isPositiveMoney } from "../money";
import { useMoney } from "../useMoney";
import { todayIso } from "../months";
import { Card, Empty, ErrorBanner, TableWrap } from "./ui";
import { useToast } from "./Toast";

/**
 * Recurring templates and the proposals they produce (Epic 13).
 *
 * Proposals come first and templates second, because a proposal is a thing to decide and a
 * template is a thing to file. Nothing is created by opening this: the pending list is
 * materialised on read, and an entry appears only when a person says yes — or when the
 * template opted in to automatic creation.
 */
export function RecurringCard({ onChanged }: { onChanged?: () => void }) {
  const money = useMoney();
  const toast = useToast();

  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [kind, setKind] = useState<EntryKind>("expense");
  const [amount, setAmount] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [startOn, setStartOn] = useState(todayIso());
  const [auto, setAuto] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // A proposal's amount can be corrected before confirming: the electricity bill is never
  // quite the template's figure, and editing the template would be the wrong fix.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPending, nextTemplates, nextCategories] = await Promise.all([
        api.listPending(),
        api.listTemplates(),
        api.listCategories(),
      ]);
      setPending(nextPending);
      setTemplates(nextTemplates);
      setCategories(nextCategories);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load recurring entries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = useMemo(() => {
    const lookup = new Map(categories.map((category) => [category.id, category.name]));
    return (id: string) => lookup.get(id) ?? "—";
  }, [categories]);

  async function run(id: string, action: () => Promise<unknown>, fallback: string) {
    setBusy(id);
    setError(null);
    try {
      await action();
      await load();
      onChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    } finally {
      setBusy(null);
    }
  }

  async function confirm(proposal: PendingEntry) {
    const draft = (drafts[proposal.id] ?? "").trim();
    if (draft && !isPositiveMoney(draft)) {
      setError("Enter an amount with at most two decimal places, greater than zero.");
      return;
    }
    await run(
      proposal.id,
      async () => {
        await api.confirmPending(proposal.id, draft && draft !== proposal.amount ? draft : undefined);
        toast.show(`Added ${money.amount(draft || proposal.amount)}`);
      },
      "Could not confirm that entry.",
    );
  }

  async function skip(proposal: PendingEntry) {
    await run(
      proposal.id,
      async () => {
        await api.skipPending(proposal.id);
        toast.show("Skipped");
      },
      "Could not skip that entry.",
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isPositiveMoney(amount)) {
      setError("Enter an amount with at most two decimal places, greater than zero.");
      return;
    }
    if (!categoryName.trim()) {
      setError("A recurring entry needs a category.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createTemplate({
        kind,
        amount: amount.trim(),
        cadence,
        start_on: startOn,
        auto,
        category_name: categoryName.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setAmount("");
      setNote("");
      await load();
      onChanged?.();
      toast.show("Recurring entry saved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Recurring"
      collapseKey="plan.recurring"
      summary={
        pending.length > 0
          ? `${pending.length} to confirm`
          : `${templates.length} ${templates.length === 1 ? "template" : "templates"}`
      }
    >
      <ErrorBanner message={error} />

      {pending.length > 0 && (
        <TableWrap>
          <table className="stacked" aria-label="Entries to confirm">
            <thead>
              <tr>
                <th>Due</th>
                <th>Category</th>
                <th className="num">Amount ({money.symbol})</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.map((proposal) => (
                <tr key={proposal.id}>
                  <td data-label="Due">{proposal.due_on}</td>
                  <td data-label="Category">
                    {proposal.category_name}
                    {proposal.note ? <span className="hint"> · {proposal.note}</span> : null}
                  </td>
                  <td className="num" data-label="Amount">
                    <input
                      className="num"
                      inputMode="decimal"
                      aria-label={`Amount for ${proposal.category_name} due ${proposal.due_on}`}
                      value={drafts[proposal.id] ?? proposal.amount}
                      onChange={(event) =>
                        setDrafts({ ...drafts, [proposal.id]: event.target.value })
                      }
                    />
                  </td>
                  <td>
                    <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                      <button
                        type="button"
                        disabled={busy === proposal.id}
                        onClick={() => void confirm(proposal)}
                        // Named for its row: the card also has a form whose submit button
                        // says "Add", and "which Add?" is a fair question to ask of a screen
                        // reader as much as of a test.
                        aria-label={`Add ${proposal.category_name} due ${proposal.due_on}`}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        className="quiet"
                        disabled={busy === proposal.id}
                        onClick={() => void skip(proposal)}
                        aria-label={`Skip ${proposal.category_name} due ${proposal.due_on}`}
                      >
                        Skip
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <form className="row" onSubmit={submit} aria-label="Add a recurring entry">
        <label style={{ flex: "0 0 120px" }}>
          Kind
          <select
            aria-label="Recurring kind"
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
            className="num"
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Recurring amount"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label style={{ flex: "1 1 160px" }}>
          Category
          <input
            list="recurring-category-names"
            aria-label="Recurring category"
            placeholder="Rent, Salary…"
            required
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
          />
        </label>
        <datalist id="recurring-category-names">
          {categories
            .filter((category) => category.kind === kind)
            .map((category) => (
              <option key={category.id} value={category.name} />
            ))}
        </datalist>
        <label style={{ flex: "0 0 150px" }}>
          How often
          <select
            aria-label="How often"
            value={cadence}
            onChange={(event) => setCadence(event.target.value as Cadence)}
          >
            {(Object.keys(CADENCE_LABELS) as Cadence[]).map((value) => (
              <option key={value} value={value}>
                {CADENCE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: "0 0 150px" }}>
          First due
          <input
            type="date"
            aria-label="First due"
            required
            value={startOn}
            onChange={(event) => setStartOn(event.target.value)}
          />
        </label>
        <label style={{ flex: "1 1 140px" }}>
          Note
          <input
            aria-label="Recurring note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <label className="check" style={{ flex: "0 0 auto" }}>
          <input
            type="checkbox"
            checked={auto}
            onChange={(event) => setAuto(event.target.checked)}
          />
          Add automatically
        </label>
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Add"}
        </button>
      </form>
      <p className="hint" style={{ marginTop: 8 }}>
        By default a recurring entry is <em>proposed</em> on its due date and waits for you.
        Tick "add automatically" only for a fixed amount like rent — a wrong amount created
        silently is worse than one not created at all.
      </p>

      {loading && templates.length === 0 ? (
        <p className="empty">Loading…</p>
      ) : templates.length === 0 ? (
        <Empty>Nothing recurring yet.</Empty>
      ) : (
        <TableWrap>
          <table className="stacked" aria-label="Recurring templates">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Amount ({money.symbol})</th>
                <th>How often</th>
                <th>Next</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className={template.paused ? "muted" : undefined}>
                  <td data-label="Category">
                    {nameOf(template.category_id)}
                    {template.auto ? <span className="tag">auto</span> : null}
                    {template.paused ? <span className="tag">paused</span> : null}
                  </td>
                  <td className="num" data-label="Amount">
                    {money.plain(template.amount)}
                  </td>
                  <td data-label="How often">{CADENCE_LABELS[template.cadence]}</td>
                  <td data-label="Next">{template.paused ? "—" : template.next_due}</td>
                  <td>
                    <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                      <button
                        type="button"
                        className="quiet"
                        disabled={busy === template.id}
                        onClick={() =>
                          void run(
                            template.id,
                            () => api.updateTemplate(template.id, { paused: !template.paused }),
                            "Could not change that.",
                          )
                        }
                        aria-label={
                          template.paused
                            ? `Resume ${nameOf(template.category_id)}`
                            : `Pause ${nameOf(template.category_id)}`
                        }
                      >
                        {template.paused ? "Resume" : "Pause"}
                      </button>
                      <button
                        type="button"
                        className="quiet"
                        disabled={busy === template.id}
                        onClick={() =>
                          void run(
                            template.id,
                            () => api.deleteTemplate(template.id),
                            "Could not delete that.",
                          )
                        }
                        aria-label={`Delete recurring ${nameOf(template.category_id)}`}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}
