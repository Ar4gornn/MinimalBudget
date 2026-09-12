/**
 * Quantity and rate helpers (AD-29).
 *
 * A quantity is a three-place decimal string; a rate is a four-place one. Neither is money,
 * but both follow money's discipline: strings on the wire, and arithmetic only on scaled
 * integers, never on floats. "Enter any two of amount, quantity and unit price" is solved
 * here in whole cents, whole milli-units and whole ten-thousandths, then formatted back.
 */

import type { Money, Quantity, Rate, Unit } from "./api/types";
import { translator, type MessageKey, type Translate } from "./i18n/catalogue";
import { UNITS } from "./api/types";
import { fromCents, toCents } from "./money";

const EN = translator("en");

const QUANTITY_SHAPE = /^\d{1,9}(\.\d{1,3})?$/;
const RATE_SHAPE = /^\d{1,12}(\.\d{1,4})?$/;

export function isQuantity(value: string): boolean {
  const text = value.trim();
  return QUANTITY_SHAPE.test(text) && toMilli(text) > 0;
}

export function isRate(value: string): boolean {
  const text = value.trim();
  return RATE_SHAPE.test(text) && toTenThousandths(text) > 0;
}

/** "40.123" -> 40123. */
export function toMilli(value: string): number {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  return Number(whole) * 1000 + Number((fraction + "000").slice(0, 3));
}

/** 40123 -> "40.123". */
export function fromMilli(milli: number): Quantity {
  const rounded = Math.round(milli);
  return `${Math.floor(rounded / 1000)}.${String(rounded % 1000).padStart(3, "0")}`;
}

/** "1.4989" -> 14989. */
export function toTenThousandths(value: string): number {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  return Number(whole) * 10000 + Number((fraction + "0000").slice(0, 4));
}

/** 14989 -> "1.4989". */
export function fromTenThousandths(value: number): Rate {
  const rounded = Math.round(value);
  return `${Math.floor(rounded / 10000)}.${String(rounded % 10000).padStart(4, "0")}`;
}

/**
 * Solve for the missing figure. Given any two of amount, quantity and rate, return the
 * third; given fewer than two, return null. Rounding is half-up on the scaled integer,
 * matching the server's ROUND_HALF_UP.
 */
export function solveRate(amount: Money, quantity: Quantity): Rate {
  // rate = (cents / 100) / (milli / 1000) = cents * 10 / milli; in 1e-4 units: * 10000.
  return fromTenThousandths((toCents(amount) * 100000) / toMilli(quantity));
}

export function solveAmount(quantity: Quantity, rate: Rate): Money {
  // amount = (milli / 1000) * (r / 10000); in cents: * 100.
  return fromCents(Math.round((toMilli(quantity) * toTenThousandths(rate)) / 100000));
}

export function solveQuantity(amount: Money, rate: Rate): Quantity {
  // quantity = (cents / 100) / (r / 10000) = cents * 100 / r; in milli: * 1000.
  return fromMilli((toCents(amount) * 100000) / toTenThousandths(rate));
}

/** "1.4989 /l" — the short form beside an amount. */
export function formatRate(rate: Rate, unit: Unit): string {
  return `${rate} /${unit}`;
}

/**
 * "litres", "kWh" — the plural, for a column head or a picker.
 *
 * Only three of the seven units are words at all; the rest are symbols, which are the same
 * in every language. Called without a translator it answers in English, so the arithmetic
 * around it stays testable without mounting a provider.
 */
export function unitLabel(unit: Unit, t: Translate = EN): string {
  return t(`unit.${unit}` as MessageKey);
}

/** "per litre", "per kWh": the singular for a rate's caption. */
export function unitSingular(unit: Unit, t: Translate = EN): string {
  return t(`unitOne.${unit}` as MessageKey);
}

/** Trim trailing zeros for display only: "40.000" -> "40", "2.500" -> "2.5". */
export function formatQuantity(quantity: Quantity): string {
  return quantity.includes(".") ? quantity.replace(/\.?0+$/, "") : quantity;
}

// The unit a category was last quantified in, remembered per device so the form can
// pre-fill it. Fuel is litres every time; asking again is one tap too many at the pump.
const UNIT_MEMORY = "minimalbudget.unit.";

export function rememberUnit(categoryName: string, unit: Unit): void {
  try {
    window.localStorage.setItem(UNIT_MEMORY + categoryName.trim().toLowerCase(), unit);
  } catch {
    /* private window: forgetting is fine */
  }
}

export function recallUnit(categoryName: string): Unit | null {
  try {
    const stored = window.localStorage.getItem(UNIT_MEMORY + categoryName.trim().toLowerCase());
    return stored && (UNITS as readonly string[]).includes(stored)
      ? (stored as Unit)
      : null;
  } catch {
    return null;
  }
}
