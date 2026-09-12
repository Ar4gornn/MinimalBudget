import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * English is the language a test renders in, pinned rather than inherited (Epic 25).
 *
 * Without this the suite asserts against whatever `navigator.languages` happens to say on the
 * machine running it — and the development machine here is set to French, so half the
 * expectations in this repository would fail for one developer and pass for another. It is
 * the same hazard `money.ts` and `months.ts` already avoid by pinning their own formatting:
 * the *machine's* locale is never the language under test.
 *
 * A test that wants French sets it explicitly, either by storing the preference or by asking
 * for a `translator("fr")`.
 */
Object.defineProperty(window.navigator, "languages", {
  value: ["en-GB", "en"],
  configurable: true,
});
Object.defineProperty(window.navigator, "language", {
  value: "en-GB",
  configurable: true,
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});
