import { describe, expect, it } from "vitest";

import {
  formatQuantity,
  isQuantity,
  isRate,
  recallUnit,
  rememberUnit,
  solveAmount,
  solveQuantity,
  solveRate,
} from "./quantity";

describe("solving for the third figure", () => {
  it("derives the rate the way the server does: four places, half-up", () => {
    expect(solveRate("60.00", "40.000")).toBe("1.5000");
    // 60.14 / 40.123 = 1.49889... -> 1.4989, the same figure the API returns.
    expect(solveRate("60.14", "40.123")).toBe("1.4989");
  });

  it("derives the amount from quantity and rate, to the cent", () => {
    expect(solveAmount("40.000", "1.5000")).toBe("60.00");
    // 40.123 * 1.499 = 60.144... -> 60.14
    expect(solveAmount("40.123", "1.4990")).toBe("60.14");
  });

  it("derives the quantity from amount and rate, to the millilitre", () => {
    expect(solveQuantity("60.00", "1.5000")).toBe("40.000");
    expect(solveQuantity("50.00", "1.4990")).toBe("33.356");
  });

  it("never touches a float on the way", () => {
    // 0.1 + 0.2 territory: 0.30 for 0.100 must be exactly 3.0000.
    expect(solveRate("0.30", "0.100")).toBe("3.0000");
  });
});

describe("shape checks", () => {
  it("accepts a positive three-place quantity and nothing else", () => {
    expect(isQuantity("40")).toBe(true);
    expect(isQuantity("40.123")).toBe(true);
    expect(isQuantity("40.1234")).toBe(false);
    expect(isQuantity("0")).toBe(false);
    expect(isQuantity("-1")).toBe(false);
    expect(isQuantity("1_0")).toBe(false);
  });

  it("accepts a positive four-place rate", () => {
    expect(isRate("1.4989")).toBe(true);
    expect(isRate("1.49891")).toBe(false);
    expect(isRate("0")).toBe(false);
  });

  it("trims trailing zeros for display only", () => {
    expect(formatQuantity("40.000")).toBe("40");
    expect(formatQuantity("2.500")).toBe("2.5");
    expect(formatQuantity("40.123")).toBe("40.123");
  });
});

describe("remembering a category's unit", () => {
  it("recalls the unit case-insensitively, and null for a stranger", () => {
    rememberUnit("Fuel", "l");
    expect(recallUnit("fuel")).toBe("l");
    expect(recallUnit("Rent")).toBeNull();
  });
});
