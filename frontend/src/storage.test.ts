/**
 * The rename from MinimalBudget must not sign anyone out or forget a preference: every
 * `minimalbudget.*` key is carried to `everything-everywhere.*` once, on boot.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { LEGACY_PREFIX, PREFIX, migrateLegacyStorage } from "./storage";

beforeEach(() => window.localStorage.clear());

describe("migrateLegacyStorage", () => {
  it("carries every legacy key across and removes the old one", () => {
    window.localStorage.setItem("minimalbudget.token", "t1");
    window.localStorage.setItem("minimalbudget.refresh", "r1");
    window.localStorage.setItem("minimalbudget.language", "fr");
    window.localStorage.setItem("minimalbudget.collapsed.savings", "1");
    window.localStorage.setItem("unrelated", "keep");

    expect(migrateLegacyStorage()).toBe(4);

    expect(window.localStorage.getItem("everything-everywhere.token")).toBe("t1");
    expect(window.localStorage.getItem("everything-everywhere.refresh")).toBe("r1");
    expect(window.localStorage.getItem("everything-everywhere.language")).toBe("fr");
    expect(window.localStorage.getItem("everything-everywhere.collapsed.savings")).toBe("1");
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
    for (let i = 0; i < window.localStorage.length; i++) {
      expect(window.localStorage.key(i)?.startsWith(LEGACY_PREFIX)).toBe(false);
    }
  });

  it("never overwrites a value already under the new name", () => {
    window.localStorage.setItem("minimalbudget.token", "old");
    window.localStorage.setItem("everything-everywhere.token", "new");

    expect(migrateLegacyStorage()).toBe(0);

    expect(window.localStorage.getItem("everything-everywhere.token")).toBe("new");
    expect(window.localStorage.getItem("minimalbudget.token")).toBeNull();
  });

  it("is a no-op the second time and on an empty store", () => {
    expect(migrateLegacyStorage()).toBe(0);
    window.localStorage.setItem("minimalbudget.period", "month");
    expect(migrateLegacyStorage()).toBe(1);
    expect(migrateLegacyStorage()).toBe(0);
    expect(window.localStorage.getItem(`${PREFIX}period`)).toBe("month");
  });

  it("survives a storage that throws", () => {
    const broken = {
      get length() {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(migrateLegacyStorage(broken)).toBe(0);
  });
});
