/**
 * The language the app is read in, and the function that turns a key into words (Epic 25).
 *
 * Where the choice lives, in order of authority:
 *
 * 1. **`users.language`**, once someone is signed in. It is an account setting like the
 *    currency and the weight unit, so a phone and a laptop agree, and so the daily push
 *    digest — composed on the host by cron, with no browser anywhere — can be French too.
 * 2. **`localStorage`**, as a cache of that. It is what the sign-in page and the first
 *    paint read, before `/me` has answered: without it the app renders in English for a
 *    moment and then flips, on every single load.
 * 3. **The browser's language**, for a reader the app has never met.
 *
 * The stored value is a *cache*, never the truth: signing in overwrites it with whatever
 * the account says, so a shared device does not leave one person's choice on another's
 * screen.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useOptionalAuth } from "../auth/AuthContext";
import { api } from "../api/client";
import { LANGUAGES, translator, type Lang } from "./catalogue";

export { LANGUAGES, translator, type Lang, type MessageKey, type Translate } from "./catalogue";

const STORAGE_KEY = "minimalbudget.language";

function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

export function readStoredLanguage(): Lang | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLang(stored) ? stored : null;
  } catch {
    // Private windows and blocked site data throw. Not remembering a language is a much
    // smaller problem than a page that will not render.
    return null;
  }
}

function writeStoredLanguage(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* see readStoredLanguage */
  }
}

/** The browser's preference, narrowed to what this build can actually render. */
export function browserLanguage(navigatorLanguages?: readonly string[]): Lang {
  const offered =
    navigatorLanguages ??
    (typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]));
  for (const tag of offered) {
    // "fr-CA" and "fr" both mean the French catalogue; the app ships no regional variants,
    // and pretending otherwise would be a promise it does not keep.
    const base = String(tag).slice(0, 2).toLowerCase();
    if (isLang(base)) return base;
  }
  return "en";
}

interface LanguageState {
  lang: Lang;
  t: import("./catalogue").Translate;
  /** Writes it to the account when there is one, and to this device either way. */
  setLanguage: (next: Lang) => Promise<void>;
}

const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  const account = auth?.user?.language ?? null;
  // What to read in before the account answers — and what a signed-out reader gets.
  const [local, setLocal] = useState<Lang>(() => readStoredLanguage() ?? browserLanguage());
  const lang = account ?? local;

  useEffect(() => {
    // The account is the authority; the stored value is a cache of it, refreshed on every
    // sign-in so a shared device never keeps the previous person's choice.
    if (account && account !== local) {
      writeStoredLanguage(account);
      setLocal(account);
    }
  }, [account, local]);

  useEffect(() => {
    // Screen readers and the browser's own translation prompt both key off this, and it is
    // the one piece of the document the React tree does not own.
    document.documentElement.lang = lang;
  }, [lang]);

  const setLanguage = useCallback(
    async (next: Lang) => {
      writeStoredLanguage(next);
      setLocal(next);
      if (auth?.user) {
        await api.setLanguage(next);
        // Re-read rather than patching the local copy: the server is the authority on what
        // the account now says, and this is the same shape every other setting uses.
        await auth.refreshUser();
      }
    },
    [auth],
  );

  // Memoised on the language alone. Folded into the object below it would be rebuilt
  // whenever `setLanguage` changed identity — which happens whenever the auth object does,
  // on every sign-in and every profile refresh — and every page that lists `t` as an effect
  // dependency would refetch for a reason unrelated to its data.
  const t = useMemo(() => translator(lang), [lang]);

  const value = useMemo(() => ({ lang, t, setLanguage }), [lang, t, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageState {
  const context = useContext(LanguageContext);
  if (context === null) {
    throw new Error("useLanguage must be used inside a LanguageProvider");
  }
  return context;
}

/**
 * The translator on its own — what almost every component wants.
 *
 * Outside a provider it falls back to the stored or browser language rather than throwing.
 * Same reasoning as `useOptionalAuth`: a component tree that crashes because it rendered
 * without a provider is worse than one that renders in English, and a test that mounts a
 * single card should not have to build the whole app shell.
 */
export function useT(): import("./catalogue").Translate {
  const context = useContext(LanguageContext);
  const fallback = useMemo(
    () => translator(readStoredLanguage() ?? browserLanguage()),
    [],
  );
  return context?.t ?? fallback;
}
