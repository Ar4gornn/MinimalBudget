import { describe, expect, it } from "vitest";

import {
  budgetMonth,
  currentMonth,
  monthBounds,
  monthLabel,
  monthOf,
  monthRangeLabel,
  monthTick,
  shiftMonth,
  todayIso,
} from "./months";

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

  describe("a budget month that does not start on the 1st", () => {
    it("labels the period by the month it ends in, matching the server", () => {
      // Start day 26: "September" is 26 August to 25 September.
      expect(monthBounds("2026-09", 26)).toEqual([new Date(2026, 7, 26), new Date(2026, 8, 25)]);
      expect(monthBounds("2026-10", 26)).toEqual([new Date(2026, 8, 26), new Date(2026, 9, 25)]);
      // Day 1 is the calendar month, unchanged.
      expect(monthBounds("2026-09", 1)).toEqual([new Date(2026, 8, 1), new Date(2026, 8, 30)]);
    });

    it("puts a date in the same period the server would", () => {
      expect(monthOf(new Date(2026, 7, 25), 26)).toBe("2026-08");
      expect(monthOf(new Date(2026, 7, 26), 26)).toBe("2026-09");
      expect(monthOf(new Date(2026, 8, 25), 26)).toBe("2026-09");
      expect(monthOf(new Date(2026, 8, 26), 26)).toBe("2026-10");
      expect(monthOf(new Date(2026, 8, 15), 1)).toBe("2026-09");
    });

    it("opens on the period today falls in, not the calendar month", () => {
      // The 26th is already next period for someone paid on the 26th.
      expect(budgetMonth(26, new Date(2026, 8, 26))).toBe("2026-10");
      expect(budgetMonth(26, new Date(2026, 8, 25))).toBe("2026-09");
      expect(budgetMonth(1, new Date(2026, 8, 26))).toBe("2026-09");
    });

    it("spells the range out, and says nothing when there is nothing to explain", () => {
      expect(monthRangeLabel("2026-09", 26)).toBe("26 Aug – 25 Sep");
      expect(monthRangeLabel("2026-09", 1)).toBe("");
    });

    it("covers every day exactly once, whatever the start day", () => {
      for (const startDay of [1, 15, 26, 28]) {
        let previousEnd: Date | null = null;
        for (let month = 1; month <= 12; month += 1) {
          const label = `2026-${String(month).padStart(2, "0")}`;
          const [start, end] = monthBounds(label, startDay);
          expect(start.getTime()).toBeLessThanOrEqual(end.getTime());
          if (previousEnd) {
            const dayAfter = new Date(previousEnd);
            dayAfter.setDate(dayAfter.getDate() + 1);
            expect(start.toDateString()).toBe(dayAfter.toDateString());
          }
          previousEnd = end;
        }
      }
    });
  });
});
