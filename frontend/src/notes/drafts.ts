import { ApiError, api } from "../api/client";
import type { Note, NoteInput } from "../api/types";
import { PREFIX } from "../storage";

/**
 * Drafts kept on the device until the server has them (Epic 32, AD-48).
 *
 * The editor writes the note here on every change, then tries the server. A draft stays
 * until a save of **that exact content** succeeds; a save that fails for want of a network
 * leaves it `pending`, and `flush` retries every pending draft when the browser says it is
 * back online and when the app starts. The server write is a PUT under the id the draft
 * already carries, so a retry after a response that was lost in transit writes the same row
 * again rather than a second one.
 *
 * **What this is not.** It is not an offline mode: the note list still comes from the
 * server, and a note that has never been opened on this device is not here. It is the
 * smallest thing that keeps "I wrote it on the train" from becoming "it is gone".
 *
 * **Refused is not pending.** A 4xx is the server saying no to the content, and retrying
 * it forever would never succeed; it stays as a draft with the refusal's code, for the
 * editor to show, and is not retried until it is edited.
 *
 * **Scoped to the account and cleared on sign-out.** Keyed by user id, so a second person
 * signing in on the same phone never sees the first one's drafts; and removed on an
 * explicit sign-out, because a note left in a browser after its owner signed out is the
 * leak sign-out exists to prevent. The cost is stated: a draft that had not reached the
 * server when its owner signed out is lost. An *expired* session keeps them, so signing
 * back in sends them.
 */

export interface Draft {
  note: NoteInput;
  /** Waiting for a network to reach the server. */
  pending: boolean;
  /** The server's code when it refused the content; retried only after an edit. */
  refused: string | null;
  /** When it was last written here, ISO. Shown on the list while it has not synced. */
  savedAt: string;
}

type Drafts = Record<string, Draft>;

const keyFor = (userId: string) => `${PREFIX}notes.drafts.${userId}`;

export function readDrafts(userId: string): Drafts {
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Drafts) : {};
  } catch {
    // Blocked storage or a value this version cannot read: no drafts, never a blank page.
    return {};
  }
}

function writeDrafts(userId: string, drafts: Drafts): void {
  try {
    if (Object.keys(drafts).length === 0) window.localStorage.removeItem(keyFor(userId));
    else window.localStorage.setItem(keyFor(userId), JSON.stringify(drafts));
  } catch {
    // Full or blocked. The server save is still attempted; only the safety net is missing.
  }
}

export function keepDraft(userId: string, id: string, note: NoteInput): void {
  const drafts = readDrafts(userId);
  drafts[id] = { note, pending: true, refused: null, savedAt: new Date().toISOString() };
  writeDrafts(userId, drafts);
}

export function dropDraft(userId: string, id: string): void {
  const drafts = readDrafts(userId);
  if (!(id in drafts)) return;
  delete drafts[id];
  writeDrafts(userId, drafts);
}

/** Every draft of every account on this device — what an explicit sign-out removes. */
export function clearAllDrafts(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(`${PREFIX}notes.drafts.`)) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    /* see readDrafts */
  }
}

const same = (a: NoteInput, b: NoteInput) => JSON.stringify(a) === JSON.stringify(b);

export type SaveOutcome =
  | { state: "saved"; note: Note }
  | { state: "offline" }
  | { state: "refused"; error: ApiError };

/**
 * Send one draft to the server and settle it.
 *
 * The draft is dropped only if it still holds what was sent: the person may have typed
 * more while the request was in flight, and that newer text must survive to the next save.
 */
export async function saveDraft(userId: string, id: string, note: NoteInput): Promise<SaveOutcome> {
  try {
    const saved = await api.putNote(id, note);
    const current = readDrafts(userId)[id];
    if (current && same(current.note, note)) dropDraft(userId, id);
    return { state: "saved", note: saved };
  } catch (caught) {
    const drafts = readDrafts(userId);
    const current = drafts[id];
    if (caught instanceof ApiError && caught.status !== 401 && caught.status < 500) {
      if (current && same(current.note, note)) {
        drafts[id] = { ...current, pending: false, refused: caught.code ?? "error" };
        writeDrafts(userId, drafts);
      }
      return { state: "refused", error: caught };
    }
    // No network, a 5xx, or a session that needs signing back into: all worth retrying.
    return { state: "offline" };
  }
}

let flushing: Promise<number> | null = null;

/**
 * Retry every pending draft. Returns how many reached the server.
 *
 * Single-flight: the `online` event and the app's start can fire together, and two
 * concurrent flushes would each send every draft.
 */
export function flushDrafts(userId: string): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const [id, draft] of Object.entries(readDrafts(userId))) {
      if (!draft.pending) continue;
      const outcome = await saveDraft(userId, id, draft.note);
      if (outcome.state === "saved") sent += 1;
      if (outcome.state === "offline") break;
    }
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
