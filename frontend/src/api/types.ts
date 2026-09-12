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

export type WeightUnit = "kg" | "lb";

/**
 * The languages this build has a catalogue for.
 *
 * Two letters rather than a BCP 47 tag: the app ships exactly the languages it can render,
 * and "fr-CA" would be a promise it does not keep. Mirrors the CHECK in migration 0019.
 */
export type Language = "en" | "fr";

export interface User {
  id: string;
  email: string;
  /** kg or lb. Like the currency, changing it relabels rather than converts. */
  weight_unit: WeightUnit;
  /** Which day the budget month starts on, 1-28. 1 is the calendar month (AD-10). */
  budget_start_day: number;
  /** Scoped to the account: one ledger, one currency, so totals need no conversion. */
  currency: Currency;
  /**
   * Which language the account reads in. On the account rather than in the browser so a
   * phone and a laptop agree, and so the daily push digest — composed on the host by cron,
   * with no browser anywhere — can be in the right language too. Never locked.
   */
  language: Language;
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

/** How wide a window the headline figures cover. */
export type Period = "month" | "year" | "all";

export interface Summary {
  /** The anchor that was asked for, echoed back. */
  month: string;
  period: Period;
  /** What to call the window: "2026-09", "2026", or "All time". */
  label: string;
  /** Inclusive at both ends. Null on both for all-time, which has no bounds. */
  start: string | null;
  end: string | null;
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

/**
 * Every cadence, in the order a picker offers them.
 *
 * The words moved to the message catalogue (`cadence.*`) in Epic 25 — this list is the wire
 * values, which are never translated. It stays here beside the type it enumerates.
 */
export const CADENCES: Cadence[] = ["weekly", "monthly", "yearly"];

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

/** A weight, as a two-place decimal string. Null for a bodyweight set — 0 would be a weight. */
export type Weight = string;

export interface Exercise {
  id: string;
  name: string;
  /** An https link to a form video. Opened externally, never embedded. */
  video_url: string | null;
  note: string | null;
  created_at: string;
}

export interface Routine {
  id: string;
  name: string;
  note: string | null;
  created_at: string;
}

export interface RoutineLine {
  id: string;
  exercise_id: string;
  exercise_name: string;
  video_url: string | null;
  position: number;
  target_sets: number | null;
  target_reps: number | null;
}

export interface RoutineDetail {
  id: string;
  name: string;
  note: string | null;
  lines: RoutineLine[];
}

export interface Workout {
  id: string;
  routine_id: string | null;
  performed_on: string;
  note: string | null;
  created_at: string;
}

export interface WorkoutSet {
  id: string;
  exercise_id: string;
  exercise_name: string;
  position: number;
  reps: number;
  weight: Weight | null;
}

export interface WorkoutDetail {
  id: string;
  routine_id: string | null;
  performed_on: string;
  note: string | null;
  sets: WorkoutSet[];
}

export interface HistoryPoint {
  performed_on: string;
  top_weight: Weight | null;
  reps: number;
  sets: number;
  /** Null on a session where nothing carried a weight. */
  volume: Weight | null;
}

export interface ExerciseHistory {
  exercise_id: string;
  exercise_name: string;
  points: HistoryPoint[];
}

// --- habits (Epic 23) -----------------------------------------------------

/** The window a target is judged over. Deliberately two members; see AD-40. */
/**
 * When a habit is due. What "enough" means within one occasion is `target_count`.
 *
 * `times_per_week` is the odd one out: its occasion is a whole Monday-week rather than a
 * day, which is the only way to say "three times a week, I do not mind which days". Every
 * other kind names days.
 */
export type ScheduleKind =
  | "daily"
  | "weekdays"
  | "every_n_days"
  | "day_of_month"
  | "nth_weekday"
  | "times_per_week";

/**
 * The plan, as a rule rather than as a sentence.
 *
 * The server never sends the words: "Mon, Wed, Fri" and "lun., mer., ven." are the same
 * rule in two languages, and the client is the only place that turns a stored fact into
 * something to read.
 */
export interface Schedule {
  kind: ScheduleKind;
  /** How many times within one occasion. The same meaning for all six kinds. */
  target_count: number;
  /** Bitmask, bit 0 = Monday. "Mon, Wed, Fri" is 21. Only for `weekdays`. */
  weekdays: number | null;
  /** Only for `every_n_days`. At least 2 — "every 1 days" is `daily`. */
  interval_days: number | null;
  /** 1..28, only for `day_of_month`. 28 because it is the widest day every month has. */
  day_of_month: number | null;
  /** 1..4, or -1 for the last one in the month. Only for `nth_weekday`. */
  nth: number | null;
  /** 0 = Monday. Only for `nth_weekday`. */
  weekday: number | null;
}

export interface Habit {
  id: string;
  name: string;
  schedule_kind: ScheduleKind;
  target_count: number;
  weekdays: number | null;
  interval_days: number | null;
  day_of_month: number | null;
  nth: number | null;
  weekday: number | null;
  started_on: string;
  /** Set while the habit is put away. Its check-ins survive; deleting takes them. */
  archived_at: string | null;
  /** Opted in to the daily digest. Off by default, so nothing nags unasked. */
  remind: boolean;
  note: string | null;
  created_at: string;
}

/**
 * One occurrence — not one day.
 *
 * `done_at` is the wall-clock time the person named, `"HH:MM:SS"`, or null for "did it,
 * did not say when". Null is not midnight, and the lists sort it last for that reason.
 */
export interface Checkin {
  id: string;
  habit_id: string;
  habit_name: string;
  done_on: string;
  done_at: string | null;
  note: string | null;
}

/** One of today's occurrences: enough to show it, and enough to take it back. */
export interface CheckinTime {
  id: string;
  done_at: string | null;
  note: string | null;
}

/** Computed on read, never stored: the schedule may change, and a stored figure could not. */
export interface HabitProgress {
  habit_id: string;
  name: string;
  schedule: Schedule;
  remind: boolean;

