import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { LanguageProvider } from "./i18n";
import { ToastProvider } from "./components/Toast";
import { registerServiceWorker } from "./pwa";
import { migrateLegacyStorage } from "./storage";
// Lato, served from the app's own origin: no request to Google leaves the device. Regular and
// bold only — the CSS never asks for another weight — plus the italic a book quote is set in.
// latin-ext costs nothing unless a character in its range is drawn (unicode-range).
import "@fontsource/lato/latin-400.css";
import "@fontsource/lato/latin-400-italic.css";
import "@fontsource/lato/latin-700.css";
import "@fontsource/lato/latin-ext-400.css";
import "@fontsource/lato/latin-ext-700.css";
import "./styles.css";

// Before anything reads a key: the providers below read the tokens and the language on mount.
migrateLegacyStorage();

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      {/* Inside the auth provider, because the account is the authority on the language
          and the provider reads it from there; outside everything that draws words. */}
      <AuthProvider>
        <LanguageProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

// After render: the offline shell is a nicety, the app is not waiting on it.
registerServiceWorker();
