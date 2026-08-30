/**
 * AD-16: the only place in the application that touches the network.
 *
 * Auth headers, the `{ items: [...] }` envelope of AD-20, and the 401 path each exist
 * exactly once here. No component or hook calls `fetch` — which is also what lets the v2
 * Expo client reuse this module rather than reimplementing the contract.
 */

import type {
  Budget,
  Category,
  Contribution,
  Entry,
  EntryKind,
  Money,
  Page,
  SavingsType,
  Summary,
  Target,
  Token,
  Trends,
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
}

export const api = {
  register: (email: string, password: string, inviteCode?: string) =>
    request<User>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        // Omitted entirely when blank: an instance running REGISTRATION_MODE=open
        // should not have to receive a field it ignores.
        ...(inviteCode?.trim() ? { invite_code: inviteCode.trim() } : {}),
      }),
    }),

  login: (email: string, password: string) =>
    request<Token>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<User>("/api/auth/me"),

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
};
