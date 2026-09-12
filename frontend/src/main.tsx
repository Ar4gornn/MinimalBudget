import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { LanguageProvider } from "./i18n";
import { ToastProvider } from "./components/Toast";
import { registerServiceWorker } from "./pwa";
import "./styles.css";

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
