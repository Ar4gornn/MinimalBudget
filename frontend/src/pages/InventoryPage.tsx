import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import type { ItemInput } from "../api/client";
import type { InventoryItem, ItemChange, Restocks, Space } from "../api/types";
import { CountBars } from "../charts/CountBars";
import { StepChart } from "../charts/StepChart";
import { ShoppingList } from "../components/ShoppingList";
import { Card, Empty, ErrorBanner, TableWrap } from "../components/ui";
import { useToast } from "../components/Toast";
import { isNonNegativeMoney } from "../money";
import { monthLabel } from "../months";
import { useMoney } from "../useMoney";

const RESTOCK_MONTHS = 6;

type Filter = "all" | "restock" | string; // a space id is also a filter

/**
 * Every space on one page (Story 11.4).
 *
 * Grouped rather than siloed: the question is "what am I out of?", and the answer should
 * not depend on remembering which room something was filed under. A filter narrows; a
 * tab would hide.
 */
export function InventoryPage() {
  const money = useMoney();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [restocks, setRestocks] = useState<Restocks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>(
    searchParams.get("filter") === "restock" ? "restock" : "all",
  );

  // Add-item form.
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [spaceName, setSpaceName] = useState("");
  const [restockBelow, setRestockBelow] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Inline space management.
  const [newSpace, setNewSpace] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // Inline item editing, and which item's history is unfolded.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    quantity: string;
    restock_below: string;
    cost: string;
    note: string;
    space_id: string;
  } | null>(null);
  const [history, setHistory] = useState<{ id: string; changes: ItemChange[] } | null>(null);
  // Items with a PATCH in flight. The stepper sends an absolute value computed from what is
  // on screen, so a second click before the first lands would resend the same number and
  // lose a click; the buttons are disabled until the list has reloaded.
  const [pending, setPending] = useState<Set<string>>(new Set());
  // The ref is the guard, the state is the disabled attribute: two clicks in one tick see the
  // same closure state, so state alone would let both through.
  const inFlight = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSpaces, nextItems, nextRestocks] = await Promise.all([
        api.listSpaces(),
        api.listItems(),
        api.restocks(RESTOCK_MONTHS),
      ]);
      setSpaces(nextSpaces);
      setItems(nextItems);
      setRestocks(nextRestocks);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the inventory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The dashboard links here with ?filter=restock; once read, drop it so a refresh is
  // a normal visit.
  useEffect(() => {
    if (!searchParams.has("filter")) return;
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const lowCount = useMemo(() => items.filter((item) => item.needs_restock).length, [items]);

  // AD-30 on the client: the row's own flag, never a recomputation here. Filtering by
  // it is the same predicate the dashboard counted.
  const visible = useMemo(() => {
    if (filter === "restock") return items.filter((item) => item.needs_restock);
    if (filter !== "all") return items.filter((item) => item.space_id === filter);
    return items;
  }, [items, filter]);

  const bySpace = useMemo(() => {
    const groups = new Map<string, InventoryItem[]>();
    for (const item of visible) {
      const group = groups.get(item.space_id) ?? [];
      group.push(item);
      groups.set(item.space_id, group);
    }
    return groups;
  }, [visible]);

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      setError("Quantity must be a whole number, zero or more.");
      return;
    }
    const threshold = restockBelow.trim() === "" ? null : Number(restockBelow);
    if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0)) {
      setError("Restock threshold must be a whole number, zero or more.");
      return;
    }
    if (cost.trim() !== "" && !isNonNegativeMoney(cost)) {
      setError("Enter a cost with at most two decimal places.");
      return;
    }
    setSaving(true);
    await run(async () => {
      await api.createItem({
        name: name.trim(),
        quantity: qty,
        space_name: spaceName.trim(),
        ...(threshold !== null ? { restock_below: threshold } : {}),
        ...(cost.trim() ? { cost: cost.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setName("");
      setQuantity("1");
      setRestockBelow("");
      setCost("");
      setNote("");
      await load();
      toast.show("Item added");
    }, "Could not add the item.");
    setSaving(false);
  }

  // Reload the list, and the unfolded history with it, so the chart keeps up with the row.
  async function reload(changedId?: string) {
    await load();
    if (changedId && history?.id === changedId) {
      setHistory({ id: changedId, changes: await api.itemHistory(changedId) });
    }
  }

  async function setQty(item: InventoryItem, next: number) {
    if (next < 0 || inFlight.current.has(item.id)) return;
    inFlight.current.add(item.id);
    setPending(new Set(inFlight.current));
    try {
      await run(async () => {
        await api.updateItem(item.id, { quantity: next });
        await reload(item.id);
      }, "Could not change the quantity.");
    } finally {
      inFlight.current.delete(item.id);
      setPending(new Set(inFlight.current));
    }
  }

  async function runningLow(item: InventoryItem) {
    // Story 11.4: a manual "running low" is a threshold, not a flag — and not a quantity.
    // Raising the threshold to the current quantity trips the AD-30 predicate without
    // inventing a stock change the person never reported, so the log stays honest.
    await run(async () => {
      await api.updateItem(item.id, { restock_below: item.quantity });
      await load();
    }, "Could not mark the item.");
  }

  function beginEdit(item: InventoryItem) {
    setEditing(item.id);
    setDraft({
      name: item.name,
      quantity: String(item.quantity),
      restock_below: item.restock_below === null ? "" : String(item.restock_below),
      cost: item.cost ?? "",
      note: item.note ?? "",
      space_id: item.space_id,
    });
  }

  async function saveEdit(item: InventoryItem) {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("An item needs a name.");
      return;
    }
    const qty = Number(draft.quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      setError("Quantity must be a whole number, zero or more.");
      return;
    }
    const threshold = draft.restock_below.trim() === "" ? null : Number(draft.restock_below);
    if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0)) {
      setError("Restock threshold must be a whole number, zero or more.");
      return;
    }
    if (draft.cost.trim() !== "" && !isNonNegativeMoney(draft.cost)) {
      setError("Enter a cost with at most two decimal places.");
      return;
    }
    // Send only what changed; a cleared field is an explicit null.
    const patch: Partial<ItemInput> = {};
    if (draft.name.trim() !== item.name) patch.name = draft.name.trim();
    if (qty !== item.quantity) patch.quantity = qty;
    if (threshold !== item.restock_below) patch.restock_below = threshold;
    if ((draft.cost.trim() || null) !== item.cost) patch.cost = draft.cost.trim() || null;
    if ((draft.note.trim() || null) !== item.note) patch.note = draft.note.trim() || null;
    if (draft.space_id !== item.space_id) patch.space_id = draft.space_id;
    if (Object.keys(patch).length === 0) {
      setEditing(null);
      return;
    }
    await run(async () => {
      await api.updateItem(item.id, patch);
      setEditing(null);
      await reload(item.id);
      toast.show("Item updated");
    }, "Could not save that change.");
  }

  async function removeItem(item: InventoryItem) {
    await run(async () => {
      await api.deleteItem(item.id);
      await load();
      toast.show(`Deleted ${item.name}`, {
        onUndo: async () => {
          await api.createItem({
            name: item.name,
            quantity: item.quantity,
            space_id: item.space_id,
            restock_below: item.restock_below,
            cost: item.cost,
            note: item.note,
          });
          await load();
        },
      });
    }, "Could not delete the item.");
  }

  async function toggleHistory(item: InventoryItem) {
    if (history?.id === item.id) {
      setHistory(null);
      return;
    }
    await run(async () => {
      const changes = await api.itemHistory(item.id);
      setHistory({ id: item.id, changes });
    }, "Could not load the history.");
  }

  async function addSpace(event: FormEvent) {
    event.preventDefault();
    if (!newSpace.trim()) return;
    await run(async () => {
      await api.createSpace(newSpace.trim());
      setNewSpace("");
      await load();
    }, "Could not add the space.");
  }

  async function saveRename(space: Space) {
    if (!renameDraft.trim() || renameDraft.trim() === space.name) {
      setRenaming(null);
      return;
    }
    await run(async () => {
      await api.renameSpace(space.id, renameDraft.trim());
      setRenaming(null);
      await load();
    }, "Could not rename the space.");
  }

  async function removeSpace(space: Space) {
    // The 409 for a space with items comes back as the server's own sentence.
    await run(async () => {
      await api.deleteSpace(space.id);
      if (filter === space.id) setFilter("all");
      await load();
    }, "Could not delete the space.");
  }

  const restockPeak = Math.max(1, ...(restocks?.series ?? []).flatMap((s) => s.values));
  const anyRestocks = (restocks?.series ?? []).some((s) => s.values.some((v) => v > 0));

  return (
    <>
      <ErrorBanner message={error} />

      {/* Above the spaces: what to buy is the thing you act on, the shelves are reference. */}
      <ShoppingList onChanged={() => void load()} />

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Stock</h1>
        <div className="chips" role="group" aria-label="Filter">
          <button
            type="button"
            className={`chip ${filter === "all" ? "on" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`chip ${filter === "restock" ? "on" : ""}`}
            onClick={() => setFilter("restock")}
          >
            Needs restocking{lowCount > 0 ? ` · ${lowCount}` : ""}
          </button>
          {spaces.map((space) => (
            <button
              key={space.id}
              type="button"
              className={`chip ${filter === space.id ? "on" : ""}`}
              onClick={() => setFilter(space.id)}
            >
              {space.name}
            </button>
          ))}
        </div>
      </div>

      <Card title="Add an item">
        <form className="row" onSubmit={submit} aria-label="Add an item">
          <label style={{ flex: "1 1 160px" }}>
            Name
            <input
              aria-label="Name"
              placeholder="Milk, batteries…"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label style={{ flex: "0 0 90px" }}>
            Quantity
            <input
              className="num"
              inputMode="numeric"
              aria-label="Quantity"
              required
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <label style={{ flex: "1 1 150px" }}>
            Space
            <input
              list="space-names"
              aria-label="Space"
              placeholder="Fridge, Garage…"
              required
              value={spaceName}
              onChange={(event) => setSpaceName(event.target.value)}
            />
          </label>
          <datalist id="space-names">
            {spaces.map((space) => (
              <option key={space.id} value={space.name} />
            ))}
          </datalist>
          <label style={{ flex: "0 0 110px" }}>
            Remind at
            <input
              className="num"
              inputMode="numeric"
              placeholder="—"
              aria-label="Restock threshold"
              value={restockBelow}
              onChange={(event) => setRestockBelow(event.target.value)}
            />
          </label>
          <label style={{ flex: "0 0 110px" }}>
            Cost
            <input
              className="num"
              inputMode="decimal"
              placeholder="0.00"
              aria-label={`Cost in ${money.currency}`}
              value={cost}
              onChange={(event) => setCost(event.target.value)}
            />
          </label>
          <label style={{ flex: "1 1 160px" }}>
            Note
            <input aria-label="Note" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Add"}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 8 }}>
          A space that does not exist yet is created as you type it. "Remind at" is the
          quantity at or below which the item shows as needing restocking.
        </p>
      </Card>

      {loading && items.length === 0 ? (
        <p className="empty">Loading…</p>
      ) : spaces.length === 0 ? (
        <Card>
          <Empty>
            A space is anywhere you keep things — Fridge, Garage, House stuff. Add an item
            above and its space is created with it.
          </Empty>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <Empty>
            {filter === "restock" ? "Nothing needs restocking." : "Nothing here yet."}
          </Empty>
        </Card>
      ) : (
        spaces
          .filter((space) => bySpace.has(space.id))
          .map((space) => (
            <Card
              key={space.id}
              title={space.name}
              actions={
                renaming === space.id ? (
                  <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                    <input
                      aria-label="Rename space"
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                    />
                    <button type="button" onClick={() => void saveRename(space)}>
                      Save
                    </button>
                    <button type="button" className="quiet" onClick={() => setRenaming(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => {
                        setRenaming(space.id);
                        setRenameDraft(space.name);
                      }}
                      aria-label={`Rename ${space.name}`}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => void removeSpace(space)}
                      aria-label={`Delete ${space.name}`}
                    >
                      Delete
                    </button>
                  </div>
                )
              }
            >
              <TableWrap>
                <table className="stacked" aria-label={`${space.name} items`}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num">Quantity</th>
                      <th className="num">Remind at</th>
                      <th className="num">Cost ({money.symbol})</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(bySpace.get(space.id) ?? []).map((item) =>
                      editing === item.id && draft ? (
                        <tr key={item.id}>
                          <td data-label="Item">
                            <input
                              aria-label="Edit name"
                              value={draft.name}
                              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                            />
                            <div className="row" style={{ flexWrap: "nowrap", gap: 6, marginTop: 6 }}>
                              <select
                                aria-label="Edit space"
                                value={draft.space_id}
                                onChange={(event) =>
                                  setDraft({ ...draft, space_id: event.target.value })
                                }
                              >
                                {spaces.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                aria-label="Edit note"
                                placeholder="note"
                                value={draft.note}
                                onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                              />
                            </div>
                          </td>
                          <td className="num" data-label="Quantity">
                            <input
                              className="num"
                              inputMode="numeric"
                              aria-label="Edit quantity"
                              value={draft.quantity}
                              onChange={(event) =>
                                setDraft({ ...draft, quantity: event.target.value })
                              }
                            />
                          </td>
                          <td className="num" data-label="Remind at">
                            <input
                              className="num"
                              inputMode="numeric"
                              aria-label="Edit restock threshold"
                              placeholder="—"
                              value={draft.restock_below}
                              onChange={(event) =>
                                setDraft({ ...draft, restock_below: event.target.value })
                              }
                            />
                          </td>
                          <td className="num" data-label="Cost">
                            <input
                              className="num"
                              inputMode="decimal"
                              aria-label="Edit cost"
                              placeholder="—"
                              value={draft.cost}
                              onChange={(event) => setDraft({ ...draft, cost: event.target.value })}
                            />
                          </td>
                          <td>
                            <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                              <button type="button" onClick={() => void saveEdit(item)}>
                                Save
                              </button>
                              <button type="button" className="quiet" onClick={() => setEditing(null)}>
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <Fragment key={item.id}>
                          <tr className={item.needs_restock ? "low" : undefined}>
                            <td data-label="Item">
                              {item.name}
                              {item.needs_restock && <span className="badge">restock</span>}
                              {item.note && <div className="hint">{item.note}</div>}
                            </td>
                            <td className="num" data-label="Quantity">
                              <div className="stepper">
                                <button
                                  type="button"
                                  className="quiet"
                                  aria-label={`One less ${item.name}`}
                                  disabled={item.quantity === 0 || pending.has(item.id)}
                                  onClick={() => void setQty(item, item.quantity - 1)}
                                >
                                  −
                                </button>
                                <span aria-label={`${item.name} quantity`}>{item.quantity}</span>
                                <button
                                  type="button"
                                  className="quiet"
                                  aria-label={`One more ${item.name}`}
                                  disabled={pending.has(item.id)}
                                  onClick={() => void setQty(item, item.quantity + 1)}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="num" data-label="Remind at">
                              {item.restock_below === null ? (
                                <span className="hint">—</span>
                              ) : (
                                item.restock_below
                              )}
                            </td>
                            <td className="num" data-label="Cost">
                              {item.cost === null ? <span className="hint">—</span> : money.plain(item.cost)}
                            </td>
                            <td>
                              <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                                {!item.needs_restock && (
                                  <button
                                    type="button"
                                    className="quiet"
                                    onClick={() => void runningLow(item)}
                                    aria-label={`${item.name} is running low`}
                                  >
                                    Running low
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="quiet"
                                  onClick={() => void toggleHistory(item)}
                                  aria-expanded={history?.id === item.id}
                                  aria-label={`History of ${item.name}`}
                                >
                                  History
                                </button>
                                <button
                                  type="button"
                                  className="quiet"
                                  onClick={() => beginEdit(item)}
                                  aria-label={`Edit ${item.name}`}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="quiet"
                                  onClick={() => void removeItem(item)}
                                  aria-label={`Delete ${item.name}`}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                          {history?.id === item.id && (
                            <tr className="history">
                              <td colSpan={5} data-label="History">
                                {history.changes.length === 0 ? (
                                  <span className="hint">No changes in the last 90 days.</span>
                                ) : (
                                  <StepChart
                                    changes={history.changes}
                                    threshold={item.restock_below}
                                    label={item.name}
                                  />
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ),
                    )}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          ))
      )}

      <Card title="Spaces">
        <form className="row" onSubmit={addSpace} aria-label="Add a space">
          <label style={{ flex: "1 1 200px" }}>
            New space
            <input
              aria-label="New space"
              placeholder="Pantry"
              value={newSpace}
              onChange={(event) => setNewSpace(event.target.value)}
            />
          </label>
          <button type="submit" className="quiet">
            Add space
          </button>
        </form>
        {spaces.length > 0 && (
          <p className="hint" style={{ marginTop: 8 }}>
            {spaces.map((space) => space.name).join(" · ")}
          </p>
        )}
      </Card>

      {restocks && anyRestocks && (
        <Card title={`Restocks per space, last ${RESTOCK_MONTHS} months`}>
          <TableWrap>
            <table className="stacked" aria-label="Restocks per space">
              <thead>
                <tr>
                  <th>Space</th>
                  <th>Per month</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {restocks.series.map((series) => (
                  <tr key={series.space_id}>
                    <td data-label="Space">{series.space_name}</td>
                    <td data-label="Per month">
                      <CountBars
                        values={series.values}
                        months={restocks.months}
                        label={series.space_name}
                        peak={restockPeak}
                      />
                    </td>
                    <td className="num" data-label="Total">
                      {series.values.reduce((sum, v) => sum + v, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="legend">
            {restocks.months.map((m) => (
              <span key={m}>{monthLabel(m).slice(0, 3)}</span>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
