/**
 * AD-16: the only place in the application that touches the network.
 *
 * Auth headers, the `{ items: [...] }` envelope of AD-20, and the 401 path each exist
 * exactly once here. No component or hook calls `fetch` — which is also what lets the v2
 * Expo client reuse this module rather than reimplementing the contract.
 */

import type {
  Budget,
  Currency,
  Category,
  Food,
  FoodBasis,
  Exercise,
  ExerciseHistory,
  Checkin,
  Contribution,
  Entry,
  ExpectedEntry,
  EntryKind,
  InventoryItem,
  ItemChange,
  Language,
  Habit,
  ScheduleKind,
  HabitProgress,
  Heatmap,
  Meal,
  Money,
  MoodDay,
  MoodHistory,
  MoodPoint,
  Cadence,
  Page,
  PendingEntry,
  Period,
  PushStatus,
  Purchase,
  PurchaseResult,
  Quantity,
  Recipe,
  RecipeDetail,
  RecipeUnit,
  RecurringTemplate,
  Restocks,
  Routine,
  RoutineDetail,
  RoutineLine,
  SavingsType,
  ShoppingList,
  Space,
  Step,
  StockChange,
  Summary,
  Target,
  Token,
  Trends,
  Unit,
  UnitPrices,
  User,
  Vendor,
  VendorPrices,
  Weight,
  WeightUnit,
  Workout,
  WorkoutDetail,
  WorkoutSet,
} from "./types";

// AD-15: configuration, never a hardcoded host. Empty means "same origin", which is what
// the dev server's /api proxy provides.
const BASE = (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "";

const TOKEN_KEY = "minimalbudget.token";
const REFRESH_KEY = "minimalbudget.refresh";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /**
     * The server's stable code for this refusal (AD-44), or null when it sent none.
     *
     * `message` is the server's English sentence and stays the fallback; the code is what
     * the client keys its own wording off, so a French screen never has to render it. A
     * status alone never carries the meaning — a 409 on a habit and a 409 on a category
     * need different words, and a 401 is a wrong password on one path and an expired
     * session on another.
     */
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let onUnauthorized: (() => void) | null = null;

/** Registered once by the auth provider, so the 401 path is not duplicated per call. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private windows and blocked site data both throw here. Not being able to remember
    // a session is a smaller problem than a blank page.
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_KEY);
    else window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* see readToken */
  }
}

export function readRefreshToken(): string | null {
  try {
    return window.localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function writeRefreshToken(token: string | null): void {
  try {
    if (token === null) window.localStorage.removeItem(REFRESH_KEY);
    else window.localStorage.setItem(REFRESH_KEY, token);
  } catch {
    /* see readToken */
  }
}

export function storeTokens(token: Token): void {
  writeToken(token.access_token);
  writeRefreshToken(token.refresh_token);
}

export function clearTokens(): void {
  writeToken(null);
  writeRefreshToken(null);
}

// One refresh in flight at a time. Without this, a page that fires five requests on mount
// would race five refreshes — and since every refresh rotates, four of them would present
// an already-rotated token and trip reuse detection, signing the user out for loading a page.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return false;

  const response = await fetch(`${BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    clearTokens();
    return false;
  }
  storeTokens((await response.json()) as Token);
  return true;
}

function refreshOnce(): Promise<boolean> {
  refreshInFlight ??= refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const token = readToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${BASE}${path}`, { ...init, headers });
}

const CREDENTIAL_ENDPOINTS = new Set(["/api/auth/login", "/api/auth/recover"]);

/**
 * The paths a 401 must **not** trigger a refresh-and-retry on.
 *
 * Named individually rather than matched by an `/api/auth/` prefix. The prefix looks right
 * and is far too wide: it also swept up `/api/auth/me` and every `me/*` setting, which are
 * ordinary bearer-authenticated endpoints — so opening the app after the access token aged
 * out signed the person out while a perfectly good refresh token sat unused, which is
 * precisely what the refresh flow exists to prevent (AD-27).
 *
 * What genuinely belongs here: the credential endpoints, where a 401 is a wrong password
 * rather than an expired session, and `logout`, which needs no token and is idempotent.
 * `/api/auth/refresh` never reaches this function — it is sent with a bare `fetch`.
 */
const NEVER_RETRIED = new Set([
  "/api/auth/login",
  "/api/auth/recover",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/refresh",
]);

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init);

  // A 401 means the short-lived access token aged out. Refresh once and retry, so a
  // family member is not sent back to a sign-in screen every hour.
  if (response.status === 401 && !NEVER_RETRIED.has(path)) {
    if (await refreshOnce()) {
      response = await send(path, init);
    }
  }

  if (response.status === 401) {
    // A 401 from a credential endpoint is a wrong password or a wrong code, not an expired
    // session: report the server's own words and leave the sign-in form alone.
    if (CREDENTIAL_ENDPOINTS.has(path)) {
      const body = await response.json().catch(() => null);
      throw new ApiError(401, detailOf(body, 401), codeOf(body));
    }
    clearTokens();
    onUnauthorized?.();
    throw new ApiError(
      401,
      "Your session has expired. Please sign in again.",
      // Decided here rather than read off the body: the session really has ended, whatever
      // the server called it, and this is the one message the client knows better.
      "session_expired",
    );
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, detailOf(body, response.status), codeOf(body));
  }
  return body as T;
}

