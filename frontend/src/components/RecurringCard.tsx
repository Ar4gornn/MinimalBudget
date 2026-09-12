import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api } from "../api/client";
import {
  CADENCES,
  type Cadence,
  type Category,
  type EntryKind,
  type PendingEntry,
  type RecurringTemplate,
} from "../api/types";
import { isPositiveMoney } from "../money";
import { useMoney } from "../useMoney";
import { todayIso } from "../months";
import { useT } from "../i18n";
import type { MessageKey } from "../i18n/catalogue";
import { errorMessage } from "../i18n/errors";
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
  const t = useT();
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
      setError(errorMessage(t, caught, "recurring.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = useMemo(() => {
    const lookup = new Map(categories.map((category) => [category.id, category.name]));
    return (id: string) => lookup.get(id) ?? "—";
  }, [categories]);

  async function run(id: string, action: () => Promise<unknown>, fallback: MessageKey) {
    setBusy(id);
    setError(null);
    try {
      await action();
      await load();
      onChanged?.();
    } catch (caught) {
      setError(errorMessage(t, caught, fallback));
    } finally {
      setBusy(null);
    }
  }

  async function confirm(proposal: PendingEntry) {
    const draft = (drafts[proposal.id] ?? "").trim();
    if (draft && !isPositiveMoney(draft)) {
      setError(t("entries.badAmount"));
      return;
    }
    await run(
      proposal.id,
      async () => {
        await api.confirmPending(proposal.id, draft && draft !== proposal.amount ? draft : undefined);
        toast.show(
          t("recurring.added", { amount: money.amount(draft || proposal.amount) }),
        );
      },
      "recurring.couldNotConfirm",
    );
  }

  async function skip(proposal: PendingEntry) {
    await run(
      proposal.id,
      async () => {
        await api.skipPending(proposal.id);
        toast.show(t("recurring.skipped"));
      },
      "recurring.couldNotSkip",
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isPositiveMoney(amount)) {
      setError(t("entries.badAmount"));
      return;
    }
    if (!categoryName.trim()) {
      setError(t("recurring.needCategory"));
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
      toast.show(t("recurring.saved"));
    } catch (caught) {
      setError(errorMessage(t, caught, "recurring.couldNotSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title={t("recurring.title")}
      collapseKey="plan.recurring"
      summary={
        pending.length > 0
          ? t("recurring.toConfirm", { count: pending.length })
          : t.n("recurring.templates", templates.length)
      }
    >
      <ErrorBanner message={error} />

      {pending.length > 0 && (
        <TableWrap>
          <table className="stacked" aria-label={t("recurring.entriesToConfirm")}>
            <thead>
              <tr>
                <th>{t("recurring.colDue")}</th>
                <th>{t("field.category")}</th>
                <th className="num">
                  {t("entries.colAmount", { symbol: money.symbol })}
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.map((proposal) => (
                <tr key={proposal.id}>
                  <td data-label={t("recurring.colDue")}>{proposal.due_on}</td>
                  <td data-label={t("field.category")}>
                    {proposal.category_name}
                    {proposal.note ? <span className="hint"> · {proposal.note}</span> : null}
                  </td>
                  <td className="num" data-label={t("entries.colAmountShort")}>
                    <input
                      className="num"
                      inputMode="decimal"
                      aria-label={t("recurring.amountFor", {
                        name: proposal.category_name,
                        date: proposal.due_on,
                      })}
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
                        aria-label={t("recurring.addFor", {
                          name: proposal.category_name,
                          date: proposal.due_on,
                        })}
                      >
                        {t("action.add")}
                      </button>
                      <button
                        type="button"
                        className="quiet"
                        disabled={busy === proposal.id}
                        onClick={() => void skip(proposal)}
                        aria-label={t("recurring.skipFor", {
                          name: proposal.category_name,
                          date: proposal.due_on,
                        })}
                      >
                        {t("recurring.skip")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <form className="row" onSubmit={submit} aria-label={t("recurring.addForm")}>
        <label style={{ flex: "0 0 120px" }}>
          {t("entries.kind")}
          <select
            aria-label={t("recurring.kind")}
            value={kind}
            onChange={(event) => setKind(event.target.value as EntryKind)}
          >
            <option value="expense">{t("kind.expense")}</option>
            <option value="income">{t("kind.income")}</option>
          </select>
        </label>
        <label style={{ flex: "0 0 130px" }}>
          {t("field.amount")}
          <input
            className="num"
            inputMode="decimal"
            placeholder="0.00"
            aria-label={t("recurring.amount")}
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label style={{ flex: "1 1 160px" }}>
          {t("field.category")}
          <input
            list="recurring-category-names"
            aria-label={t("recurring.category")}
            placeholder={t("entries.categoryPlaceholder")}
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
          {t("recurring.howOften")}
          <select
            aria-label={t("recurring.howOften")}
            value={cadence}
            onChange={(event) => setCadence(event.target.value as Cadence)}
          >
            {CADENCES.map((value) => (
              <option key={value} value={value}>
                {t(`cadence.${value}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: "0 0 150px" }}>
          {t("recurring.firstDue")}
          <input
            type="date"
            aria-label={t("recurring.firstDue")}
            required
            value={startOn}
            onChange={(event) => setStartOn(event.target.value)}
          />
        </label>
        <label style={{ flex: "1 1 140px" }}>
          {t("field.note")}
          <input
            aria-label={t("recurring.note")}
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
          {t("recurring.auto")}
        </label>
        <button type="submit" disabled={saving}>
          {saving ? t("entries.saving") : t("action.add")}
        </button>
      </form>
      <p className="hint" style={{ marginTop: 8 }}>
        {t("recurring.hint")}
      </p>

      {loading && templates.length === 0 ? (
        <p className="empty">{t("state.loading")}</p>
      ) : templates.length === 0 ? (
        <Empty>{t("recurring.none")}</Empty>
      ) : (
        <TableWrap>
          <table className="stacked" aria-label={t("recurring.templatesAria")}>
            <thead>
              <tr>
                <th>{t("field.category")}</th>
                <th className="num">
                  {t("entries.colAmount", { symbol: money.symbol })}
                </th>
                <th>{t("recurring.howOften")}</th>
                <th>{t("recurring.colNext")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className={template.paused ? "muted" : undefined}>
                  <td data-label={t("field.category")}>
                    {nameOf(template.category_id)}
                    {template.auto ? (
                      <span className="tag">{t("recurring.tagAuto")}</span>
                    ) : null}
                    {template.paused ? (
                      <span className="tag">{t("recurring.tagPaused")}</span>
                    ) : null}
                  </td>
                  <td className="num" data-label={t("entries.colAmountShort")}>
                    {money.plain(template.amount)}
                  </td>
                  <td data-label={t("recurring.howOften")}>
                    {t(`cadence.${template.cadence}` as MessageKey)}
                  </td>
                  <td data-label={t("recurring.colNext")}>
                    {template.paused ? "—" : template.next_due}
                  </td>
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
                            "recurring.couldNotChange",
                          )
                        }
                        aria-label={
                          template.paused
                            ? t("recurring.resumeNamed", {
                                name: nameOf(template.category_id),
                              })
                            : t("recurring.pauseNamed", {
                                name: nameOf(template.category_id),
                              })
                        }
                      >
                        {template.paused ? t("recurring.resume") : t("recurring.pause")}
                      </button>
                      <button
                        type="button"
                        className="quiet"
                        disabled={busy === template.id}
                        onClick={() =>
                          void run(
                            template.id,
                            () => api.deleteTemplate(template.id),
                            "recurring.couldNotDelete",
                          )
                        }
                        aria-label={t("recurring.deleteNamed", {
                          name: nameOf(template.category_id),
                        })}
                      >
                        {t("action.delete")}
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
