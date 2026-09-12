import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import type { Category, ShoppingList as List, ShoppingRow } from "../api/types";
import { isPositiveMoney } from "../money";
import { useMoney } from "../useMoney";
import { todayIso } from "../months";
import { useT } from "../i18n";
import { errorMessage } from "../i18n/errors";
import { Card, ErrorBanner, TableWrap } from "./ui";
import { useToast } from "./Toast";

const CATEGORY_KEY = "minimalbudget.shopping.category";

/** Remembered per device: the category is nearly always the same one, shop after shop. */
function readCategory(): string {
  try {
    return window.localStorage.getItem(CATEGORY_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeCategory(name: string): void {
  try {
    window.localStorage.setItem(CATEGORY_KEY, name);
  } catch {
    /* private windows throw; a forgotten default is not worth a crash */
  }
}

/**
 * What needs buying, and the one action that records having bought it (Epic 14).
 *
 * Ticking a row off restocks the item and, when an amount is filled in, records the expense
 * — one request, one transaction, per AD-31. Leaving the amount blank still restocks: a
 * thing that cost nothing, or that someone else paid for, is still on the shelf.
 */
export function ShoppingList({ onChanged }: { onChanged?: () => void }) {
  const money = useMoney();
  const t = useT();
  const toast = useToast();

  const [list, setList] = useState<List | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [category, setCategory] = useState(readCategory);
  const [drafts, setDrafts] = useState<Record<string, { quantity: string; amount: string }>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextList, nextCategories] = await Promise.all([
        api.shoppingList(),
        api.listCategories("expense"),
      ]);
      setList(nextList);
      setCategories(nextCategories);
    } catch (caught) {
      setError(errorMessage(t, caught, "shopping.couldNotLoad"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const draftFor = useMemo(
    () => (row: ShoppingRow) =>
      drafts[row.item_id] ?? {
        quantity: String(row.suggested),
        amount: row.estimate ?? "",
      },
    [drafts],
  );

  async function bought(row: ShoppingRow) {
    const draft = draftFor(row);
    const quantity = Number(draft.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError(t("shopping.howManyError"));
      return;
    }
    const amount = draft.amount.trim();
    if (amount && !isPositiveMoney(amount)) {
      setError(t("entries.badAmount"));
      return;
    }
    if (amount && !category.trim()) {
      setError(t("error.purchase_category_missing"));
      return;
    }

    setBusy(row.item_id);
    setError(null);
    try {
      await api.purchaseItem(row.item_id, {
        quantity,
        occurred_on: todayIso(),
        ...(amount ? { amount, category_name: category.trim() } : {}),
      });
      if (amount) writeCategory(category.trim());
      setDrafts((was) => {
        const next = { ...was };
        delete next[row.item_id];
        return next;
      });
      await load();
      onChanged?.();
      toast.show(
        amount
          ? t("shopping.restockedFor", { name: row.name, amount: money.amount(amount) })
          : t("shopping.restocked", { name: row.name }),
      );
    } catch (caught) {
      setError(errorMessage(t, caught, "shopping.couldNotRecord"));
    } finally {
      setBusy(null);
    }
  }

  // A shape check, not paranoia: this card sits above the shelves, and an unexpected
  // payload — an older server, a half-deployed API — must not take the Stock page down
  // with it. Rendering nothing is the honest failure here.
  const usable =
    list !== null && Array.isArray(list.items) && typeof list.estimate === "string";
  if (!usable || list.items.length === 0) return null;

  return (
    <Card
      title={t("shopping.title")}
      collapseKey="inventory.shopping"
      summary={`${list.items.length} · ${money.plain(list.estimate)}`}
    >
      <ErrorBanner message={error} />

      <div className="row" style={{ marginBottom: 8 }}>
        <label style={{ flex: "1 1 200px" }}>
          {t("shopping.fileUnder")}
          <input
            list="shopping-category-names"
            aria-label={t("shopping.fileUnder")}
            placeholder={t("shopping.fileUnderPlaceholder")}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </label>
        <datalist id="shopping-category-names">
          {categories.map((entry) => (
            <option key={entry.id} value={entry.name} />
          ))}
        </datalist>
      </div>

      <TableWrap>
        <table className="stacked" aria-label={t("shopping.title")}>
          <thead>
            <tr>
              <th>{t("stock.colItem")}</th>
              <th className="num">{t("shopping.colBuy")}</th>
              <th className="num">{t("stock.colCost", { symbol: money.symbol })}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.items.map((row) => {
              const draft = draftFor(row);
              return (
                <tr key={row.item_id}>
                  <td data-label={t("stock.colItem")}>
                    {row.name}
                    {row.space_name ? <span className="hint"> · {row.space_name}</span> : null}
                  </td>
                  <td className="num" data-label={t("shopping.colBuy")}>
                    <input
                      className="num"
                      inputMode="numeric"
                      aria-label={t("shopping.howMany", { name: row.name })}
                      value={draft.quantity}
                      onChange={(event) =>
                        setDrafts({
                          ...drafts,
                          [row.item_id]: { ...draft, quantity: event.target.value },
                        })
                      }
                    />
                  </td>
                  <td className="num" data-label={t("stock.cost")}>
                    <input
                      className="num"
                      inputMode="decimal"
                      placeholder="—"
                      aria-label={t("shopping.whatCost", { name: row.name })}
                      value={draft.amount}
                      onChange={(event) =>
                        setDrafts({
                          ...drafts,
                          [row.item_id]: { ...draft, amount: event.target.value },
                        })
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={busy === row.item_id}
                      onClick={() => void bought(row)}
                      aria-label={t("shopping.boughtAria", { name: row.name })}
                    >
                      {t("shopping.bought")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>

      <p className="hint" style={{ marginTop: 8 }}>
        {t("shopping.estimated", { amount: money.amount(list.estimate) })}
        {list.without_cost > 0
          ? t.n("shopping.withoutCost", list.without_cost)
          : ""}
        {t("shopping.blankCostNote")}
      </p>
    </Card>
  );
}
