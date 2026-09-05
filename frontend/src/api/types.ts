/**
 * The wire contract, mirrored from the FastAPI schemas.
 *
 * Every monetary value is `string`, not `number`, and deliberately so (AD-5): the server
 * sends two-place decimal strings because a JavaScript number cannot hold them exactly.
 * The `Money` alias exists to make that visible at every use site rather than looking like
 * a stringly-typed accident.
 */

export type Money = string;

export type EntryKind = "income" | "expense";

/** AD-20: every collection is enveloped, so a cursor can be added without breaking this. */
export interface Page<T> {
  items: T[];
}

export type Currency = "USD" | "EUR";

export interface User {
  id: string;
  email: string;
  /** Scoped to the account: one ledger, one currency, so totals need no conversion. */
  currency: Currency;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
  expires_in: number;
  /** Long-lived and rotated on every use. See docs/architecture.md AD-27. */
  refresh_token: string;
}

export interface Category {
  id: string;
  kind: EntryKind;
  name: string;
  created_at: string;
}

/**
 * AD-29: the closed list of units a quantity can be in. Defined once, here; the select in
 * the entry form and the labels beside a rate both read from it.
 */
export const UNITS = ["l", "gal", "kg", "lb", "kwh", "m3", "unit"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  l: "litres",
  gal: "gallons",
  kg: "kg",
  lb: "lb",
  kwh: "kWh",
  m3: "m³",
  unit: "units",
};

/** "per litre", "per kWh": the singular for a rate's caption. */
export const UNIT_SINGULAR: Record<Unit, string> = {
  l: "litre",
  gal: "gallon",
  kg: "kg",
  lb: "lb",
  kwh: "kWh",
  m3: "m³",
  unit: "unit",
};

/** A three-place decimal string: how much of something was bought. */
export type Quantity = string;

/** A four-place decimal string. Derived, never money, never a number (AD-29). */
export type Rate = string;

export interface Entry {
  id: string;
  kind: EntryKind;
  category_id: string;
  amount: Money;
  occurred_on: string;
  note: string | null;
  quantity: Quantity | null;
  unit: Unit | null;
  /** Computed by the server from amount and quantity; null when there is no quantity. */
  unit_price: Rate | null;
  created_at: string;
}

export interface SavingsType {
  id: string;
  name: string;
  created_at: string;
}

export interface Contribution {
  id: string;
  savings_type_id: string;
  amount: Money;
  occurred_on: string;
  note: string | null;
  created_at: string;
}

export interface Budget {
  category_id: string;
  monthly_amount: Money;
  updated_at: string;
}

export interface Target {
  savings_type_id: string;
  monthly_amount: Money;
  updated_at: string;
}

export interface BudgetVsActual {
  category_id: string;
  category_name: string;
  /** null means spent here without ever setting a budget. */
  budget: Money | null;
  actual: Money;
}

export interface TargetVsActual {
  savings_type_id: string;
  savings_type_name: string;
  target: Money | null;
  actual: Money;
}

export interface Summary {
  month: string;
  income: Money;
  expense: Money;
  net: Money;
  saved: Money;
  budgets: BudgetVsActual[];
  savings: TargetVsActual[];
}

export interface CategorySeries {
  category_id: string;
  category_name: string;
  values: Money[];
}

export interface Trends {
  months: string[];
  income: Money[];
  expense: Money[];
  saved: Money[];
  expense_by_category: CategorySeries[];
}

export interface UnitPriceSeries {
  category_id: string;
  category_name: string;
  unit: Unit;
  /** null for a month with no quantified purchase — not zero, because zero is a price. */
  unit_price: (Rate | null)[];
  /** Zero for such a month, because "bought nothing" is a quantity. */
  quantity: Quantity[];
}

export interface UnitPrices {
  months: string[];
  series: UnitPriceSeries[];
}
