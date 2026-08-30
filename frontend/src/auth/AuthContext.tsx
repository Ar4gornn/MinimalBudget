import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import type { Currency, User } from "../api/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    inviteCode?: string,
    currency?: Currency,
  ) => Promise<void>;
  signOut: () => void;
  /** Re-read the profile after something server-side changes it. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    // Tell the server first so the refresh token is revoked rather than merely forgotten,
    // then clear locally regardless of whether that call succeeded.
    const refreshToken = readRefreshToken();
    if (refreshToken) void api.logout(refreshToken).catch(() => undefined);
    clearTokens();
    setUser(null);
  }, []);

  // AD-16: the 401 path is registered once. Expiry is the only way a session ends in v1,
  // since there is no refresh flow (AD-13).
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
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
        if (!cancelled) setUser(found);
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
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    storeTokens(await api.login(email, password));
    setUser(await api.me());
  }, []);

  const register = useCallback(
    async (email: string, password: string, inviteCode?: string, currency?: Currency) => {
      await api.register(email, password, inviteCode, currency);
      await signIn(email, password);
    },
    [signIn],
  );

  const refreshUser = useCallback(async () => {
    setUser(await api.me());
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, register, signOut, refreshUser }),
    [user, loading, signIn, register, signOut, refreshUser],
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
