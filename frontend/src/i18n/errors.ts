/**
 * Turning a refusal into a sentence the reader can actually read (Epic 25, AD-44).
 *
 * The rule, in one line: **the code decides the words, and the server's own sentence is
 * only ever the fallback.** A code this build has never heard of degrades to English
 * rather than to blank, which is why `detail` is still sent and still used.
 */

import { ApiError } from "../api/client";
import { messages, type MessageKey, type Translate } from "./catalogue";

function keyFor(code: string | null): MessageKey | null {
  if (!code) return null;
  const key = `error.${code}`;
  return key in messages ? (key as MessageKey) : null;
}

/**
 * The message to show for something that was thrown.
 *
 * `fallback` is what to say when the failure carried nothing useful — a network error, a
 * thrown string, an exception from our own code. Pass the key that describes the action
 * that failed ("Could not save that habit"), not a generic one: on a page with four
 * buttons, knowing *which* one failed is most of the message.
 */
export function errorMessage(t: Translate, caught: unknown, fallback: MessageKey): string {
  if (caught instanceof ApiError) {
    const key = keyFor(caught.code);
    if (key) return t(key);
    // No mapping: the server's English sentence is more informative than a generic one,
    // and seeing English in a French screen is the visible sign that a code needs adding.
    if (caught.message) return caught.message;
  }
  if (caught instanceof TypeError) {
    // `fetch` rejects with a TypeError when it cannot reach the host at all — the one
    // failure with no status and no body.
    return t("error.network");
  }
  return t(fallback);
}

/**
 * A 404 from a **fixed** path cannot mean "no such row" — it can only mean the route is
 * absent, which means a server older than this page.
 *
 * Learned the hard way: the Habits page once rendered the single word "Not Found" against
 * a uvicorn that predated the habits router, which told the reader nothing at all.
 */
export function isStaleApi(caught: unknown): boolean {
  return caught instanceof ApiError && caught.status === 404;
}

/** `errorMessage`, with the stale-API case answered first. For a page's initial load. */
export function loadErrorMessage(t: Translate, caught: unknown, fallback: MessageKey): string {
  return isStaleApi(caught) ? t("error.staleApi") : errorMessage(t, caught, fallback);
}
