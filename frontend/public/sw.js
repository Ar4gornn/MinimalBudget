/* Service worker (Story 8.1).
 *
 * Hand-rolled rather than pulled from a plugin, for the same reason the charts are: what it
 * has to do is small, and a caching bug in a finance app shows someone stale money.
 *
 * The rules, and why each one is what it is:
 *
 *   /api/*        NEVER touched. Not cached, not intercepted, no offline fallback. Two
 *                 reasons. It is financial data behind a bearer token, and a cache would
 *                 outlive the sign-out that was supposed to remove it. And a stale balance
 *                 presented as current is worse than an honest error.
 *
 *   navigations   Network first, falling back to the cached shell. So the app opens offline
 *                 and says so, instead of showing the browser's dinosaur.
 *
 *   static assets Cache first. Safe *only* because Vite content-hashes these filenames — a
 *                 changed file is a new URL, so a cached one can never be stale.
 *
 * There is deliberately no precache manifest. Hashed filenames change every build, so
 * maintaining a list by hand is a standing source of 404s on deploy; runtime caching gets
 * the same result without the list.
 */

const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const SHELL_URL = "/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(new Request(SHELL_URL, { cache: "reload" })))
      // Take over without waiting for every tab to close. Paired with skipWaiting below,
      // this is what stops an old worker serving an old shell for days.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== SHELL && name !== ASSETS)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The API and the health endpoint are the server's business, never the cache's.
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Keep the shell fresh whenever the network is available.
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(SHELL_URL, copy));
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        // Only cache what is safely cacheable: our own successful, complete responses.
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(ASSETS).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});

// Lets the page trigger an immediate update rather than waiting for a natural reload.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
