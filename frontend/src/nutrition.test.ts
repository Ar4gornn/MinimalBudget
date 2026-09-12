import { describe, expect, it } from "vitest";

import {
  formatEnergy,
  formatMacro,
  quantityLabel,
  sumNutrient,
  trim,
} from "./nutrition";
import { translator } from "./i18n/catalogue";

const EN = translator("en");
const FR = translator("fr");

/**
 * The client's half of the nutrition contract (Epic 27).
 *
 * Nothing here computes nutrition — every figure arrives derived. What these hold is the
 * two rules that are the client's own: **null is not zero**, and **arithmetic and rounding
 * happen on scaled integers**, never on floats.
 *
 * Both rules were checked by breaking them. Zero-filling the nulls turns
 * "nobody typed a protein figure" into "this meal has no protein", and rounding a macro
 * with `toFixed(1)` turns 0.15 into 0.1, because 0.15 is not 0.15 in binary.
 *
 * One honest limit, recorded rather than implied: at the magnitudes this app deals with —
 * at most six figures before the point — summing calories as floats and formatting with
 * `toFixed` gives the same answer as the integer path for every value tried. The integer
 * path is the house rule (`money.ts`, `quantity.ts`) and it stays, but no test here claims
 * a calorie count that floats would get wrong, because there is not one to show.
 */
describe("summing", () => {
  it("adds in whole ten-thousandths and keeps four places", () => {
    expect(sumNutrient(["247.0000", "6.0750"])).toBe("253.0750");
  });

  it("skips a contributor that has no figure rather than counting it as zero", () => {
    expect(sumNutrient(["100.0000", null, "50.0000"])).toBe("150.0000");
  });

  it("reports nothing at all when no contributor had a figure", () => {
    // Not "0.0000": zero is a claim that the food contains none of it, which is a
    // different statement from nobody having typed the number.
    expect(sumNutrient([null, null])).toBeNull();
    expect(sumNutrient([])).toBeNull();
  });
});

describe("formatting", () => {
  it("rounds a half calorie up, in both directions", () => {
    expect(formatEnergy("246.5000")).toBe("247");
    expect(formatEnergy("247.5000")).toBe("248");
  });

  it("rounds a macro on the integer, which is where floats actually get it wrong", () => {
    // `Number("0.15").toFixed(1)` is "0.1": 0.15 is stored as a shade under 0.15, so the
    // half rounds the wrong way. Every fifth tenth has this problem — 0.35, 0.85, 0.95.
    expect(formatMacro("0.1500")).toBe("0.2");
    expect(formatMacro("0.9500")).toBe("1.0");
    expect(formatMacro("12.1500")).toBe("12.2");
    expect(formatMacro("0.0000")).toBe("0.0");
  });

  it("keeps null as null through both", () => {
    expect(formatEnergy(null)).toBeNull();
    expect(formatMacro(null)).toBeNull();
  });

  it("trims the trailing zeros a wire format carries", () => {
    expect(trim("200.000")).toBe("200");
    expect(trim("0.500")).toBe("0.5");
    expect(trim("3")).toBe("3");
  });
});

describe("quantities", () => {
  it("writes grams and millilitres the way a scale does", () => {
    expect(quantityLabel("200.000", "g", EN)).toBe("200 g");
    expect(quantityLabel("250.000", "ml", EN)).toBe("250 ml");
  });

  it("leaves a count bare, because the food's name is the noun", () => {
    // "3 unit" is not something anybody writes, and the label is always read next to the
    // food — "3 Egg".
    expect(quantityLabel("3.000", "unit", EN)).toBe("3");
    expect(quantityLabel("3.000", "unit", FR)).toBe("3");
  });
});
