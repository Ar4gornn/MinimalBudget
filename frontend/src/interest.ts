/**
 * Interest projections.
 *
 * Simulated month by month in integer cents rather than evaluated as a closed-form
 * formula. Two reasons, and the second is the real one:
 *
 *   - it produces the per-period series the chart and table need for free;
 *   - it handles contributions, which have no tidy closed form once the compounding
 *     period and the contribution period differ.
 *
 * Interest accrues at full precision and is rounded once, for display. Rounding at every
 * monthly accrual was the first attempt and it drifts: half-up rounding biases upward, by
 * a cent over one year and ten cents over ten. A projection that disagrees with every
 * reference calculator by ten cents reads as broken, and unlike a bank statement there is
 * no real account here whose rounding this would be reproducing.
 *
 * Contributions are added *after* each month's interest — an ordinary annuity. That is the
 * conservative convention and the one most savings products use; paying interest on money
 * deposited at the end of the month would flatter the result.
 */

import { fromCents, toCents } from "./money";
import type { Money } from "./api/types";

export type Compounding = "monthly" | "quarterly" | "annually";
export type InterestMode = "compound" | "simple";

export interface ProjectionInput {
  initial: Money;
  monthlyContribution: Money;
  /** Nominal annual rate, as a percentage: 5 means 5%. */
  annualRatePercent: number;
  years: number;
  compounding: Compounding;
  mode: InterestMode;
}

export interface ProjectionPoint {
  /** Months elapsed. 0 is the starting position, before any interest. */
  month: number;
  /** Everything paid in: the initial amount plus contributions so far. */
  contributed: Money;
  interest: Money;
  balance: Money;
}

export interface Projection {
  points: ProjectionPoint[];
  finalBalance: Money;
  totalContributed: Money;
  totalInterest: Money;
  /** Total interest as a percentage of everything paid in. Null when nothing was paid in. */
  growthPercent: number | null;
}

const MONTHS_PER_PERIOD: Record<Compounding, number> = {
  monthly: 1,
  quarterly: 3,
  annually: 12,
};

export function project(input: ProjectionInput): Projection {
  const months = Math.round(input.years * 12);
  const contribution = toCents(input.monthlyContribution);
  const startingCents = toCents(input.initial);

  const periodMonths = MONTHS_PER_PERIOD[input.compounding];
  // The rate applied at each compounding event. A 6% annual rate compounded quarterly
  // applies 1.5% four times, not 6% once.
  const periodRate = input.annualRatePercent / 100 / (12 / periodMonths);
  const monthlyRate = input.annualRatePercent / 100 / 12;

  let contributed = startingCents;
  // Kept exact; rounded only when a point is emitted. See the note above.
  let interestExact = 0;

  const points: ProjectionPoint[] = [
    {
      month: 0,
      contributed: fromCents(contributed),
      interest: fromCents(0),
      balance: fromCents(contributed),
    },
  ];

  for (let month = 1; month <= months; month += 1) {
    if (input.mode === "compound") {
      // Interest joins the balance and earns interest itself, but only on a compounding
      // boundary — that is the whole difference between monthly and annual compounding.
      if (month % periodMonths === 0) {
        interestExact += (contributed + interestExact) * periodRate;
      }
    } else {
      // Simple interest is computed on the principal only, so accumulated interest never
      // earns anything. Accrued monthly so the series is smooth.
      interestExact += contributed * monthlyRate;
    }

    contributed += contribution;

    const interest = Math.round(interestExact);
    points.push({
      month,
      contributed: fromCents(contributed),
      interest: fromCents(interest),
      balance: fromCents(contributed + interest),
    });
  }

  const totalContributed = contributed;
  const totalInterest = Math.round(interestExact);
  return {
    points,
    finalBalance: fromCents(totalContributed + totalInterest),
    totalContributed: fromCents(totalContributed),
    totalInterest: fromCents(totalInterest),
    growthPercent: totalContributed > 0 ? (totalInterest / totalContributed) * 100 : null,
  };
}

/** Every twelfth point, for a table that would otherwise run to hundreds of rows. */
export function yearlyPoints(projection: Projection): ProjectionPoint[] {
  return projection.points.filter((point) => point.month % 12 === 0);
}
