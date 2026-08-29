/**
 * Money helpers.
 *
 * AD-5: amounts arrive and leave as two-place decimal strings. Nothing here converts one
 * to a `number` for storage or transmission — only for the width of a chart bar, where
 * losing the last cent to a float is harmless and unavoidable.
 */

import type { Money } from "./api/types";

export function subtractMoney(a: Money, b: Money): Money {
  return fromCents(toCents(a) - toCents(b));
}

export function toCents(value: Money): number {
  const negative = value.trimStart().startsWith("-");
  const [whole = "0", fraction = ""] = value.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function fromCents(cents: number): Money {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/** Only for laying out a chart. Never for a value that goes back to the server. */
export function toChartNumber(value: Money): number {
  return toCents(value) / 100;
}

// Pinned rather than locale-derived, deliberately. The API speaks two-place decimal
// strings with a dot, and the amount inputs accept exactly that; on a French locale the
// default formatter renders "1 200,00" while the field beside it still demands
// "1200.00", so the screen and the keyboard disagree about what a number looks like.
const formatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Group digits for display, keeping both decimal places. */
export function formatMoney(value: Money): string {
  return formatter.format(toCents(value) / 100);
}

const MONEY_SHAPE = /^\d{1,12}(\.\d{1,2})?$/;

/** Amounts on entries and contributions must be above zero — the sign lives in `kind`. */
export function isPositiveMoney(value: string): boolean {
  const text = value.trim();
  return MONEY_SHAPE.test(text) && toCents(text) > 0;
}

/** Budgets and targets may be zero: "I intend to spend nothing here". */
export function isNonNegativeMoney(value: string): boolean {
  return MONEY_SHAPE.test(value.trim());
}

/** Percentage of a target reached, clamped for display. Returns null if there is no target. */
export function progress(actual: Money, target: Money | null): number | null {
  if (target === null) return null;
  const targetCents = toCents(target);
  if (targetCents === 0) return toCents(actual) > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, (toCents(actual) / targetCents) * 100));
}
