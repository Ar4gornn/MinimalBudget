/**
 * Import every lazy page before a test that mounts the whole <App />.
 *
 * App.tsx loads each page with `React.lazy`, and under vitest the first `import()` of a page
 * is also the moment the page and everything it imports gets transformed. Alone that takes
 * a few hundred milliseconds; in a full parallel run on a busy machine it took longer than
 * a `findBy`'s one second, and `<main>` was still empty when the query gave up. Doing the
 * imports in a `beforeAll` moves that cost out of every test's own budget: the `import()`
 * inside `lazy` then resolves from the module cache, and a test waits only on React.
 *
 * A glob rather than a list, so a page added to App.tsx is covered without touching this.
 */
export async function preloadPages(): Promise<void> {
  const pages = import.meta.glob("../pages/*Page.tsx");
  await Promise.all(Object.values(pages).map((load) => load()));
}

/** Transforming every page is one-off work whose length depends on the machine's load. */
export const PRELOAD_TIMEOUT = 60_000;
