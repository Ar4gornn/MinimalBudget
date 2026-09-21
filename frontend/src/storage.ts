/**
 * The app was called MinimalBudget until 2026-09, and every localStorage key carried that
 * name as its prefix: the session tokens, the language, collapsed cards, the dashboard
 * period, unit memory. A rename that only changed the constants would sign every browser
 * out and forget every preference at once — so the values are carried across, once, before
 * anything reads them.
 *
 * Old keys are removed after the copy, so the pass is idempotent and the old name leaves
 * the browser. A value already under the new key wins: it was written by this version and
 * is the fresher one.
 */

export const LEGACY_PREFIX = "minimalbudget.";
export const PREFIX = "everything-everywhere.";

/** Returns how many values were carried across; 0 when there was nothing to do. */
export function migrateLegacyStorage(storage: Storage = window.localStorage): number {
  let moved = 0;
  try {
    const legacy: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(LEGACY_PREFIX)) legacy.push(key);
    }
    for (const key of legacy) {
      const target = PREFIX + key.slice(LEGACY_PREFIX.length);
      const value = storage.getItem(key);
      if (value !== null && storage.getItem(target) === null) {
        storage.setItem(target, value);
        moved += 1;
      }
      storage.removeItem(key);
    }
  } catch {
    // Storage blocked or unavailable: there is nothing to carry, and nothing to read later.
  }
  return moved;
}
