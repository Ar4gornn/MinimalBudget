import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api } from "../api/client";
import type { Budget, Category, Contribution, SavingsType, Target } from "../api/types";
import { RecurringCard } from "../components/RecurringCard";
import { Card, Empty, ErrorBanner, TableWrap } from "../components/ui";
import { isNonNegativeMoney, isPositiveMoney } from "../money";
import { useToast } from "../components/Toast";
import { useMoney } from "../useMoney";
import { todayIso } from "../months";
import { useT, type Translate } from "../i18n";
import type { MessageKey } from "../i18n/catalogue";
import { errorMessage } from "../i18n/errors";

/** Savings and budgets: what the user intends, and what they have actually put aside. */
export function PlanPage() {
  const money = useMoney();
  const t = useT();
  const toast = useToast();
  const [types, setTypes] = useState<SavingsType[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [newType, setNewType] = useState("");
  const [contributionType, setContributionType] = useState("");
  const [contributionAmount, setContributionAmount] = useState("");
  const [contributionDate, setContributionDate] = useState(todayIso());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextTypes, nextContributions, nextTargets, nextCategories, nextBudgets] =
        await Promise.all([
          api.listSavingsTypes(),
          api.listContributions(),
          api.listTargets(),
          api.listCategories("expense"),
          api.listBudgets(),
        ]);
      setTypes(nextTypes);
      setContributions(nextContributions);
      setTargets(nextTargets);
      setCategories(nextCategories);
      setBudgets(nextBudgets);
    } catch (caught) {
      setError(errorMessage(t, caught, "plan.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const targetFor = useMemo(() => {
    const lookup = new Map(targets.map((t) => [t.savings_type_id, t.monthly_amount]));
    return (id: string) => lookup.get(id) ?? "";
  }, [targets]);

  const budgetFor = useMemo(() => {
    const lookup = new Map(budgets.map((b) => [b.category_id, b.monthly_amount]));
    return (id: string) => lookup.get(id) ?? "";
  }, [budgets]);

  const typeName = useMemo(() => {
    const lookup = new Map(types.map((t) => [t.id, t.name]));
    return (id: string) => lookup.get(id) ?? "—";
  }, [types]);

  async function guard(action: () => Promise<unknown>, fallback: MessageKey) {
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(errorMessage(t, caught, fallback));
    }
  }

  async function addType(event: FormEvent) {
    event.preventDefault();
    if (!newType.trim()) return;
    await guard(async () => {
      await api.createSavingsType(newType.trim());
      setNewType("");
    }, "plan.couldNotCreateType");
  }

  async function addContribution(event: FormEvent) {
    event.preventDefault();
    if (!isPositiveMoney(contributionAmount)) {
      setError(t("entries.badAmount"));
      return;
    }
    await guard(async () => {
      await api.createContribution({
        savings_type_id: contributionType || types[0]?.id || "",
        amount: contributionAmount.trim(),
        occurred_on: contributionDate,
      });
      setContributionAmount("");
    }, "plan.couldNotRecordContribution");
  }

  /** AD-11: PUT, so saving twice updates the standing amount rather than adding a second. */
  async function saveAmount(kind: "target" | "budget", id: string, raw: string) {
    const value = raw.trim();
    if (!isNonNegativeMoney(value)) {
      setError(t("plan.badAmountZeroOrMore"));
      return;
    }
    await guard(
      () => (kind === "target" ? api.setTarget(id, value) : api.setBudget(id, value)),
      "plan.couldNotSaveAmount",
    );
  }

  if (loading) return <p className="empty">{t("state.loading")}</p>;

  return (
    <>
      <ErrorBanner message={error} />

      <RecurringCard />

      <div className="columns">
        <div>
          <Card title={t("plan.savingsTargets")}>
            {types.length === 0 ? (
              <Empty>{t("plan.noTypes")}</Empty>
            ) : (
              <TableWrap>
                <table className="stacked">
                  <thead>
                    <tr>
                      <th>{t("dash.colType")}</th>
                      <th className="num">
                        {t("plan.colMonthlyTarget", { symbol: money.symbol })}
                      </th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((type) => (
                      <AmountRow
                        key={type.id}
                        name={type.name}
                        t={t}
                        initial={targetFor(type.id)}
                        onSave={(value) => saveAmount("target", type.id, value)}
                        onDelete={() =>
                          guard(
                            () => api.deleteSavingsType(type.id),
                            "plan.couldNotDeleteType",
                          )
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}

            <form className="row" onSubmit={addType} style={{ marginTop: 12 }}>
              <label style={{ flex: "1 1 160px" }}>
                {t("plan.newType")}
                <input
                  aria-label={t("plan.newType")}
                  value={newType}
                  onChange={(event) => setNewType(event.target.value)}
                />
              </label>
              <button type="submit">{t("action.add")}</button>
            </form>
          </Card>

          <Card title={t("plan.recordContribution")}>
            <form className="row" onSubmit={addContribution}>
              <label style={{ flex: "1 1 150px" }}>
                {t("dash.colType")}
                <select
                  aria-label={t("plan.savingsType")}
                  value={contributionType || types[0]?.id || ""}
                  onChange={(event) => setContributionType(event.target.value)}
                >
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ flex: "0 0 130px" }}>
                {t("field.amount")}
                <input
                  className="num"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={t("plan.contributionAmount")}
                  required
                  value={contributionAmount}
                  onChange={(event) => setContributionAmount(event.target.value)}
                />
              </label>
              <label style={{ flex: "0 0 150px" }}>
                {t("field.date")}
                <input
                  type="date"
                  aria-label={t("plan.contributionDate")}
                  required
                  value={contributionDate}
                  onChange={(event) => setContributionDate(event.target.value)}
                />
              </label>
              <button type="submit" disabled={types.length === 0}>
                {t("action.add")}
              </button>
            </form>

            {contributions.length === 0 ? (
              <Empty>{t("plan.nothingAside")}</Empty>
            ) : (
              <TableWrap>
                <table className="stacked" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>{t("field.date")}</th>
                      <th>{t("dash.colType")}</th>
                      <th className="num">
                        {t("entries.colAmount", { symbol: money.symbol })}
                      </th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {contributions.map((contribution) => (
                      <tr key={contribution.id}>
                        <td data-label={t("field.date")}>{contribution.occurred_on}</td>
                        <td data-label={t("dash.colType")}>
                          {typeName(contribution.savings_type_id)}
                        </td>
                        <td className="num" data-label={t("entries.colAmountShort")}>
                          {money.plain(contribution.amount)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="quiet"
                            onClick={() =>
                              void guard(async () => {
                                await api.deleteContribution(contribution.id);
                                toast.show(
                                  t("entries.deleted", {
                                    amount: money.amount(contribution.amount),
                                  }),
                                  {
                                  onUndo: async () => {
                                    await api.createContribution({
                                      savings_type_id: contribution.savings_type_id,
                                      amount: contribution.amount,
                                      occurred_on: contribution.occurred_on,
                                    });
                                    await load();
                                  },
                                  },
                                );
                              }, "plan.couldNotDeleteContribution")
                            }
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
        </div>

        <Card title={t("plan.budgets")}>
          <p className="hint" style={{ marginTop: 0 }}>
            {t("plan.budgetsHint")}
          </p>
          {categories.length === 0 ? (
            <Empty>{t("plan.noCategories")}</Empty>
          ) : (
            <TableWrap>
              <table className="stacked">
                <thead>
                  <tr>
                    <th>{t("dash.colCategory")}</th>
                    <th className="num">
                      {t("plan.colMonthlyBudget", { symbol: money.symbol })}
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <AmountRow
                      key={category.id}
                      name={category.name}
                      t={t}
                      initial={budgetFor(category.id)}
                      onSave={(value) => saveAmount("budget", category.id, value)}
                      onDelete={() =>
                        guard(
                          () => api.deleteCategory(category.id),
                          "plan.couldNotDeleteCategory",
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}

function AmountRow({
  name,
  t,
  initial,
  onSave,
  onDelete,
}: {
  name: string;
  // Passed in rather than looked up: this row is rendered once per category and per
  // savings type, and a hook call per row buys nothing the parent has not already got.
  t: Translate;
  initial: string;
  onSave: (value: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(initial);
    setDirty(false);
  }, [initial]);

  return (
    <tr>
      <td data-label={t("field.name")}>{name}</td>
      <td className="num" data-label={t("plan.colMonthly")}>
        <input
          className="num"
          inputMode="decimal"
          placeholder={t("plan.notSetPlaceholder")}
          aria-label={t("plan.monthlyAmountFor", { name })}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setDirty(true);
          }}
        />
      </td>
      <td>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button type="button" disabled={!dirty} onClick={() => void onSave(value)}>
            {t("action.save")}
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => void onDelete()}
            aria-label={t("plan.deleteNamed", { name })}
          >
            {t("action.delete")}
          </button>
        </div>
      </td>
    </tr>
  );
}
