/**
 * Savings pots (Epic 34, AD-50): each savings type as a pot with a balance, this budget
 * month's progress against its target, what is still due, and an optional goal.
 *
 * What is due is **proposed**, never recorded on its own: "Put aside" writes one ordinary
 * contribution, "Skip" remembers the month. Same rule as recurring entries — money that
 * was not moved must not appear to have been.
 */

import { type FormEvent, useState } from "react";

import { api } from "../api/client";
import type { MovementKind, Pot, SavingsOverview } from "../api/types";
import { useOptionalAuth } from "../auth/AuthContext";
import { ProgressBar } from "../charts/ProgressBar";
import { errorMessage } from "../i18n/errors";
import { type MessageKey, useT } from "../i18n";
import {
  isNonNegativeMoney,
  isPositiveMoney,
  normalizeMoney,
  progress,
  toCents,
} from "../money";
import { shiftMonth, todayIso } from "../months";
import { useDates } from "../useDates";
import { useLoad } from "../useLoad";
import { useMoney } from "../useMoney";
import { useToast } from "./Toast";
import { Card, Empty, ErrorBanner, TableWrap } from "./ui";

type Place = "pots" | "record";

const NOTHING = {
  overview: null as SavingsOverview | null,
  contributions: [] as Awaited<ReturnType<typeof api.listContributions>>,
};

/** The day a confirmation is dated: today in the current month, else the month's last day. */
export function confirmDate(overview: SavingsOverview, today = todayIso()): string {
  if (overview.month === overview.current_month) return today;
  const end = new Date(`${overview.end}T00:00:00`);
  end.setDate(end.getDate() - 1);
  const month = String(end.getMonth() + 1).padStart(2, "0");
  const day = String(end.getDate()).padStart(2, "0");
  return `${end.getFullYear()}-${month}-${day}`;
}

