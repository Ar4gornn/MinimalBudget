import { describe, expect, it } from "vitest";

import { currentMonth, monthLabel, monthTick, shiftMonth, todayIso } from "./months";

describe("months", () => {
  it("shifts across a year boundary in both directions", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-08", -6)).toBe("2026-02");
  });

  it("pads single-digit months", () => {
    expect(shiftMonth("2026-10", -1)).toBe("2026-09");
    expect(currentMonth(new Date(2026, 0, 5))).toBe("2026-01");
  });

  it("formats an ISO date from local parts, not UTC", () => {
    // Constructing from local parts avoids the classic off-by-one where a date late in
    // the day in a negative-offset timezone serialises as the previous day.
    expect(todayIso(new Date(2026, 7, 31))).toBe("2026-08-31");
    expect(todayIso(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("labels months", () => {
    expect(monthLabel("2026-08")).toBe("August 2026");
    expect(monthTick("2026-08")).toBe("Aug");
  });
});