/**
 * The server's error code, when it sent one (AD-44).
 *
 * Absent on FastAPI's own validation 422s, which carry a list of field errors and no code
 * of ours — those fall back to the detail, which at least names the field.
 */
function codeOf(body: unknown): string | null {
  if (body && typeof body === "object" && "code" in body) {
    const code = (body as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

/** FastAPI sends `{detail: string}` for domain errors and a list of objects for 422. */
function detailOf(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const first = detail[0] as { msg?: unknown } | undefined;
      if (first && typeof first.msg === "string") return first.msg;
    }
  }
  return `Request failed (${status}).`;
}

const query = (params: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
};

/** AD-20: unwrapped once, here, so no caller has to know the envelope exists. */
const items = async <T>(promise: Promise<Page<T>>): Promise<T[]> => (await promise).items;

export interface EntryInput {
  kind: EntryKind;
  amount: Money;
  occurred_on: string;
  note?: string | null;
  category_id?: string;
  category_name?: string;
  /** At most one of the two; a name creates the vendor. Explicit null clears it. */
  vendor_id?: string | null;
  vendor_name?: string;
  /** AD-29: both or neither. Sent as an explicit null pair to clear. */
  quantity?: Quantity | null;
  unit?: Unit | null;
}

export interface TemplateInput {
  kind: EntryKind;
  amount: Money;
  cadence: Cadence;
  start_on: string;
  end_on?: string | null;
  note?: string | null;
  auto?: boolean;
  paused?: boolean;
  category_id?: string;
  category_name?: string;
}

export interface ItemInput {
  name: string;
  quantity: number;
  restock_below?: number | null;
  cost?: Money | null;
  note?: string | null;
  space_id?: string;
  space_name?: string;
}

/**
 * Fetch a file rather than JSON.
 *
 * A plain link cannot be used: the export endpoints need the bearer token, and an <a href>
 * carries no headers. So the file is fetched with auth like any other request, then handed
 * to the browser as a blob.
 */
async function download(path: string, fallbackName: string): Promise<void> {
  const response = await send(path, {});
  if (response.status === 401 && (await refreshOnce())) {
    return download(path, fallbackName);
  }
  if (!response.ok) {
    throw new ApiError(response.status, `Could not export (${response.status}).`);
  }

  // The server names the file and dates it; the fallback is only for a proxy that strips
  // the header.
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const name = match?.[1] ?? fallbackName;

  const url = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Revoked, or the blob is held for the life of the page.
    URL.revokeObjectURL(url);
  }
}


export interface FoodInput {
  name: string;
  basis: FoodBasis;
  /**
   * Two-place decimal strings, exactly as they came back from the server.
   *
   * `null` clears a figure back to *not known*, which is different from omitting the key
   * — an omitted key leaves the stored value alone.
   */
  kcal?: string | null;
  protein?: string | null;
  carbs?: string | null;
  fat?: string | null;
}

