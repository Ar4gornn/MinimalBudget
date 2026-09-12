/**
 * Nutrition display and arithmetic (Epic 27).
 *
 * The same discipline `money.ts` and `quantity.ts` follow, for the same reason: a figure
 * arrives as a decimal string and is added as a **scaled integer**, never as a float.
 * Summing "247.0000" and "6.0750" through `Number` gives an answer with a tail of nines on
 * it, which then shows up on a calendar cell.
 *
 * A derived nutrient may be `null`, and null is not zero: null means nothing that
 * contributed carried a value for it. Every function here keeps that distinction —
 * `sumNutrient` over an array of nulls is null, not `"0.0000"`.
 */

import type { DerivedNutrient, FoodBasis, Nutrition, RecipeUnit } from "./api/types";
import type { MessageKey, Translate } from "./i18n/catalogue";
import { fromTenThousandths, toTenThousandths } from "./quantity";

/** The four, in the order they are read on a label. Named once so nothing retypes them. */
export const NUTRIENTS = ["kcal", "protein", "carbs", "fat"] as const;
export type NutrientKey = (typeof NUTRIENTS)[number];

export const NUTRIENT_LABEL: Record<NutrientKey, MessageKey> = {
  kcal: "rec.kcal",
  protein: "rec.protein",
  carbs: "rec.carbs",
  fat: "rec.fat",
};

const BASIS_LABEL: Record<FoodBasis, MessageKey> = {
  per_100g: "rec.basisPer100g",
  per_100ml: "rec.basisPer100ml",
  per_unit: "rec.basisPerUnit",
};

export function basisLabel(basis: FoodBasis, t: Translate): string {
  return t(BASIS_LABEL[basis]);
}

/**
 * A quantity with its unit, as one string.
 *
 * `unit` gets no suffix on purpose: "3 unit" is not something anybody writes, and the
 * count is always read beside the food's name, which supplies the noun — "3 Egg". Grams
 * and millilitres are written the way they are on a scale.
 */
export function quantityLabel(quantity: string, unit: RecipeUnit, t: Translate): string {
  const trimmed = trim(quantity);
  if (unit === "unit") return trimmed;
  return `${trimmed} ${unit === "g" ? t("rec.gramsUnit") : "ml"}`;
}

/** "200.000" -> "200", "0.500" -> "0.5". Trailing zeros are noise on a screen. */
export function trim(decimal: string): string {
  if (!decimal.includes(".")) return decimal;
  return decimal.replace(/\.?0+$/, "");
}

/**
 * Calories, to the whole number.
 *
 * Rounded on the scaled integer rather than by `toFixed`, which rounds half-to-even on a
 * float — so 0.5 kcal would sometimes go down. Nobody notices a kcal, but the same helper
 * rounds the macros, where the half-place is visible.
 */
export function formatEnergy(value: DerivedNutrient): string | null {
  if (value === null) return null;
  return String(Math.round(toTenThousandths(value) / 10000));
}

/** A macro, to one decimal place: "12.1500" -> "12.2". */
export function formatMacro(value: DerivedNutrient): string | null {
  if (value === null) return null;
  const tenths = Math.round(toTenThousandths(value) / 1000);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

export function formatNutrient(key: NutrientKey, value: DerivedNutrient): string | null {
  return key === "kcal" ? formatEnergy(value) : formatMacro(value);
}

/**
 * Add up one nutrient across several figures.
 *
 * Whole ten-thousandths throughout, the way the calendar's money line is summed in whole
 * cents. Null contributors are skipped rather than counted as zero; if every one of them
 * is null there is nothing to report and the answer is null, not `"0.0000"`.
 */
export function sumNutrient(values: DerivedNutrient[]): DerivedNutrient {
  const known = values.filter((value): value is string => value !== null);
  if (known.length === 0) return null;
  return fromTenThousandths(known.reduce((total, value) => total + toTenThousandths(value), 0));
}

/** The same sum over whole nutrition objects — what a calendar day cell needs. */
export function sumEnergy(rows: { nutrition: Nutrition }[]): DerivedNutrient {
  return sumNutrient(rows.map((row) => row.nutrition.kcal));
}
