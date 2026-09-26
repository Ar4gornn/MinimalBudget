import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import type { Budget, Category } from "../api/types";
import { RecurringCard } from "../components/RecurringCard";
import { SavingsCard } from "../components/SavingsCard";
import { Card, Empty, ErrorBanner, TableWrap } from "../components/ui";
import { isNonNegativeMoney, normalizeMoney } from "../money";
import { useMoney } from "../useMoney";
import { useT, type Translate } from "../i18n";
import type { MessageKey } from "../i18n/catalogue";
import { errorMessage } from "../i18n/errors";
import { useLoad } from "../useLoad";

const NOTHING = {
  categories: [] as Category[],
  budgets: [] as Budget[],
};

/** Savings and budgets: what the user intends, and what they have actually put aside. */
export function PlanPage() {
  const money = useMoney();
  const t = useT();
  // Failures of the budget card's own actions, shown inside it: at the top of the page
  // they landed above the fold, and a refused amount looked like a dead button. The
  // savings card keeps its own (SavingsCard). The load's failure is `failure`.
  const [error, setError] = useState<string | null>(null);

  const {
    data: { categories, budgets },
    loading,
    failure,
    reload: load,
  } = useLoad(
    () =>
      Promise.all([api.listCategories("expense"), api.listBudgets()]).then(
        ([categories, budgets]) => ({ categories, budgets }),
      ),
    NOTHING,
    [],
    "plan.couldNotLoad",
  );

  const budgetFor = useMemo(() => {
    const lookup = new Map(budgets.map((b) => [b.category_id, b.monthly_amount]));
    return (id: string) => lookup.get(id) ?? "";
  }, [budgets]);

  async function guard(action: () => Promise<unknown>, fallback: MessageKey) {
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(errorMessage(t, caught, fallback));
    }
  }

  /** AD-11: PUT, so saving twice updates the standing amount rather than adding a second. */
  async function saveBudget(id: string, raw: string) {
    const value = normalizeMoney(raw);
    if (!isNonNegativeMoney(value)) {
      setError(t("plan.badAmountZeroOrMore"));
      return;
    }
    await guard(() => api.setBudget(id, value), "plan.couldNotSaveAmount");
  }

  if (loading) return <p className="empty">{t("state.loading")}</p>;

  return (
    <>
      <ErrorBanner message={failure} />

      <RecurringCard />

      <div className="columns">
        <div>
          <SavingsCard />
        </div>

        <Card title={t("plan.budgets")} tour="budgets">
          <ErrorBanner message={error} />
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
                      onSave={(value) => saveBudget(category.id, value)}
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
