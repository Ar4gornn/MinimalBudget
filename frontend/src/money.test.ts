import { describe, expect, it } from "vitest";

import {
  currencySymbol,
  formatAmount,
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


describe("currency", () => {
  it("uses the account's symbol", () => {
    expect(formatAmount("1200.00", "USD")).toBe("$1,200.00");
    expect(formatAmount("1200.00", "EUR")).toBe("€1,200.00");
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("EUR")).toBe("€");
  });

  it("puts the minus before the symbol, not after it", () => {
    // "$-45.50" is what naive concatenation produces and it reads as a typo.
    expect(formatAmount("-45.50", "USD")).toBe("-$45.50");
    expect(formatAmount("-45.50", "EUR")).toBe("-€45.50");
  });

  it("keeps grouping pinned regardless of currency", () => {
    // The locale is deliberately fixed so the display matches what the inputs accept;
    // switching to euros must not smuggle European grouping back in.
    expect(formatAmount("1234567.89", "EUR")).toBe("€1,234,567.89");
  });

  it("still formats zero and small amounts", () => {
    expect(formatAmount("0.00", "USD")).toBe("$0.00");
    expect(formatAmount("0.05", "EUR")).toBe("€0.05");
  });
});