  /** Does the schedule ask for anything today? False on a Tuesday for a Mon/Wed/Fri habit. */
  due_today: boolean;
  /** Inclusive bounds of the occasion in progress. Null on a day nothing is asked for. */
  occasion_start: string | null;
  occasion_end: string | null;
  /** Check-ins inside that occasion; today's count when there is no occasion. */
  done: number;
  met: boolean;

  today_done: number;
  today_times: CheckinTime[];

  /**
   * The Monday-week rollup — the "2 of 3 this week" figure, counted in **occasions**.
   * `window_due` is how many times the schedule asked this week, so for a Mon/Wed/Fri
   * habit it is 3 whatever day it is, and for a monthly habit it is usually 0.
   */
  window_start: string;
  window_end: string;
  window_due: number;
  window_done: number;

  /** The next day the schedule asks for, after today. */
  next_due: string | null;
  /** Consecutive met occasions. The open occasion is never counted as a miss. */
  streak: number;
}

export interface HeatmapDay {
  on: string;
  times: number;
  /** Was this day asked for, on or before today? Lets a missed Monday differ from a
   *  Tuesday that was never a habit day. */
  due: boolean;
}

export interface Heatmap {
  habit_id: string;
  name: string;
  schedule: Schedule;
  /** Half-open `[start_on, end_on)`, Monday-aligned. Not a budget month. */
  start_on: string;
  end_on: string;
  /** Every day in the window, not only the ones with check-ins. */
  days: HeatmapDay[];
}

// --- mood (Epic 24) -------------------------------------------------------

/**
 * A point on the scale: 1 is the worst, 5 the best, and the axis is *one* axis.
 *
 * A number and not a name, because the drawing is presentation: restyling the faces must
 * not rewrite a stored row. It is also why "angry" and "sad" are not points on it — neither
 * is more than the other, and an unordered set admits no summary but a per-name tally
 * (AD-41, AD-42).
 */
export type MoodPoint = 1 | 2 | 3 | 4 | 5;

/**
 * One day, answered or not. Addressed by its date; there is no id, and at most one row.
 *
 * `day_ok` has **three** states and the UI must not flatten them: true, false, and null —
 * which is "did not say", not "no".
 */
export interface MoodDay {
  on: string;
  mood: MoodPoint | null;
  day_ok: boolean | null;
  note: string | null;
}

/** How many days in the window carried this point. Zero-filled, so all five are present. */
export interface MoodCount {
  point: MoodPoint;
  days: number;
}

/**
 * The strip and the tally, counted by the server.
 *
 * Counts, never a mean: a five-point scale is ordinal, so an average of it is arithmetic on
 * labels. `days_answered` is the denominator everything here is read against — a day with
 * no row is a day nobody answered, not a bad one.
 */
export interface MoodHistory {
  /** Half-open `[start_on, end_on)`, so `end_on` is tomorrow. Not a budget month. */
  start_on: string;
  end_on: string;
  days: MoodDay[];
  counts: MoodCount[];
  days_with_mood: number;
  days_ok: number;
  days_not_ok: number;
  days_answered: number;
}

// --- calendar reads (Epic 22) ---------------------------------------------

/**
 * One row of the quantity log, named, across every item.
 *
 * `changed_at` is an instant, not a day somebody chose, so the calendar places it by its
 * **UTC** day — the same choice the restock chart makes, and stated on the page.
 * `quantity_before === quantity_after` is the level written down when an item is created,
 * not a movement.
 */
export interface StockChange {
  item_id: string;
  item_name: string;
  quantity_before: number;
  quantity_after: number;
  changed_at: string;
}

/**
 * A date a recurring template *will* fall due. Computed, never written, never actionable
 * (AD-39) — which is why it carries no id: there is no row to confirm or skip.
 */
export interface ExpectedEntry {
  template_id: string;
  due_on: string;
  kind: EntryKind;
  category_id: string;
  category_name: string;
  amount: Money;
  note: string | null;
  cadence: Cadence;
  /** True when the template creates its entry without asking. */
  auto: boolean;
}

// --- recipes, nutrition and meals (Epic 27) ---------------------------------

/**
 * What one stored nutrition figure describes.
 *
 * The list is closed on the server by a CHECK and mirrored here; a basis the server does
 * not know is refused rather than stored as free text.
 */
export const FOOD_BASES = ["per_100g", "per_100ml", "per_unit"] as const;
export type FoodBasis = (typeof FOOD_BASES)[number];

/**
 * The recipes module's own closed unit list — deliberately **not** `Unit` above.
 *
 * `Unit` (AD-29) exists so this month's litres of fuel compare with last month's on an
 * expense. Grams and millilitres are not in it, and adding them would make `g` selectable
 * beside `kg` on an entry, which splits a unit-price series in two with no conversion
 * between the halves. Two lists, each owned by the module that compares within it.
 */
export const RECIPE_UNITS = ["g", "ml", "unit"] as const;
export type RecipeUnit = (typeof RECIPE_UNITS)[number];

/** Per one basis amount, as a two-place decimal string. Null is *not known*, never zero. */
export type StoredNutrient = string | null;

/**
 * A derived figure: a four-place decimal string (AD-29), or null.
 *
 * Null when nothing that contributed carried the nutrient — `"0.0000"` would be a claim
 * that the meal contains none of it, which is a different statement from not knowing.
 */
export type DerivedNutrient = string | null;

/** How many contributors carried no value. Always sent, even when every count is zero. */
export interface UnknownCounts {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Nutrition {
  kcal: DerivedNutrient;
  protein: DerivedNutrient;
  carbs: DerivedNutrient;
  fat: DerivedNutrient;
  unknown: UnknownCounts;
}

export interface Food {
  id: string;
  name: string;
  basis: FoodBasis;
  /** The unit this basis obliges an ingredient to use. The server's rule, not the client's. */
  unit: RecipeUnit;
  kcal: StoredNutrient;
  protein: StoredNutrient;
  carbs: StoredNutrient;
  fat: StoredNutrient;
}

export interface Ingredient {
  id: string;
  food_id: string;
  food_name: string;
  basis: FoodBasis;
  quantity: Quantity;
  unit: RecipeUnit;
  position: number;
  /** What this line alone contributes, so a reader can see where the calories came from. */
  nutrition: Nutrition;
}

export interface Step {
  id: string;
  position: number;
  text: string;
}

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  note: string | null;
  ingredient_count: number;
  step_count: number;
  total: Nutrition;
  per_serving: Nutrition;
}

export interface RecipeDetail extends Recipe {
  ingredients: Ingredient[];
  steps: Step[];
}

/**
 * A record of something eaten, never a plan (AD-35).
 *
 * One of two shapes: a recipe in servings, or a bare food in a quantity. The unused half
 * is null, which the database itself enforces.
 */
export interface Meal {
  id: string;
  eaten_on: string;
  recipe_id: string | null;
  recipe_name: string | null;
  servings: Quantity | null;
  food_id: string | null;
  food_name: string | null;
  quantity: Quantity | null;
  unit: RecipeUnit | null;
  note: string | null;
  nutrition: Nutrition;
}