export function SavingsCard() {
  const t = useT();
  const money = useMoney();
  const dates = useDates();
  const toast = useToast();
  const startDay = useOptionalAuth()?.user?.budget_start_day ?? 1;

  // Null until the first answer, which says which month is current for this account.
  const [month, setMonth] = useState<string | null>(null);
  const [error, setError] = useState<{ at: Place; message: string } | null>(null);
  const errorIn = (at: Place) => (error?.at === at ? error.message : null);

  const [newPot, setNewPot] = useState("");
  const [recordType, setRecordType] = useState("");
  const [recordKind, setRecordKind] = useState<MovementKind>("deposit");
  const [recordAmount, setRecordAmount] = useState("");
  const [recordDate, setRecordDate] = useState(todayIso());

  const {
    data: { overview, contributions },
    loading,
    failure,
    reload,
  } = useLoad(
    async () => {
      const overview = await api.savingsOverview(month ?? undefined);
      const contributions = await api.listContributions({ month: overview.month });
      return { overview, contributions };
    },
    NOTHING,
    [month],
    "pots.couldNotLoad",
  );

  async function guard(at: Place, action: () => Promise<unknown>, fallback: MessageKey) {
    setError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (caught) {
      setError({ at, message: errorMessage(t, caught, fallback) });
      return false;
    }
  }

  if (!overview) {
    return (
      <Card title={t("pots.title")}>
        {loading ? <Empty>{t("state.loading")}</Empty> : <ErrorBanner message={failure} />}
      </Card>
    );
  }

  const pots = overview.pots;
  const viewed = overview.month;
  const typeName = (id: string) => pots.find((p) => p.savings_type_id === id)?.name ?? "—";

  async function addPot(event: FormEvent) {
    event.preventDefault();
    const name = newPot.trim();
    if (!name) return;
    await guard(
      "pots",
      async () => {
        await api.createSavingsType(name);
        setNewPot("");
      },
      "plan.couldNotCreateType",
    );
  }

  async function record(event: FormEvent) {
    event.preventDefault();
    if (!isPositiveMoney(recordAmount)) {
      setError({ at: "record", message: t("entries.badAmount") });
      return;
    }
    await guard(
      "record",
      async () => {
        await api.createContribution({
          savings_type_id: recordType || pots[0]?.savings_type_id || "",
          kind: recordKind,
          amount: normalizeMoney(recordAmount),
          occurred_on: recordDate,
        });
        setRecordAmount("");
      },
      "plan.couldNotRecordContribution",
    );
  }

  return (
    <>
      <Card title={t("pots.title")}>
        <div className="month-nav" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="quiet"
            aria-label={t("month.previous")}
            onClick={() => setMonth(shiftMonth(viewed, -1))}
          >
            ←
          </button>
          <strong>{dates.month(viewed)}</strong>
          <button
            type="button"
            className="quiet"
            aria-label={t("month.next")}
            // Nothing is due in a month that has not started.
            disabled={viewed >= overview.current_month}
            onClick={() => setMonth(shiftMonth(viewed, 1))}
          >
            →
          </button>
        </div>
        {startDay !== 1 && <p className="hint">{dates.monthRange(viewed, startDay)}</p>}

        <ErrorBanner message={failure ?? errorIn("pots")} />

        {pots.length === 0 ? (
          <Empty>{t("plan.noTypes")}</Empty>
        ) : (
          <ul className="pots">
            {pots.map((pot) => (
              <PotRow
                key={pot.savings_type_id}
                pot={pot}
                month={viewed}
                confirmOn={confirmDate(overview)}
                guard={guard}
                onError={(message) => setError({ at: "pots", message })}
                toastPutAside={(amount) =>
                  toast.show(t("pots.putAside", { amount: money.amount(amount) }))
                }
              />
            ))}
          </ul>
        )}

        <form className="row" onSubmit={addPot} style={{ marginTop: 12 }}>
          <label style={{ flex: "1 1 160px" }}>
            {t("plan.newType")}
            <input
              aria-label={t("plan.newType")}
              value={newPot}
              onChange={(event) => setNewPot(event.target.value)}
            />
          </label>
          <button type="submit">{t("action.add")}</button>
        </form>
      </Card>

      <Card title={t("pots.record")}>
        <ErrorBanner message={errorIn("record")} />
        <form className="row" onSubmit={record}>
          <label style={{ flex: "1 1 140px" }}>
            {t("dash.colType")}
            <select
              aria-label={t("plan.savingsType")}
              value={recordType || pots[0]?.savings_type_id || ""}
              onChange={(event) => setRecordType(event.target.value)}
            >
              {pots.map((pot) => (
                <option key={pot.savings_type_id} value={pot.savings_type_id}>
                  {pot.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: "1 1 120px" }}>
            {t("pots.colMove")}
            <select
              aria-label={t("pots.kind")}
              value={recordKind}
              onChange={(event) => setRecordKind(event.target.value as MovementKind)}
            >
              <option value="deposit">{t("pots.deposit")}</option>
              <option value="withdrawal">{t("pots.withdrawal")}</option>
            </select>
          </label>
          <label style={{ flex: "0 0 120px" }}>
            {t("field.amount")}
            <input
              className="num"
              inputMode="decimal"
              placeholder="0.00"
              aria-label={t("plan.contributionAmount")}
              required
              value={recordAmount}
              onChange={(event) => setRecordAmount(event.target.value)}
            />
          </label>
          <label style={{ flex: "0 0 150px" }}>
            {t("field.date")}
            <input
              type="date"
              aria-label={t("plan.contributionDate")}
              required
              value={recordDate}
              onChange={(event) => setRecordDate(event.target.value)}
            />
          </label>
          <button type="submit" disabled={pots.length === 0}>
            {t("action.add")}
          </button>
        </form>

        {contributions.length === 0 ? (
          <Empty>{t("pots.nothingMoved", { month: dates.month(viewed) })}</Empty>
        ) : (
          <TableWrap>
            <table className="stacked" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>{t("field.date")}</th>
                  <th>{t("dash.colType")}</th>
                  <th className="num">{t("entries.colAmount", { symbol: money.symbol })}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contributions.map((contribution) => {
                  const out = contribution.kind === "withdrawal";
                  return (
                    <tr key={contribution.id}>
                      <td data-label={t("field.date")}>{contribution.occurred_on}</td>
                      <td data-label={t("dash.colType")}>
                        {typeName(contribution.savings_type_id)}
                        {out && <span className="tag">{t("pots.withdrawal")}</span>}
                      </td>
                      <td
                        className="num"
                        data-label={t("entries.colAmountShort")}
                        style={out ? { color: "var(--spend)" } : undefined}
                      >
                        {out ? "−" : ""}
                        {money.plain(contribution.amount)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() =>
                            void guard(
                              "record",
                              async () => {
                                await api.deleteContribution(contribution.id);
                                toast.show(
                                  t("entries.deleted", {
                                    amount: money.amount(contribution.amount),
                                  }),
                                  {
                                    onUndo: async () => {
                                      await api.createContribution({
                                        savings_type_id: contribution.savings_type_id,
                                        kind: contribution.kind ?? "deposit",
                                        amount: contribution.amount,
                                        occurred_on: contribution.occurred_on,
                                      });
                                      await reload();
                                    },
                                  },
                                );
                              },
                              "plan.couldNotDeleteContribution",
                            )
                          }
                        >
                          {t("action.delete")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

function PotRow({
  pot,
  month,
  confirmOn,
  guard,
  onError,
  toastPutAside,
}: {
  pot: Pot;
  month: string;
  confirmOn: string;
  guard: (at: Place, action: () => Promise<unknown>, fallback: MessageKey) => Promise<boolean>;
  onError: (message: string) => void;
  toastPutAside: (amount: string) => void;
}) {
  const t = useT();
  const money = useMoney();
  const dates = useDates();
  const [dueDraft, setDueDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const name = pot.name;
  const monthPercent = pot.target === null ? null : progress(pot.saved, pot.target);
  const goalPercent = pot.goal_amount === null ? null : progress(pot.balance, pot.goal_amount);
  const dueValue = dueDraft ?? pot.due ?? "";

  async function putAside() {
    if (!isPositiveMoney(dueValue)) {
      onError(t("entries.badAmount"));
      return;
    }
    const amount = normalizeMoney(dueValue);
    const done = await guard(
      "pots",
      () =>
        api.createContribution({
          savings_type_id: pot.savings_type_id,
          amount,
          occurred_on: confirmOn,
        }),
      "plan.couldNotRecordContribution",
    );
    if (done) {
      setDueDraft(null);
      toastPutAside(amount);
    }
  }

  return (
    <li className="pot">
      <div className="pot-head">
        <strong>{name}</strong>
        <span className="num">{t("pots.balance", { amount: money.amount(pot.balance) })}</span>
        <button
          type="button"
          className="quiet"
          aria-expanded={editing}
          aria-label={t(editing ? "pots.close" : "pots.editFor", { name })}
          onClick={() => setEditing((was) => !was)}
        >
          {t(editing ? "pots.close" : "pots.edit")}
        </button>
      </div>

      <div className="pot-line">
        <span className="hint">
          {pot.target === null
            ? t("pots.savedThisMonth", { saved: money.amount(pot.saved) })
            : t("pots.thisMonth", {
                saved: money.amount(pot.saved),
                target: money.amount(pot.target),
              })}
        </span>
        {monthPercent !== null && (
          <ProgressBar
            percent={monthPercent}
            over={false}
            label={t("pots.progressFor", { name })}
          />
        )}
      </div>

      {pot.goal_amount !== null && (
        <div className="pot-line">
          <span className="hint">
            {pot.goal_date
              ? t("pots.goalBy", {
                  amount: money.amount(pot.goal_amount),
                  date: dates.dayAcrossYears(pot.goal_date),
                })
              : t("pots.goal", { amount: money.amount(pot.goal_amount) })}
            {" · "}
            {goalPercent !== null && goalPercent >= 100
              ? t("pots.goalReached")
              : pot.needed_per_month
                ? t("pots.needed", { amount: money.amount(pot.needed_per_month) })
                : null}
          </span>
          <ProgressBar percent={goalPercent} over={false} label={t("pots.goalFor", { name })} />
        </div>
      )}

      {pot.due !== null && (
        <div className="row pot-due">
          <span>{t("pots.due", { amount: money.amount(pot.due) })}</span>
          <input
            className="num"
            inputMode="decimal"
            aria-label={t("pots.dueAmountFor", { name })}
            value={dueValue}
            onChange={(event) => setDueDraft(event.target.value)}
            style={{ width: 110 }}
          />
          <button type="button" aria-label={t("pots.confirmFor", { name })} onClick={putAside}>
            {t("pots.confirm")}
          </button>
          <button
            type="button"
            className="quiet"
            aria-label={t("pots.skipFor", { name })}
            onClick={() =>
              void guard(
                "pots",
                () => api.skipSavingsMonth(pot.savings_type_id, month),
                "pots.couldNotSkip",
              )
            }
          >
            {t("recurring.skip")}
          </button>
        </div>
      )}
      {pot.skipped && (
        <div className="row pot-due">
          <span className="hint">{t("pots.skippedNote")}</span>
          <button
            type="button"
            className="quiet"
            aria-label={t("pots.unskipFor", { name })}
            onClick={() =>
              void guard(
                "pots",
                () => api.unskipSavingsMonth(pot.savings_type_id, month),
                "pots.couldNotSkip",
              )
            }
          >
            {t("pots.unskip")}
          </button>
        </div>
      )}

      {editing && (
        <PotEditor pot={pot} guard={guard} onError={onError} onDone={() => setEditing(false)} />
      )}
    </li>
  );
}

function PotEditor({
  pot,
  guard,
  onError,
  onDone,
}: {
  pot: Pot;
  guard: (at: Place, action: () => Promise<unknown>, fallback: MessageKey) => Promise<boolean>;
  onError: (message: string) => void;
  onDone: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(pot.name);
  const [target, setTarget] = useState(pot.target ?? "");
  const [goalAmount, setGoalAmount] = useState(pot.goal_amount ?? "");
  const [goalDate, setGoalDate] = useState(pot.goal_date ?? "");

  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmedTarget = normalizeMoney(target);
    const trimmedGoal = normalizeMoney(goalAmount);
    if (trimmedTarget !== "" && !isNonNegativeMoney(trimmedTarget)) {
      onError(t("plan.badAmountZeroOrMore"));
      return;
    }
    if (trimmedGoal !== "" && !isPositiveMoney(trimmedGoal)) {
      onError(t("entries.badAmount"));
      return;
    }
    if (goalDate && trimmedGoal === "") {
      onError(t("error.savings_goal_date_needs_amount"));
      return;
    }

    const patch: { name?: string; goal_amount?: string | null; goal_date?: string | null } = {};
    if (name.trim() && name.trim() !== pot.name) patch.name = name.trim();
    const goal = trimmedGoal === "" ? null : trimmedGoal;
    const goalChanged =
      goal === null
        ? pot.goal_amount !== null
        : pot.goal_amount === null || toCents(goal) !== toCents(pot.goal_amount);
    if (goalChanged) patch.goal_amount = goal;
    // An empty date input is "", which is a 422 for a date field; empty means none.
    if ((goalDate || null) !== pot.goal_date) patch.goal_date = goalDate || null;
    // A target cannot be removed, only set (AD-11); emptying the field sets it to zero,
    // which proposes nothing.
    const newTarget = trimmedTarget === "" ? (pot.target === null ? null : "0.00") : trimmedTarget;
    const targetChanged =
      newTarget !== null &&
      (pot.target === null || toCents(newTarget) !== toCents(pot.target));

    const done = await guard(
      "pots",
      async () => {
        if (Object.keys(patch).length > 0) {
          await api.updateSavingsType(pot.savings_type_id, patch);
        }
        if (targetChanged && newTarget !== null) {
          await api.setTarget(pot.savings_type_id, newTarget);
        }
      },
      "pots.couldNotSave",
    );
    if (done) {
      toast.show(t("pots.saved"));
      onDone();
    }
  }

  return (
    <form className="pot-editor" onSubmit={save}>
      <div className="row">
        <label style={{ flex: "1 1 160px" }}>
          {t("field.name")}
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label style={{ flex: "0 0 130px" }}>
          {t("pots.monthlyTarget")}
          <input
            className="num"
            inputMode="decimal"
            placeholder={t("plan.notSetPlaceholder")}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          />
        </label>
      </div>
      <div className="row">
        <label style={{ flex: "0 0 130px" }}>
          {t("pots.goalAmount")}
          <input
            className="num"
            inputMode="decimal"
            placeholder={t("plan.notSetPlaceholder")}
            value={goalAmount}
            onChange={(event) => setGoalAmount(event.target.value)}
          />
        </label>
        <label style={{ flex: "0 0 160px" }}>
          {t("pots.goalDate")}
          <input
            type="date"
            value={goalDate}
            onChange={(event) => setGoalDate(event.target.value)}
          />
        </label>
      </div>
      <p className="hint">{t("pots.goalHint")}</p>
      <div className="row">
        <button type="submit">{t("action.save")}</button>
        <button
          type="button"
          className="quiet"
          aria-label={t("plan.deleteNamed", { name: pot.name })}
          onClick={() =>
            void guard(
              "pots",
              () => api.deleteSavingsType(pot.savings_type_id),
              "plan.couldNotDeleteType",
            )
          }
        >
          {t("action.delete")}
        </button>
      </div>
    </form>
  );
}
