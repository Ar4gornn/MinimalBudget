/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
// Vitest's own defineConfig — Vite's UserConfigExport has no `test` key, and using it
// here fails the type build.
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The dev server proxies /api so the browser sees one origin locally, while the
    // production build talks to VITE_API_BASE_URL across an origin boundary (AD-14).
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE_URL ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
