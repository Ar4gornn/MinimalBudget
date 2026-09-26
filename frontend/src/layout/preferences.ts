import type {
  CardId,
  LayoutName,
  ModuleId,
  Preferences,
  PreferencesPatch,
  SectionId,
  User,
} from "../api/types";

/**
 * The account's layout preferences on the client (Epic 33, AD-49).
 *
 * The server always answers resolved, so the only default the client needs is for a
 * server older than migration 0025, which sends no `preferences` at all. It is the app as
 * it was, and it must stay equal to the server's `resolve({})` — both sides pin the same
 * literal in their tests.
 */
const SECTIONS: [SectionId, "bar" | "top"][] = [
  ["dashboard", "bar"],
  ["entries", "bar"],
  ["habits", "bar"],
  ["stock", "bar"],
  ["gym", "bar"],
  ["plan", "top"],
  ["grow", "top"],
  ["recipes", "top"],
];
export const MODULES: ModuleId[] = ["habits", "books", "mood", "stock", "gym", "recipes", "notes"];
export const CARDS: CardId[] = [
  "stats",
  "pending",
  "reading",
  "quote",
  "restock",
  "budgets",
  "savings",
  "trends",
  "categories",
];
export const LAYOUTS: LayoutName[] = ["phone", "desktop"];

function defaultLayout() {
  return {
    tabs: SECTIONS.map(([id, slot]) => ({ id, slot })),
    cards: CARDS.map((id) => ({ id, on: true })),
  };
}

export const DEFAULT_PREFERENCES: Preferences = {
  modules: Object.fromEntries(MODULES.map((id) => [id, true])) as Record<ModuleId, boolean>,
  phone: defaultLayout(),
  desktop: defaultLayout(),
};

/** The account's preferences, or the app as it was when the server predates them. */
export function preferencesOf(user: User | null | undefined): Preferences {
  return user?.preferences ?? DEFAULT_PREFERENCES;
}

/** What the server does with a patch: each top-level key present replaces that subtree. */
export function applyPatch(prefs: Preferences, patch: PreferencesPatch): Preferences {
  return { ...prefs, ...patch };
}

/**
 * Saves preferences one request at a time, and shows the person their latest choice at once.
 *
 * **One request in flight, never two.** The server applies patches in the order they
 * *arrive*, not the order they were asked; two in flight could land the older one last and
 * leave the account disagreeing with the screen. So a change made while a request is out is
 * queued, and changes queued together are merged — they replace whole subtrees, so the
 * merge is exactly what sending them in turn would have done — and sent as one.
 *
 * **What is shown** is always the last state the server confirmed with the in-flight and
 * queued patches laid over it. A request that fails drops its own patch and nothing else:
 * the screen falls back to the confirmed state plus whatever is still queued, and the
 * promise each caller got for that patch rejects, so the control that asked can say so.
 */
export class PreferenceSaver {
  private confirmed: Preferences;
  private inflight: PreferencesPatch | null = null;
  private queued: PreferencesPatch | null = null;
  private waiting: { resolve: () => void; reject: (error: unknown) => void }[] = [];

  constructor(
    initial: Preferences,
    private readonly send: (patch: PreferencesPatch) => Promise<Preferences>,
    private readonly onChange: (shown: Preferences) => void,
  ) {
    this.confirmed = initial;
  }

  /** What the screen should show now. */
  get shown(): Preferences {
    return applyPatch(applyPatch(this.confirmed, this.inflight ?? {}), this.queued ?? {});
  }

  /** The server said so from elsewhere (a profile refresh): adopt it under anything pending. */
  confirm(prefs: Preferences): void {
    this.confirmed = prefs;
    this.onChange(this.shown);
  }

  update(patch: PreferencesPatch): Promise<void> {
    this.queued = { ...this.queued, ...patch };
    const done = new Promise<void>((resolve, reject) => {
      this.waiting.push({ resolve, reject });
    });
    this.onChange(this.shown);
    if (this.inflight === null) void this.drain();
    return done;
  }

  private async drain(): Promise<void> {
    while (this.queued !== null) {
      const patch = this.queued;
      const callers = this.waiting;
      this.queued = null;
      this.waiting = [];
      this.inflight = patch;
      try {
        this.confirmed = await this.send(patch);
        this.inflight = null;
        this.onChange(this.shown);
        for (const caller of callers) caller.resolve();
      } catch (error) {
        this.inflight = null;
        this.onChange(this.shown);
        for (const caller of callers) caller.reject(error);
      }
    }
  }
}
