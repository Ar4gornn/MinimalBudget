import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  api,
  clearTokens,
  readRefreshToken,
  readToken,
  setUnauthorizedHandler,
  storeTokens,
} from "../api/client";
import type { Currency, Language, PreferencesPatch, User } from "../api/types";
import { PreferenceSaver, preferencesOf } from "../layout/preferences";
import { clearAllDrafts } from "../notes/drafts";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    inviteCode?: string,
    currency?: Currency,
    language?: Language,
  ) => Promise<void>;
  signOut: () => void;
  /** Re-read the profile after something server-side changes it. */
  refreshUser: () => Promise<void>;
  /**
   * Epic 33: change the account's layout preferences. Shown at once, saved one request at
   * a time, reverted if the save fails — and the promise rejects, so the control can say so.
   */
  updatePreferences: (patch: PreferencesPatch) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // One saver per account. A save still in flight when its owner signs out, or another
  // account signs in, lands on nobody: `onChange` only touches the user it was made for.
  const saver = useRef<{ owner: string; saver: PreferenceSaver } | null>(null);

  /** Every user that comes from the server goes through here, so the saver hears it too. */
  const adopt = useCallback((found: User) => {
    setUser(found);
    const prefs = preferencesOf(found);
    if (saver.current?.owner === found.id) {
      saver.current.saver.confirm(prefs);
      return;
    }
    const owner = found.id;
    saver.current = {
      owner,
      saver: new PreferenceSaver(
        prefs,
        async (patch) => preferencesOf(await api.setPreferences(patch)),
        (shown) =>
          setUser((current) =>
            current && current.id === owner ? { ...current, preferences: shown } : current,
          ),
      ),
    };
  }, []);

  const signOut = useCallback(() => {
    // Tell the server first so the refresh token is revoked rather than merely forgotten,
    // then clear locally regardless of whether that call succeeded.
    const refreshToken = readRefreshToken();
    if (refreshToken) void api.logout(refreshToken).catch(() => undefined);
    clearTokens();
    // Notes not yet synced are removed with the session (Epic 32): a note left in a browser
    // after its owner signed out is the leak signing out is for. See `notes/drafts.ts`.
    clearAllDrafts();
    saver.current = null;
    setUser(null);
  }, []);

  // AD-16: the 401 path is registered once. Expiry is the only way a session ends in v1,
  // since there is no refresh flow (AD-13).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      saver.current = null;
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!readToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((found) => {
        if (!cancelled) adopt(found);
      })
      .catch(() => {
        if (!cancelled) clearTokens();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  const signIn = useCallback(async (email: string, password: string) => {
    storeTokens(await api.login(email, password));
    adopt(await api.me());
  }, [adopt]);

  const register = useCallback(
    async (
      email: string,
      password: string,
      inviteCode?: string,
      currency?: Currency,
      language?: Language,
    ) => {
      await api.register(email, password, inviteCode, currency, language);
      await signIn(email, password);
    },
    [signIn],
  );

  const refreshUser = useCallback(async () => {
    adopt(await api.me());
  }, [adopt]);

  const updatePreferences = useCallback((patch: PreferencesPatch) => {
    if (saver.current === null) return Promise.reject(new Error("signed out"));
    return saver.current.saver.update(patch);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, register, signOut, refreshUser, updatePreferences }),
    [user, loading, signIn, register, signOut, refreshUser, updatePreferences],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === null) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}

/**
 * The context without the throw, for consumers that have a sensible default.
 *
 * Money formatting is the case: a currency symbol has an obvious fallback, and a formatter
 * that crashes an entire subtree because it rendered outside the provider is worse than one
 * that shows dollars. Anything that genuinely needs a signed-in user still uses `useAuth`.
 */
export function useOptionalAuth(): AuthState | null {
  return useContext(AuthContext);
}
