/**
 * Service worker registration (Story 8.1).
 *
 * Production only. In development Vite serves modules unbundled and hot-reloads them; a
 * worker caching those would make edits appear not to take, which is a miserable hour to
 * debug for zero benefit.
 */

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // A failed registration means no offline shell. The app still works entirely, so
      // there is nothing here worth interrupting anyone about. Some embedded browsers and
      // webviews refuse registration outright, and that must not look like a broken app.
    });
  };

  // Deferred to load so it never competes with the first render for bandwidth — but only
  // if load has not already happened. Attaching a listener for an event that has already
  // fired would mean it silently never registers, which is a genuinely annoying bug to
  // find because everything else looks correct.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

/**
 * True when running as an installed app rather than a browser tab.
 *
 * `display-mode: standalone` covers Android and desktop; `navigator.standalone` is the iOS
 * equivalent, which Safari never replaced with the standard API.
 */
export function isInstalled(): boolean {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}
