import { describe, expect, it } from "vitest";

import {
  formatMoney,
  fromCents,
  isNonNegativeMoney,
  isPositiveMoney,
  progress,
  subtractMoney,
  toCents,
} from "./money";

describe("money", () => {
  it("subtracts without the float error that started this whole convention", () => {
    // 0.30 - 0.20 === 0.09999999999999998 as floats. Not here.
    expect(subtractMoney("0.30", "0.20")).toBe("0.10");
    expect(subtractMoney("1234568.00", "0.11")).toBe("1234567.89");
  });

  it("subtracts into negatives", () => {
    expect(subtractMoney("400.00", "845.50")).toBe("-445.50");
    expect(subtractMoney("10.00", "10.00")).toBe("0.00");
  });

  it("round-trips through cents", () => {
    for (const value of ["0.00", "0.01", "999.99", "1000000.00", "-45.50"]) {
      expect(fromCents(toCents(value))).toBe(value);
    }
  });

  it("keeps both decimal places when formatting", () => {
    expect(formatMoney("1200.00")).toBe("1,200.00");
    expect(formatMoney("0.05")).toBe("0.05");
  });

  it("accepts only two-place amounts, and only positive ones where the label says so", () => {
    for (const check of [isPositiveMoney, isNonNegativeMoney]) {
      expect(check("12.34")).toBe(true);
      expect(check("12")).toBe(true);
      expect(check("12.345")).toBe(false);
      expect(check("-12.34")).toBe(false);
      expect(check("")).toBe(false);
      expect(check("abc")).toBe(false);
    }
    // The difference, and the reason there are two: an entry of 0.00 is not a
    // transaction, but a budget of 0.00 means "I intend to spend nothing here".
    expect(isPositiveMoney("0")).toBe(false);
    expect(isPositiveMoney("0.00")).toBe(false);
    expect(isNonNegativeMoney("0")).toBe(true);
    expect(isNonNegativeMoney("0.00")).toBe(true);
  });

  it("reports progress, and nothing when there is no target", () => {
    expect(progress("400.00", "1000.00")).toBe(40);
    expect(progress("45.50", null)).toBeNull();
    expect(progress("50.00", "0.00")).toBe(100);
    expect(progress("0.00", "0.00")).toBe(0);
    // Clamped for display; the "over budget" colour carries the overspend, not the width.
    expect(progress("2000.00", "1000.00")).toBe(100);
  });
});
