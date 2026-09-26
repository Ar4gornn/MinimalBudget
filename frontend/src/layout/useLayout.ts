import { useSyncExternalStore } from "react";

import type { Layout, LayoutName, Preferences, PreferencesPatch } from "../api/types";
import { useAuth, useOptionalAuth } from "../auth/AuthContext";
import { preferencesOf } from "./preferences";

/** The breakpoint every phone rule in styles.css uses. One number, two places. */
export const PHONE_QUERY = "(max-width: 720px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(PHONE_QUERY);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function snapshot(): LayoutName {
  return window.matchMedia?.(PHONE_QUERY).matches ? "phone" : "desktop";
}

/**
 * Which of the account's two layouts this screen uses (AD-49). Follows the window live, so
 * a tablet rotated across 720px switches. Without `matchMedia` (jsdom) it is a desktop.
 */
export function useLayout(): LayoutName {
  return useSyncExternalStore(subscribe, snapshot, () => "desktop");
}

export interface PreferencesState {
  /** Both layouts and the modules, as shown — a pending change is already in here. */
  preferences: Preferences;
  /** The layout this screen is using. */
  layout: LayoutName;
  /** `preferences[layout]`, the one a page draws from. */
  current: Layout;
  update: (patch: PreferencesPatch) => Promise<void>;
}

/** The account's layout preferences, from the auth context: no request of its own. */
export function usePreferences(): PreferencesState {
  const { user, updatePreferences } = useAuth();
  const layout = useLayout();
  const preferences = preferencesOf(user);
  return { preferences, layout, current: preferences[layout], update: updatePreferences };
}

/**
 * The layout this screen draws from, without requiring an auth provider: defaults outside
 * one, like `useModules`. For pages and providers that only read.
 */
export function useCurrentLayout(): Layout {
  return preferencesOf(useOptionalAuth()?.user)[useLayout()];
}
