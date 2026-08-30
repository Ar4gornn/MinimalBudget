import { describe, expect, it } from "vitest";

import { project, yearlyPoints } from "./interest";
import type { ProjectionInput } from "./interest";

const base: ProjectionInput = {
  initial: "0.00",
  monthlyContribution: "0.00",
  annualRatePercent: 0,
  years: 1,
  compounding: "monthly",
  mode: "compound",
};

describe("compound interest", () => {
  it("matches the textbook figure for a lump sum", () => {
    // 1000 at 12% compounded monthly for a year is 1000 * 1.01^12 = 1126.8250...
    // Rounding to the cent each month, as a bank does, gives 1126.83.
    const result = project({ ...base, initial: "1000.00", annualRatePercent: 12 });
    expect(result.finalBalance).toBe("1126.83");
    expect(result.totalContributed).toBe("1000.00");
    expect(result.totalInterest).toBe("126.83");
  });

  it("matches the annuity figure for monthly contributions", () => {
    // 100/month at 12% compounded monthly for a year, contributions after interest:
    // 100 * ((1.01^12 - 1) / 0.01) = 1268.25.
    const result = project({
      ...base,
      monthlyContribution: "100.00",
      annualRatePercent: 12,
    });
    expect(result.totalContributed).toBe("1200.00");
    expect(result.finalBalance).toBe("1268.25");
  });

  it("compounds less often when the period is longer", () => {
    // The same nominal rate earns less annually than monthly — that is the entire point
    // of the compounding control, so it had better be visible in the number.
    const monthly = project({ ...base, initial: "1000.00", annualRatePercent: 12 });
    const quarterly = project({
      ...base,
      initial: "1000.00",
      annualRatePercent: 12,
      compounding: "quarterly",
    });
    const annually = project({
      ...base,
      initial: "1000.00",
      annualRatePercent: 12,
      compounding: "annually",
    });

    expect(annually.finalBalance).toBe("1120.00");
    expect(quarterly.finalBalance).toBe("1125.51");
    expect(Number(monthly.finalBalance)).toBeGreaterThan(Number(quarterly.finalBalance));
    expect(Number(quarterly.finalBalance)).toBeGreaterThan(Number(annually.finalBalance));
  });

  it("grows superlinearly over long horizons", () => {
    // Ten years of a lump sum at 7%: 1000 * (1 + 0.07/12)^120 ≈ 2009.66.
    const result = project({
      ...base,
      initial: "1000.00",
      annualRatePercent: 7,
      years: 10,
    });
    expect(result.finalBalance).toBe("2009.66");
  });
});

describe("simple interest", () => {
  it("pays interest on the principal only", () => {
    // 1000 at 12% simple for a year is exactly 120, never more.
    const result = project({
      ...base,
      initial: "1000.00",
      annualRatePercent: 12,
      mode: "simple",
    });
    expect(result.finalBalance).toBe("1120.00");
    expect(result.totalInterest).toBe("120.00");
  });

  it("always trails compound interest once there is more than one period", () => {
    const shared = { ...base, initial: "5000.00", annualRatePercent: 8, years: 5 };
    const simple = project({ ...shared, mode: "simple" });
    const compound = project({ ...shared, mode: "compound" });
    expect(Number(compound.finalBalance)).toBeGreaterThan(Number(simple.finalBalance));
  });
});

describe("edges", () => {
  it("returns the starting position when nothing happens", () => {
    const result = project({ ...base, initial: "500.00", years: 0 });
    expect(result.points).toHaveLength(1);
    expect(result.finalBalance).toBe("500.00");
    expect(result.totalInterest).toBe("0.00");
  });

  it("earns nothing at a zero rate, but still counts contributions", () => {
    const result = project({ ...base, monthlyContribution: "50.00", annualRatePercent: 0 });
    expect(result.totalInterest).toBe("0.00");
    expect(result.finalBalance).toBe("600.00");
  });

  it("handles a negative rate without going haywire", () => {
    // Not decoration: this is the number that shows what inflation does to cash.
    const result = project({ ...base, initial: "1000.00", annualRatePercent: -10 });
    expect(Number(result.finalBalance)).toBeLessThan(1000);
    expect(result.totalInterest.startsWith("-")).toBe(true);
  });

  it("reports growth as a percentage of what was paid in", () => {
    const result = project({ ...base, initial: "1000.00", annualRatePercent: 12 });
    expect(result.growthPercent).toBeCloseTo(12.683, 2);
  });

  it("has no growth percentage when nothing was paid in", () => {
    expect(project({ ...base, annualRatePercent: 5 }).growthPercent).toBeNull();
  });

  it("produces a point per month plus the starting position", () => {
    const result = project({ ...base, years: 3 });
    expect(result.points).toHaveLength(37);
    expect(result.points[0]?.month).toBe(0);
    expect(result.points[36]?.month).toBe(36);
  });

  it("reduces to one row per year for the table", () => {
    const yearly = yearlyPoints(project({ ...base, years: 5 }));
    expect(yearly.map((p) => p.month)).toEqual([0, 12, 24, 36, 48, 60]);
  });

  it("keeps balance equal to contributions plus interest at every point", () => {
    // The invariant the whole table depends on; a rounding slip would break it silently.
    const result = project({
      ...base,
      initial: "250.00",
      monthlyContribution: "75.00",
      annualRatePercent: 6.5,
      years: 4,
    });
    for (const point of result.points) {
      const expected = (Number(point.contributed) + Number(point.interest)).toFixed(2);
      expect(point.balance).toBe(expected);
    }
  });
});
