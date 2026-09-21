import {
  type DependencyList,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { loadErrorMessage } from "./i18n/errors";
import { type MessageKey, useT } from "./i18n";

/**
 * A page's data, loaded once per change of what it depends on — the pattern every page had
 * its own copy of: three `useState`s, a `useCallback` around the fetch, an effect calling it,
 * and `await load()` after each write.
 *
 * Thirteen copies had two defects in common, and both are the reason this exists:
 *
 * 1. **`t` was in every loader's dependency list**, because the loader translated its own
 *    failure. The translator changes identity with the language, so switching to French
 *    refetched every page's data. Here the loader keeps what was *thrown*, and the sentence
 *    is made at render: the message follows the language and the data does not.
 * 2. **No stale-response guard.** Two loads in flight — a filter changed before the first
 *    answer landed — and whichever answered *last* won, not whichever was asked last. Each
 *    run here takes a number; an answer whose number is no longer current is dropped, data
 *    and error alike, and so is anything that lands after unmount.
 *
 * `couldNotLoad` is the page's own sentence for a failure that carried nothing better
 * (`loadErrorMessage` answers the stale-API case first: every loader here reads fixed
 * paths, so a 404 is a server older than the page, never a missing row).
 */
export interface Loaded<T> {
  data: T;
  /** Change the data in place after a write, when a full reload would be the wrong shape. */
  setData: Dispatch<SetStateAction<T>>;
  /** True from the start of each run to its end — the first load and every reload alike. */
  loading: boolean;
  /** The last run's failure, in the reader's language; `null` after a success. */
  failure: string | null;
  /** Run the fetch again. What pages `await` after a write. */
  reload: () => Promise<void>;
}

export function useLoad<T>(
  fetch: () => Promise<T>,
  initial: T,
  deps: DependencyList,
  couldNotLoad: MessageKey,
): Loaded<T> {
  const t = useT();
  const [data, setData] = useState<T>(initial);
  const [caught, setCaught] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  // The number of the most recent run. A run compares its own number against this after
  // awaiting, and says nothing if it has been overtaken.
  const run = useRef(0);
  // Always the fetch from the latest render, so `reload` can stay one stable function and
  // still read the filters as they are now rather than as they were when it was made.
  const latest = useRef(fetch);
  latest.current = fetch;

  const reload = useCallback(async () => {
    const mine = ++run.current;
    setLoading(true);
    setCaught(null);
    try {
      const value = await latest.current();
      if (mine !== run.current) return;
      setData(value);
    } catch (thrown) {
      if (mine !== run.current) return;
      // A rejection with nothing in it is still a failure, and `null` is the "no failure" mark.
      setCaught(thrown ?? new Error("rejected with no reason"));
    } finally {
      if (mine === run.current) setLoading(false);
    }
  }, []);

  // biome-ignore-start lint/correctness/useExhaustiveDependencies: the caller's list is the point — it names what the fetch reads
  useEffect(() => {
    void reload();
  }, deps);
  // biome-ignore-end lint/correctness/useExhaustiveDependencies: same

  // Retire whatever is in flight when the page goes away.
  useEffect(
    () => () => {
      run.current++;
    },
    [],
  );

  const failure = caught === null ? null : loadErrorMessage(t, caught, couldNotLoad);
  return { data, setData, loading, failure, reload };
}
