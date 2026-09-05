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
  Contribution,
  Entry,
  EntryKind,
  InventoryItem,
  ItemChange,
  Money,
  Page,
  Quantity,
  Restocks,
  SavingsType,
  Space,
  Summary,
  Target,
  Token,
  Trends,
  Unit,
  UnitPrices,
  User,
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init);

  // A 401 means the short-lived access token aged out. Refresh once and retry, so a
  // family member is not sent back to a sign-in screen every hour.
  if (response.status === 401 && !path.startsWith("/api/auth/")) {
    if (await refreshOnce()) {
      response = await send(path, init);
    }
  }

  if (response.status === 401) {
    // A 401 from a credential endpoint is a wrong password or a wrong code, not an expired
    // session: report the server's own words and leave the sign-in form alone.
    if (CREDENTIAL_ENDPOINTS.has(path)) {
      const body = await response.json().catch(() => null);
      throw new ApiError(401, detailOf(body, 401));
    }
    clearTokens();
    onUnauthorized?.();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, detailOf(body, response.status));
  }
  return body as T;
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
  /** AD-29: both or neither. Sent as an explicit null pair to clear. */
  quantity?: Quantity | null;
  unit?: Unit | null;
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

export const api = {
  register: (email: string, password: string, inviteCode?: string, currency?: Currency) =>
    request<User>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        // Omitted entirely when blank: an instance running REGISTRATION_MODE=open
        // should not have to receive a field it ignores.
        ...(inviteCode?.trim() ? { invite_code: inviteCode.trim() } : {}),
        ...(currency ? { currency } : {}),
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

  listEntries: (filters: { kind?: EntryKind; month?: string; category_id?: string } = {}) =>
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

  summary: (month: string) => request<Summary>(`/api/dashboard/summary${query({ month })}`),

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

  listItems: (filters: { space_id?: string; needs_restock?: boolean } = {}) =>
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
};