export interface MealInput {
  eaten_on: string;
  /** One of the two shapes; the server refuses both and neither. */
  recipe_id?: string;
  /** Omitted with a recipe means one serving, which is what "I ate this" means. */
  servings?: Quantity;
  food_id?: string;
  quantity?: Quantity;
  note?: string | null;
}

export const api = {
  register: (
    email: string,
    password: string,
    inviteCode?: string,
    currency?: Currency,
    language?: Language,
  ) =>
    request<User>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        // Omitted entirely when blank: an instance running REGISTRATION_MODE=open
        // should not have to receive a field it ignores.
        ...(inviteCode?.trim() ? { invite_code: inviteCode.trim() } : {}),
        ...(currency ? { currency } : {}),
        // Whatever the sign-in page was being read in, so the first screen after
        // registering is already right. Freely changed afterwards.
        ...(language ? { language } : {}),
      }),
    }),

  login: (email: string, password: string) =>
    request<Token>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<User>("/api/auth/me"),

  /** Forgot password: email + one unused recovery code + the replacement. 204 on success. */
  recover: (email: string, code: string, newPassword: string) =>
    request<void>("/api/auth/recover", {
      method: "POST",
      body: JSON.stringify({ email, code: code.trim(), new_password: newPassword }),
    }),

  /** Revokes every session, including this one; the caller signs in again. */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/api/auth/me/password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),

  /** A fresh set, shown once. Replaces any earlier set. */
  generateRecoveryCodes: (password: string) =>
    request<{ codes: string[] }>("/api/auth/me/recovery-codes", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  recoveryStatus: () => request<{ unused: number; total: number }>("/api/auth/me/recovery-codes"),

  setCurrency: (currency: Currency) =>
    request<User>("/api/auth/me/currency", {
      method: "PATCH",
      body: JSON.stringify({ currency }),
    }),

  logout: (refreshToken: string) =>
    request<void>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  listCategories: (kind?: EntryKind) =>
    items(request<Page<Category>>(`/api/categories${query({ kind })}`)),

  createCategory: (name: string, kind: EntryKind) =>
    request<Category>("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name, kind }),
    }),

  deleteCategory: (id: string) =>
    request<void>(`/api/categories/${id}`, { method: "DELETE" }),

  /** Never refused, whatever is already recorded — see migration 0019. */
  setLanguage: (language: Language) =>
    request<User>("/api/auth/me/language", {
      method: "PATCH",
      body: JSON.stringify({ language }),
    }),

  setBudgetStartDay: (day: number) =>
    request<User>("/api/auth/me/budget-start-day", {
      method: "PATCH",
      body: JSON.stringify({ budget_start_day: day }),
    }),

  setWeightUnit: (weightUnit: WeightUnit) =>
    request<User>("/api/auth/me/weight-unit", {
      method: "PATCH",
      body: JSON.stringify({ weight_unit: weightUnit }),
    }),

  listExercises: () => items(request<Page<Exercise>>("/api/gym/exercises")),

  createExercise: (input: { name: string; video_url?: string | null; note?: string | null }) =>
    request<Exercise>("/api/gym/exercises", { method: "POST", body: JSON.stringify(input) }),

  updateExercise: (
    id: string,
    patch: { name?: string; video_url?: string | null; note?: string | null },
  ) =>
    request<Exercise>(`/api/gym/exercises/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteExercise: (id: string) =>
    request<void>(`/api/gym/exercises/${id}`, { method: "DELETE" }),

  exerciseHistory: (id: string) =>
    request<ExerciseHistory>(`/api/gym/exercises/${id}/history`),

  listRoutines: () => items(request<Page<Routine>>("/api/gym/routines")),

  createRoutine: (name: string, note?: string) =>
    request<Routine>("/api/gym/routines", {
      method: "POST",
      body: JSON.stringify({ name, ...(note ? { note } : {}) }),
    }),

  readRoutine: (id: string) => request<RoutineDetail>(`/api/gym/routines/${id}`),

  deleteRoutine: (id: string) => request<void>(`/api/gym/routines/${id}`, { method: "DELETE" }),

  addRoutineLine: (
    routineId: string,
    input: {
      exercise_id?: string;
      exercise_name?: string;
      target_sets?: number | null;
      target_reps?: number | null;
    },
  ) =>
    request<RoutineLine>(`/api/gym/routines/${routineId}/exercises`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  removeRoutineLine: (lineId: string) =>
    request<void>(`/api/gym/routines/lines/${lineId}`, { method: "DELETE" }),

  listWorkouts: (filters: { month?: string; limit?: number } = {}) =>
    items(
      request<Page<Workout>>(
        `/api/gym/workouts${query({
          month: filters.month,
          limit: filters.limit ? String(filters.limit) : undefined,
        })}`,
      ),
    ),

  startWorkout: (input: { performed_on?: string; routine_id?: string; note?: string }) =>
    request<Workout>("/api/gym/workouts", { method: "POST", body: JSON.stringify(input) }),

  readWorkout: (id: string) => request<WorkoutDetail>(`/api/gym/workouts/${id}`),

  deleteWorkout: (id: string) => request<void>(`/api/gym/workouts/${id}`, { method: "DELETE" }),

  logSet: (
    workoutId: string,
    input: { exercise_id?: string; exercise_name?: string; reps: number; weight?: Weight },
  ) =>
    request<WorkoutSet>(`/api/gym/workouts/${workoutId}/sets`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  deleteSet: (id: string) => request<void>(`/api/gym/sets/${id}`, { method: "DELETE" }),

  pushStatus: () => request<PushStatus>("/api/push/status"),

  pushKey: () => request<{ public_key: string }>("/api/push/key"),

  pushSubscribe: (input: { endpoint: string; p256dh: string; auth: string }) =>
    request<void>("/api/push/subscribe", { method: "POST", body: JSON.stringify(input) }),

  pushUnsubscribe: (endpoint: string) =>
    request<void>("/api/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    }),

  listVendors: () => items(request<Page<Vendor>>("/api/vendors")),

  createVendor: (name: string) =>
    request<Vendor>("/api/vendors", { method: "POST", body: JSON.stringify({ name }) }),

  deleteVendor: (id: string) => request<void>(`/api/vendors/${id}`, { method: "DELETE" }),

  /** The comparison vendors exist for: is one shop dearer than another, for this category? */
  vendorPrices: (categoryId: string, months: number, ending?: string) =>
    request<VendorPrices>(
      `/api/dashboard/vendor-prices${query({ category_id: categoryId, months: String(months), ending })}`,
    ),

  listEntries: (
    filters: { kind?: EntryKind; month?: string; category_id?: string; q?: string } = {},
  ) =>
    items(request<Page<Entry>>(`/api/entries${query(filters)}`)),

  createEntry: (input: EntryInput) =>
    request<Entry>("/api/entries", { method: "POST", body: JSON.stringify(input) }),

  updateEntry: (id: string, patch: Partial<EntryInput>) =>
    request<Entry>(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteEntry: (id: string) => request<void>(`/api/entries/${id}`, { method: "DELETE" }),

  listSavingsTypes: () => items(request<Page<SavingsType>>("/api/savings/types")),

  createSavingsType: (name: string) =>
    request<SavingsType>("/api/savings/types", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  deleteSavingsType: (id: string) =>
    request<void>(`/api/savings/types/${id}`, { method: "DELETE" }),

  listContributions: (filters: { month?: string; savings_type_id?: string } = {}) =>
    items(request<Page<Contribution>>(`/api/savings/contributions${query(filters)}`)),

  createContribution: (input: {
    savings_type_id: string;
    amount: Money;
    occurred_on: string;
    note?: string | null;
  }) =>
    request<Contribution>("/api/savings/contributions", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  deleteContribution: (id: string) =>
    request<void>(`/api/savings/contributions/${id}`, { method: "DELETE" }),

  listTargets: () => items(request<Page<Target>>("/api/savings/targets")),

  setTarget: (typeId: string, monthlyAmount: Money) =>
    request<Target>(`/api/savings/targets/${typeId}`, {
      method: "PUT",
      body: JSON.stringify({ monthly_amount: monthlyAmount }),
    }),

  listBudgets: () => items(request<Page<Budget>>("/api/budgets")),

  setBudget: (categoryId: string, monthlyAmount: Money) =>
    request<Budget>(`/api/budgets/${categoryId}`, {
      method: "PUT",
      body: JSON.stringify({ monthly_amount: monthlyAmount }),
    }),

  shoppingList: () => request<ShoppingList>("/api/inventory/shopping-list"),

  /** AD-31's one cross-module write: restock the item and record what it cost, together. */
  purchaseItem: (
    id: string,
    input: {
      quantity: number;
      amount?: Money;
      occurred_on?: string;
      category_id?: string;
      category_name?: string;
    },
  ) =>
    request<PurchaseResult>(`/api/inventory/items/${id}/purchase`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  itemPurchases: (id: string) =>
    items(request<Page<Purchase>>(`/api/inventory/items/${id}/purchases`)),

  listTemplates: () => items(request<Page<RecurringTemplate>>("/api/recurring/templates")),

  createTemplate: (input: TemplateInput) =>
    request<RecurringTemplate>("/api/recurring/templates", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateTemplate: (id: string, patch: Partial<Omit<TemplateInput, "category_name">>) =>
    request<RecurringTemplate>(`/api/recurring/templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteTemplate: (id: string) =>
    request<void>(`/api/recurring/templates/${id}`, { method: "DELETE" }),

  /** Reading this is what brings the proposals up to date; it writes no entries. */
  listPending: () => items(request<Page<PendingEntry>>("/api/recurring/pending")),

  confirmPending: (id: string, amount?: Money) =>
    request<Entry>(`/api/recurring/occurrences/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify(amount ? { amount } : {}),
    }),

  skipPending: (id: string) =>
    request<void>(`/api/recurring/occurrences/${id}/skip`, { method: "POST" }),

  exportCsv: (kind: "entries" | "savings" | "inventory") =>
    download(`/api/export/${kind}.csv`, `minimalbudget-${kind}.csv`),

  summary: (month: string, period: Period = "month") =>
    request<Summary>(
      `/api/dashboard/summary${query({ month, period: period === "month" ? undefined : period })}`,
    ),

  trends: (months: number, ending?: string) =>
    request<Trends>(`/api/dashboard/trends${query({ months: String(months), ending })}`),

  unitPrices: (months: number, ending?: string) =>
    request<UnitPrices>(
      `/api/dashboard/unit-prices${query({ months: String(months), ending })}`,
    ),

  // --- inventory (AD-31: its own endpoints, composed by pages, never joined by the server)

  listSpaces: () => items(request<Page<Space>>("/api/inventory/spaces")),

  createSpace: (name: string) =>
    request<Space>("/api/inventory/spaces", { method: "POST", body: JSON.stringify({ name }) }),

  renameSpace: (id: string, name: string) =>
    request<Space>(`/api/inventory/spaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  deleteSpace: (id: string) =>
    request<void>(`/api/inventory/spaces/${id}`, { method: "DELETE" }),

  listItems: (filters: { space_id?: string; needs_restock?: boolean; q?: string } = {}) =>
    items(
      request<Page<InventoryItem>>(
        `/api/inventory/items${query({
          space_id: filters.space_id,
          needs_restock: filters.needs_restock === undefined ? undefined : String(filters.needs_restock),
        })}`,
      ),
    ),

  createItem: (input: ItemInput) =>
    request<InventoryItem>("/api/inventory/items", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // space_name is a create-time convenience only; a move names the space by id.
  updateItem: (id: string, patch: Partial<Omit<ItemInput, "space_name">>) =>
    request<InventoryItem>(`/api/inventory/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteItem: (id: string) => request<void>(`/api/inventory/items/${id}`, { method: "DELETE" }),

  itemHistory: (id: string, days = 90) =>
    items(
      request<Page<ItemChange>>(`/api/inventory/items/${id}/history${query({ days: String(days) })}`),
    ),

  restocks: (months: number, ending?: string) =>
    request<Restocks>(`/api/inventory/restocks${query({ months: String(months), ending })}`),

  // --- calendar reads. Each belongs to the module that owns the rows; the calendar page
  // composes them, exactly as the dashboard composes its cards (AD-31, AD-37).

  stockChanges: (month: string) =>
    items(request<Page<StockChange>>(`/api/inventory/changes${query({ month })}`)),

  /** A forecast. Reading it writes nothing and materialises nothing (AD-39). */
  expectedEntries: (month: string) =>
    items(request<Page<ExpectedEntry>>(`/api/recurring/expected${query({ month })}`)),

  // --- habits (Epics 23 and 26)

  listHabits: (archived = false) =>
    items(request<Page<Habit>>(`/api/habits${query({ archived: archived ? "true" : undefined })}`)),

  createHabit: (input: {
    name: string;
    schedule_kind: ScheduleKind;
    target_count: number;
    weekdays?: number | null;
    interval_days?: number | null;
    day_of_month?: number | null;
    nth?: number | null;
    weekday?: number | null;
    started_on?: string;
    remind?: boolean;
    note?: string | null;
  }) => request<Habit>("/api/habits", { method: "POST", body: JSON.stringify(input) }),

  /**
   * Sending `schedule_kind` rewrites the whole schedule — the columns the new kind does not
   * use are cleared server-side. Sending only a parameter (say `weekdays`) adjusts the kind
   * already stored.
   */
  updateHabit: (
    id: string,
    patch: {
      name?: string;
      schedule_kind?: ScheduleKind;
      target_count?: number;
      weekdays?: number | null;
      interval_days?: number | null;
      day_of_month?: number | null;
      nth?: number | null;
      weekday?: number | null;
      remind?: boolean;
      archived?: boolean;
      note?: string | null;
    },
  ) => request<Habit>(`/api/habits/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  /** Takes the check-ins with it. Archiving is the reversible alternative. */
  deleteHabit: (id: string) => request<void>(`/api/habits/${id}`, { method: "DELETE" }),

  habitProgress: () => items(request<Page<HabitProgress>>("/api/habits/progress")),

  listCheckins: (filters: { month?: string; habit_id?: string } = {}) =>
    items(request<Page<Checkin>>(`/api/habits/checkins${query(filters)}`)),

  /**
   * One occurrence, one row. `done_at` is `"HH:MM"` wall clock; omitting it records "did
   * it, did not say when", which is a different claim from midnight.
   */
  checkIn: (
    habitId: string,
    input: { done_on?: string; done_at?: string | null; note?: string } = {},
  ) =>
    request<Checkin>(`/api/habits/${habitId}/checkins`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** Remove one occurrence by its id. With three doses recorded, undo has to say which. */
  deleteCheckIn: (habitId: string, checkinId: string) =>
    request<void>(`/api/habits/${habitId}/checkins/${checkinId}`, { method: "DELETE" }),

  /** Correct one occurrence. Only the keys present are written; `done_at: null` clears it. */
  amendCheckIn: (
    habitId: string,
    checkinId: string,
    patch: { done_at?: string | null; note?: string | null },
  ) =>
    request<Checkin>(`/api/habits/${habitId}/checkins/${checkinId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  habitHeatmap: (habitId: string, weeks = 12) =>
    request<Heatmap>(`/api/habits/${habitId}/heatmap${query({ weeks: String(weeks) })}`),

  // --- mood (Epic 24). Its own module, reached by the pages that show it — the Habits
  // page composes this the way the dashboard composes the inventory's endpoint (AD-37).

  /** A day, answered or not. Never a 404: an unanswered day is an answer to the question. */
  moodDay: (on: string) => request<MoodDay>(`/api/mood/days/${on}`),

  /**
   * Replace a day's answer; both nulls clear it and the row goes.
   *
   * PUT, not PATCH: absent and null mean the same thing on this resource — no answer to
   * that question — so a partial update would need a third state on the wire to tell
   * "leave it" from "clear it".
   */
  setMoodDay: (
    on: string,
    body: { mood: MoodPoint | null; day_ok: boolean | null; note?: string | null },
  ) => request<MoodDay>(`/api/mood/days/${on}`, { method: "PUT", body: JSON.stringify(body) }),

  /** Answered days in one budget month — what the calendar's mood layer reads. */
  moodDays: (month: string) => items(request<Page<MoodDay>>(`/api/mood/days${query({ month })}`)),

  moodHistory: (days = 30) =>
    request<MoodHistory>(`/api/mood/history${query({ days: String(days) })}`),
  // --- recipes, nutrition and meals (Epic 27). Its own module: no endpoint here reaches
  // into the ledger or the inventory, and the calendar composes this layer at the edge
  // beside the other seven (AD-31, AD-37).

  listFoods: () => items(request<Page<Food>>("/api/foods")),

  createFood: (body: FoodInput) =>
    request<Food>("/api/foods", { method: "POST", body: JSON.stringify(body) }),

  /** Only the keys present are written. The basis is refused once a recipe or meal uses it. */
  updateFood: (id: string, body: Partial<FoodInput>) =>
    request<Food>(`/api/foods/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  /** 409 `food_in_use` when a recipe or a meal still points at it. */
  deleteFood: (id: string) => request<void>(`/api/foods/${id}`, { method: "DELETE" }),

  listRecipes: () => items(request<Page<Recipe>>("/api/recipes")),

  createRecipe: (body: { name: string; servings: number; note?: string | null }) =>
    request<Recipe>("/api/recipes", { method: "POST", body: JSON.stringify(body) }),

  readRecipe: (id: string) => request<RecipeDetail>(`/api/recipes/${id}`),

  updateRecipe: (
    id: string,
    body: { name?: string; servings?: number; note?: string | null },
  ) =>
    request<RecipeDetail>(`/api/recipes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  /** 409 `recipe_in_use` when it has been eaten — history is kept, not tidied away. */
  deleteRecipe: (id: string) => request<void>(`/api/recipes/${id}`, { method: "DELETE" }),

  /**
   * Every ingredient write answers with the **whole recipe**.
   *
   * Adding a line moves the totals, the per-serving figures and every other line's share
   * of them, so returning the line alone would leave the page to either recompute those —
   * a second implementation of the arithmetic — or fetch the recipe again anyway.
   */
  addIngredient: (
    recipeId: string,
    body: { food_id: string; quantity: Quantity; unit?: RecipeUnit },
  ) =>
    request<RecipeDetail>(`/api/recipes/${recipeId}/ingredients`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateIngredient: (
    recipeId: string,
    id: string,
    body: { quantity?: Quantity; position?: number },
  ) =>
    request<RecipeDetail>(`/api/recipes/${recipeId}/ingredients/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteIngredient: (recipeId: string, id: string) =>
    request<RecipeDetail>(`/api/recipes/${recipeId}/ingredients/${id}`, { method: "DELETE" }),

  /** A new step always goes last; the order is changed by `reorderSteps`. */
  addStep: (recipeId: string, text: string) =>
    items(
      request<Page<Step>>(`/api/recipes/${recipeId}/steps`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    ),

  updateStep: (recipeId: string, id: string, text: string) =>
    request<Step>(`/api/recipes/${recipeId}/steps/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }),

  /** Answers with the survivors, renumbered — deleting step 2 of four moves the two below. */
  deleteStep: (recipeId: string, id: string) =>
    items(request<Page<Step>>(`/api/recipes/${recipeId}/steps/${id}`, { method: "DELETE" })),

  /** The whole new order. A partial list is refused rather than half-applied. */
  reorderSteps: (recipeId: string, ids: string[]) =>
    items(
      request<Page<Step>>(`/api/recipes/${recipeId}/steps/order`, {
        method: "PUT",
        body: JSON.stringify({ ids }),
      }),
    ),

  /** One budget month of meals — what the calendar's meals layer reads (AD-10, AD-38). */
  listMeals: (filters: { month?: string } = {}) =>
    items(request<Page<Meal>>(`/api/meals${query(filters)}`)),

  createMeal: (body: MealInput) =>
    request<Meal>("/api/meals", { method: "POST", body: JSON.stringify(body) }),

  /** How much, when, and the note. What was eaten is not amendable: delete and record again. */
  updateMeal: (
    id: string,
    body: { eaten_on?: string; servings?: Quantity; quantity?: Quantity; note?: string | null },
  ) => request<Meal>(`/api/meals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteMeal: (id: string) => request<void>(`/api/meals/${id}`, { method: "DELETE" }),
};
