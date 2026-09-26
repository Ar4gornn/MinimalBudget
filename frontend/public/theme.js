/* Applies the chosen theme before the first paint, so a dark choice never flashes white.
 *
 * A classic script loaded from <head>, not part of the bundle: a module runs after the page
 * has painted, and the CSP forbids inline script. It is the same resolution as
 * `src/theme.tsx`, in ES5, and `theme.test.ts` runs this file to check the two agree.
 *
 * The service worker serves unhashed files cache-first, so index.html loads this as
 * `/theme.js?v=N`. Bump N whenever this file changes.
 */
(function () {
  var MODES = ["light", "dark", "oled", "hc", "sepia"];
  var ACCENTS = ["blue", "indigo", "violet", "magenta", "teal", "graphite", "slate", "cobalt", "plum"];
  var COLORS = {
    light: "#f2f2f2",
    dark: "#001f2b",
    oled: "#000000",
    hc: "#ffffff",
    sepia: "#f1e7d3",
  };
  var mode = null;
  var accent = null;
  try {
    mode = window.localStorage.getItem("everything-everywhere.theme");
    accent = window.localStorage.getItem("everything-everywhere.accent");
  } catch (e) {
    // Storage blocked: the defaults below.
  }
  if (MODES.indexOf(mode) < 0) {
    var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    mode = dark ? "dark" : "light";
  }
  if (ACCENTS.indexOf(accent) < 0) accent = "blue";
  var root = document.documentElement;
  root.setAttribute("data-theme", mode);
  root.setAttribute("data-accent", accent);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", COLORS[mode]);
})();
