import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api } from "../api/client";
import type { Budget, Category, Contribution, SavingsType, Target } from "../api/types";
import { RecurringCard } from "../components/RecurringCard";
import { Card, Empty, ErrorBanner, TableWrap } from "../components/ui";
import { isNonNegativeMoney, isPositiveMoney } from "../money";
import { useToast } from "../components/Toast";
import { useMoney } from "../useMoney";
import { todayIso } from "../months";

/** Savings and budgets: what the user intends, and what they have actually put aside. */
export function PlanPage() {
  const money = useMoney();
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
      setError(caught instanceof Error ? caught.message : "Could not load your plan.");
    } finally {
      setLoading(false);
    }
  }, []);

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

  async function guard(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    }
  }

  async function addType(event: FormEvent) {
    event.preventDefault();
    if (!newType.trim()) return;
    await guard(async () => {
      await api.createSavingsType(newType.trim());
      setNewType("");
    }, "Could not create that savings type.");
  }

  async function addContribution(event: FormEvent) {
    event.preventDefault();
    if (!isPositiveMoney(contributionAmount)) {
      setError("Enter an amount with at most two decimal places, greater than zero.");
      return;
    }
    await guard(async () => {
      await api.createContribution({
        savings_type_id: contributionType || types[0]?.id || "",
        amount: contributionAmount.trim(),
        occurred_on: contributionDate,
      });
      setContributionAmount("");
    }, "Could not record that contribution.");
  }

  /** AD-11: PUT, so saving twice updates the standing amount rather than adding a second. */
  async function saveAmount(kind: "target" | "budget", id: string, raw: string) {
    const value = raw.trim();
    if (!isNonNegativeMoney(value)) {
      setError("Enter an amount of zero or more, with at most two decimal places.");
      return;
    }
    await guard(
      () => (kind === "target" ? api.setTarget(id, value) : api.setBudget(id, value)),
      "Could not save that amount.",
    );
  }

  if (loading) return <p className="empty">Loading…</p>;

  return (
    <>
      <ErrorBanner message={error} />

      <RecurringCard />

      <div className="columns">
        <div>
          <Card title="Monthly savings targets">
            {types.length === 0 ? (
              <Empty>No savings types yet.</Empty>
            ) : (
              <TableWrap>
                <table className="stacked">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th className="num">Monthly target ({money.symbol})</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((type) => (
                      <AmountRow
                        key={type.id}
                        name={type.name}
                        initial={targetFor(type.id)}
                        onSave={(value) => saveAmount("target", type.id, value)}
                        onDelete={() =>
                          guard(
                            () => api.deleteSavingsType(type.id),
                            "Could not delete that savings type.",
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
                New savings type
                <input
                  aria-label="New savings type"
                  value={newType}
                  onChange={(event) => setNewType(event.target.value)}
                />
              </label>
              <button type="submit">Add</button>
            </form>
          </Card>

          <Card title="Record a contribution">
            <form className="row" onSubmit={addContribution}>
              <label style={{ flex: "1 1 150px" }}>
                Type
                <select
                  aria-label="Savings type"
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
                Amount
                <input
                  className="num"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label="Contribution amount"
                  required
                  value={contributionAmount}
                  onChange={(event) => setContributionAmount(event.target.value)}
                />
              </label>
              <label style={{ flex: "0 0 150px" }}>
                Date
                <input
                  type="date"
                  aria-label="Contribution date"
                  required
                  value={contributionDate}
                  onChange={(event) => setContributionDate(event.target.value)}
                />
              </label>
              <button type="submit" disabled={types.length === 0}>
                Add
              </button>
            </form>

            {contributions.length === 0 ? (
              <Empty>Nothing put aside yet.</Empty>
            ) : (
              <TableWrap>
                <table className="stacked" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th className="num">Amount ({money.symbol})</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {contributions.map((contribution) => (
                      <tr key={contribution.id}>
                        <td data-label="Date">{contribution.occurred_on}</td>
                        <td data-label="Type">{typeName(contribution.savings_type_id)}</td>
                        <td className="num" data-label="Amount">{money.plain(contribution.amount)}</td>
                        <td>
                          <button
                            type="button"
                            className="quiet"
                            onClick={() =>
                              void guard(async () => {
                                await api.deleteContribution(contribution.id);
                                toast.show(`Deleted ${money.amount(contribution.amount)}`, {
                                  onUndo: async () => {
                                    await api.createContribution({
                                      savings_type_id: contribution.savings_type_id,
                                      amount: contribution.amount,
                                      occurred_on: contribution.occurred_on,
                                    });
                                    await load();
                                  },
                                });
                              }, "Could not delete that contribution.")
                            }
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
        </div>

        <Card title="Monthly budgets">
          <p className="hint" style={{ marginTop: 0 }}>
            Expense categories only — a budget on income would mean nothing.
          </p>
          {categories.length === 0 ? (
            <Empty>No expense categories yet. Record an entry to create one.</Empty>
          ) : (
            <TableWrap>
              <table className="stacked">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="num">Monthly budget ({money.symbol})</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <AmountRow
                      key={category.id}
                      name={category.name}
                      initial={budgetFor(category.id)}
                      onSave={(value) => saveAmount("budget", category.id, value)}
                      onDelete={() =>
                        guard(
                          () => api.deleteCategory(category.id),
                          "Could not delete that category.",
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
  initial,
  onSave,
  onDelete,
}: {
  name: string;
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
      <td data-label="Name">{name}</td>
      <td className="num" data-label="Monthly">
        <input
          className="num"
          inputMode="decimal"
          placeholder="not set"
          aria-label={`Monthly amount for ${name}`}
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
            Save
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => void onDelete()}
            aria-label={`Delete ${name}`}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
