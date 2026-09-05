import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import type { Category, ShoppingList as List, ShoppingRow } from "../api/types";
import { isPositiveMoney } from "../money";
import { useMoney } from "../useMoney";
import { todayIso } from "../months";
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
      setError(caught instanceof Error ? caught.message : "Could not load the shopping list.");
    }
  }, []);

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
      setError("How many did you buy? A whole number, at least one.");
      return;
    }
    const amount = draft.amount.trim();
    if (amount && !isPositiveMoney(amount)) {
      setError("Enter an amount with at most two decimal places, greater than zero.");
      return;
    }
    if (amount && !category.trim()) {
      setError("An amount needs a category to file it under.");
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
      toast.show(amount ? `${row.name} restocked · ${money.amount(amount)}` : `${row.name} restocked`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record that.");
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
      title="Shopping list"
      collapseKey="inventory.shopping"
      summary={`${list.items.length} · ${money.plain(list.estimate)}`}
    >
      <ErrorBanner message={error} />

      <div className="row" style={{ marginBottom: 8 }}>
        <label style={{ flex: "1 1 200px" }}>
          File spending under
          <input
            list="shopping-category-names"
            aria-label="File spending under"
            placeholder="Groceries"
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
        <table className="stacked" aria-label="Shopping list">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Buy</th>
              <th className="num">Cost ({money.symbol})</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.items.map((row) => {
              const draft = draftFor(row);
              return (
                <tr key={row.item_id}>
                  <td data-label="Item">
                    {row.name}
                    {row.space_name ? <span className="hint"> · {row.space_name}</span> : null}
                  </td>
                  <td className="num" data-label="Buy">
                    <input
                      className="num"
                      inputMode="numeric"
                      aria-label={`How many ${row.name}`}
                      value={draft.quantity}
                      onChange={(event) =>
                        setDrafts({
                          ...drafts,
                          [row.item_id]: { ...draft, quantity: event.target.value },
                        })
                      }
                    />
                  </td>
                  <td className="num" data-label="Cost">
                    <input
                      className="num"
                      inputMode="decimal"
                      placeholder="—"
                      aria-label={`What ${row.name} cost`}
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
                      aria-label={`Bought ${row.name}`}
                    >
                      Bought
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>

      <p className="hint" style={{ marginTop: 8 }}>
        {money.amount(list.estimate)} estimated
        {list.without_cost > 0
          ? `, not counting ${list.without_cost} ${
              list.without_cost === 1 ? "item with no" : "items with no"
            } recorded cost`
          : ""}
        . Leaving the cost blank still restocks the item, without recording an expense.
      </p>
    </Card>
  );
}
