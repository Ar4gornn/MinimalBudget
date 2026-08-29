import { describe, expect, it } from "vitest";

import { addMoney, formatMoney, fromCents, isValidMoney, progress, subtractMoney, toCents } from "./money";

describe("money", () => {
  it("adds without the float error that started this whole convention", () => {
    // 0.1 + 0.2 === 0.30000000000000004 as floats. Not here.
    expect(addMoney("0.10", "0.20")).toBe("0.30");
    expect(addMoney("1234567.89", "0.11")).toBe("1234568.00");
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

  it("accepts only two-place non-negative amounts", () => {
    expect(isValidMoney("12.34")).toBe(true);
    expect(isValidMoney("12")).toBe(true);
    expect(isValidMoney("12.345")).toBe(false);
    expect(isValidMoney("-12.34")).toBe(false);
    expect(isValidMoney("")).toBe(false);
    expect(isValidMoney("abc")).toBe(false);
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
