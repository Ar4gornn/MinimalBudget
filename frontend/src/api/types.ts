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
  /** Where it was bought. Null on every entry that predates the vendor, and on most. */
  vendor_id: string | null;
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

// ------------------------------------------------------------------ inventory

export interface Space {
  id: string;
  name: string;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  space_id: string;
  name: string;
  /** A whole number, set absolutely — never a delta. */
  quantity: number;
  restock_below: number | null;
  cost: Money | null;
  note: string | null;
  /** AD-30: computed in SQL from quantity and restock_below; never stored. */
  needs_restock: boolean;
  restocked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemChange {
  quantity_before: number;
  quantity_after: number;
  changed_at: string;
}

export interface SpaceRestockSeries {
  space_id: string;
  space_name: string;
  /** Restocks per month, zero-filled. */
  values: number[];
}

export interface Restocks {
  months: string[];
  series: SpaceRestockSeries[];
}

export type Cadence = "weekly" | "monthly" | "yearly";

export const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

/** A standing instruction: what recurs, how often, and whether it needs confirming. */
export interface RecurringTemplate {
  id: string;
  kind: EntryKind;
  category_id: string;
  amount: Money;
  note: string | null;
  cadence: Cadence;
  start_on: string;
  end_on: string | null;
  /** Opt-in: create the entry without asking. Off by default, deliberately. */
  auto: boolean;
  paused: boolean;
  next_due: string;
  created_at: string;
}

/** One due date of a template, waiting for a yes or a no. */
export interface PendingEntry {
  id: string;
  template_id: string;
  due_on: string;
  kind: EntryKind;
  category_id: string;
  category_name: string;
  amount: Money;
  note: string | null;
  cadence: Cadence;
}

/** One line of the shopping list: what to buy, how many, and the likely cost. */
export interface ShoppingRow {
  item_id: string;
  name: string;
  space_id: string;
  space_name: string;
  quantity: number;
  restock_below: number | null;
  unit_cost: Money | null;
  suggested: number;
  /** null when the item has no recorded cost — never "0.00", which would be a price. */
  estimate: Money | null;
}

export interface ShoppingList {
  items: ShoppingRow[];
  /** Covers only the rows that have a cost; `without_cost` says how many it leaves out. */
  estimate: Money;
  without_cost: number;
}

/** One restock that was paid for. The entry is null when it cost nothing. */
export interface Purchase {
  id: string;
  item_id: string;
  entry_id: string | null;
  quantity: number;
  purchased_on: string;
  created_at: string;
}

export interface PurchaseResult {
  item: InventoryItem;
  purchase: Purchase;
}

/** Where something was bought. Reference data, so the comparison is not three spellings. */
export interface Vendor {
  id: string;
  name: string;
  created_at: string;
}

export interface VendorPrice {
  vendor_id: string;
  vendor_name: string;
  /** Null for rows recorded without a quantity; they still count towards `spent`. */
  unit: Unit | null;
  spent: Money;
  entries: number;
  /** Null when nothing in this group carried a quantity — never "0.0000". */
  unit_price: Rate | null;
}

export interface VendorPrices {
  months: string[];
  vendors: VendorPrice[];
}

export interface PushStatus {
  /** False when the instance has no VAPID keys: the toggle is hidden rather than broken. */
  enabled: boolean;
  devices: number;
}
