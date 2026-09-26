import { describe, expect, it, vi } from "vitest";

import type { Preferences, PreferencesPatch } from "../api/types";
import { DEFAULT_PREFERENCES, PreferenceSaver, applyPatch, preferencesOf } from "./preferences";

/** A send whose answers the test releases by hand, in whatever order it likes. */
function controlledSend() {
  const calls: { patch: PreferencesPatch; resolve: (p: Preferences) => void; reject: (e: unknown) => void }[] = [];
  const send = vi.fn(
    (patch: PreferencesPatch) =>
      new Promise<Preferences>((resolve, reject) => {
        calls.push({ patch, resolve, reject });
      }),
  );
  return { send, calls };
}

/** The i-th request, or a clear failure if it was never sent. */
function at<T>(list: T[], i: number): T {
  const found = list[i];
  if (found === undefined) throw new Error(`request ${i} was never sent`);
  return found;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const gymOff: PreferencesPatch = { modules: { ...DEFAULT_PREFERENCES.modules, gym: false } };
const gymAndBooksOff: PreferencesPatch = {
  modules: { ...DEFAULT_PREFERENCES.modules, gym: false, books: false },
};
const phoneStatsHidden: PreferencesPatch = {
  phone: {
    ...DEFAULT_PREFERENCES.phone,
    cards: DEFAULT_PREFERENCES.phone.cards.map((c) => (c.id === "stats" ? { ...c, on: false } : c)),
  },
};

describe("the defaults", () => {
  it("are the app as it was, and equal the server's resolve({})", () => {
    // Same literal as DEFAULT in backend/tests/test_preferences.py.
    const tabs = [
      { id: "dashboard", slot: "bar" },
      { id: "entries", slot: "bar" },
      { id: "habits", slot: "bar" },
      { id: "stock", slot: "bar" },
      { id: "gym", slot: "bar" },
      { id: "plan", slot: "top" },
      { id: "grow", slot: "top" },
      { id: "recipes", slot: "top" },
    ];
    const cards = [
      "stats", "pending", "reading", "quote", "restock",
      "budgets", "savings", "trends", "categories",
    ].map((id) => ({ id, on: true }));
    expect(DEFAULT_PREFERENCES).toEqual({
      modules: { habits: true, books: true, mood: true, stock: true, gym: true, recipes: true, notes: true },
      phone: { tabs, cards },
      desktop: { tabs, cards },
    });
  });

  it("stand in for a server older than migration 0025", () => {
    expect(preferencesOf(null)).toBe(DEFAULT_PREFERENCES);
    expect(preferencesOf({ id: "u", email: "", currency: "USD", weight_unit: "kg",
      budget_start_day: 1, language: "en", created_at: "" })).toBe(DEFAULT_PREFERENCES);
  });

  it("a patch replaces whole subtrees, like the server", () => {
    const next = applyPatch(DEFAULT_PREFERENCES, gymOff);
    expect(next.modules.gym).toBe(false);
    expect(next.phone).toBe(DEFAULT_PREFERENCES.phone);
  });
});

describe("PreferenceSaver", () => {
  it("shows a change at once, before the server answers", () => {
    const { send } = controlledSend();
    const shown = vi.fn();
    const saver = new PreferenceSaver(DEFAULT_PREFERENCES, send, shown);
    void saver.update(gymOff);
    expect(shown).toHaveBeenLastCalledWith(applyPatch(DEFAULT_PREFERENCES, gymOff));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never has two requests out, so the last asked is the last applied", async () => {
    // The server applies patches in the order they arrive. Were both sent at once, the
    // first could land second and leave the account with Books on while the screen said off.
    const { send, calls } = controlledSend();
    const shown = vi.fn();
    const saver = new PreferenceSaver(DEFAULT_PREFERENCES, send, shown);

    const first = saver.update(gymOff);
    const second = saver.update(gymAndBooksOff);
    expect(send).toHaveBeenCalledTimes(1);
    expect(shown).toHaveBeenLastCalledWith(applyPatch(DEFAULT_PREFERENCES, gymAndBooksOff));

    at(calls, 0).resolve(applyPatch(DEFAULT_PREFERENCES, gymOff));
    await first;
    // The first answer does not pull the screen back to "only Gym off".
    expect(shown).toHaveBeenLastCalledWith(applyPatch(DEFAULT_PREFERENCES, gymAndBooksOff));
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(at(calls, 1).patch).toEqual(gymAndBooksOff);

    at(calls, 1).resolve(applyPatch(DEFAULT_PREFERENCES, gymAndBooksOff));
    await second;
    expect(saver.shown).toEqual(applyPatch(DEFAULT_PREFERENCES, gymAndBooksOff));
  });

  it("merges the changes queued behind one request into the next", async () => {
    const { send, calls } = controlledSend();
    const saver = new PreferenceSaver(DEFAULT_PREFERENCES, send, vi.fn());
    void saver.update(gymOff);
    const a = saver.update(gymAndBooksOff);
    const b = saver.update(phoneStatsHidden);

    at(calls, 0).resolve(applyPatch(DEFAULT_PREFERENCES, gymOff));
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(at(calls, 1).patch).toEqual({ ...gymAndBooksOff, ...phoneStatsHidden });

    at(calls, 1).resolve(applyPatch(applyPatch(DEFAULT_PREFERENCES, gymAndBooksOff), phoneStatsHidden));
    await Promise.all([a, b]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("reverts a failed change to what the server last confirmed, and says so", async () => {
    const { send, calls } = controlledSend();
    const shown = vi.fn();
    const saver = new PreferenceSaver(DEFAULT_PREFERENCES, send, shown);
    const done = saver.update(gymOff);

    at(calls, 0).reject(new Error("offline"));
    await expect(done).rejects.toThrow("offline");
    expect(shown).toHaveBeenLastCalledWith(DEFAULT_PREFERENCES);
    expect(saver.shown).toEqual(DEFAULT_PREFERENCES);
  });

  it("drops only the failed patch, keeping what was queued behind it", async () => {
    const { send, calls } = controlledSend();
    const saver = new PreferenceSaver(DEFAULT_PREFERENCES, send, vi.fn());
    const failed = saver.update(gymOff);
    const kept = saver.update(phoneStatsHidden);

    at(calls, 0).reject(new Error("500"));
    await expect(failed).rejects.toThrow("500");
    expect(saver.shown).toEqual(applyPatch(DEFAULT_PREFERENCES, phoneStatsHidden));
    await flush();
    expect(at(calls, 1).patch).toEqual(phoneStatsHidden);

    at(calls, 1).resolve(applyPatch(DEFAULT_PREFERENCES, phoneStatsHidden));
    await kept;
    expect(saver.shown.modules.gym).toBe(true);
  });

  it("adopts a state confirmed elsewhere under whatever is still pending", () => {
    const { send } = controlledSend();
    const saver = new PreferenceSaver(DEFAULT_PREFERENCES, send, vi.fn());
    void saver.update(phoneStatsHidden);
    saver.confirm(applyPatch(DEFAULT_PREFERENCES, gymOff));
    expect(saver.shown.modules.gym).toBe(false);
    expect(saver.shown.phone).toEqual(phoneStatsHidden.phone);
  });
});
