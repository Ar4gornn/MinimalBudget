import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, readToken, setUnauthorizedHandler, writeToken } from "../api/client";
import type { User } from "../api/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, inviteCode?: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    writeToken(null);
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
        if (!cancelled) writeToken(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const token = await api.login(email, password);
    writeToken(token.access_token);
    setUser(await api.me());
  }, []);

  const register = useCallback(
    async (email: string, password: string, inviteCode?: string) => {
      await api.register(email, password, inviteCode);
      await signIn(email, password);
    },
    [signIn],
  );

  const value = useMemo(
    () => ({ user, loading, signIn, register, signOut }),
    [user, loading, signIn, register, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === null) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}
