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

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Category {
  id: string;
  kind: EntryKind;
  name: string;
  created_at: string;
}

export interface Entry {
  id: string;
  kind: EntryKind;
  category_id: string;
  amount: Money;
  occurred_on: string;
  note: string | null;
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
