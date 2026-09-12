import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { ViewSwitch } from "../components/ViewSwitch";
import { AuthProvider } from "../auth/AuthContext";
import { LanguageProvider, browserLanguage, translator, useLanguage, useT } from ".";
import { LANGUAGES, messages, pluralForm, type Lang, type MessageKey } from "./catalogue";
import { errorMessage, loadErrorMessage } from "./errors";
import { dayLabel, monthLabel, monthRangeLabel } from "../months";

/**
 * The i18n layer itself (Epic 25).
 *
 * The catalogue tests below are the ones that matter most. A hand-rolled translation layer
 * fails in exactly two ways — a key that exists in one language and not the other, and a
 * plural rule written for English and applied to French — and both are silent on screen.
 * The types already stop the first; these assertions stop the versions the types cannot see
 * (an empty string is a valid `string`, and so is the English text pasted into `fr`).
 */

const KEYS = Object.keys(messages) as MessageKey[];

describe("the catalogue", () => {
  it("has every language for every message, and none of them blank", () => {
    // The type says `Record<Lang, string>`, which an empty string satisfies. This is the
    // half of the contract the compiler cannot hold.
    for (const key of KEYS) {
      for (const lang of LANGUAGES) {
        expect(messages[key][lang], `${key}.${lang}`).toBeTruthy();
        expect(messages[key][lang].trim(), `${key}.${lang}`).not.toBe("");
      }
    }
  });

  it("pairs every plural form with its opposite", () => {
    // `t.n("x", n)` looks up `x_one` or `x_other` by arithmetic, so a missing half is a key
    // that only fails at the count that needs it — a bug that ships and waits.
    for (const key of KEYS) {
      if (key.endsWith("_one")) {
        expect(KEYS, key).toContain(key.replace(/_one$/, "_other"));
      }
      if (key.endsWith("_other")) {
        expect(KEYS, key).toContain(key.replace(/_other$/, "_one"));
      }
    }
  });

  it("actually translates every full sentence", () => {
    // A word can legitimately be identical in both — "Stock", "Notifications", "auto", a
    // currency symbol. A *sentence* cannot: if a French paragraph is character-for-character
    // the English one, it was pasted rather than translated. Made to fail by copying one
    // hint across; it named the key immediately.
    const sentences = KEYS.filter((key) => {
      const english = messages[key].en;
      return english.includes(" ") && /[.?!]$/.test(english.trim());
    });
    expect(sentences.length).toBeGreaterThan(30);
    for (const key of sentences) {
      expect(messages[key].fr, `${key} looks untranslated`).not.toBe(messages[key].en);
    }
  });

  it("keeps French month and weekday names in lower case", () => {
    // French does not capitalise them, and capitalising them is the single most visible
    // sign of a translation done by pattern-matching English.
    for (const key of KEYS) {
      if (/^(month|monthShort|weekday|weekdayShort)\.\d+$/.test(key)) {
        const french = messages[key].fr;
        expect(french[0], key).toBe(french[0]?.toLowerCase());
      }
    }
  });
});

describe("plural rules", () => {
  it("treats zero as singular in French and plural in English", () => {
    // The rule the server holds too (`services/push.py`), written down in both places
    // because `count !== 1` is an English rule wearing a general-looking condition.
    expect(pluralForm("en", 0)).toBe("other");
    expect(pluralForm("fr", 0)).toBe("one");
    expect(pluralForm("en", 1)).toBe("one");
    expect(pluralForm("fr", 1)).toBe("one");
    expect(pluralForm("en", 2)).toBe("other");
    expect(pluralForm("fr", 2)).toBe("other");
  });

  it("picks the form and fills the count in one call", () => {
    const en = translator("en");
    expect(en.n("habits.streakWeeks", 1)).toBe("1 week in a row");
    expect(en.n("habits.streakWeeks", 3)).toBe("3 weeks in a row");
    const fr = translator("fr");
    expect(fr.n("habits.streakWeeks", 1)).toBe("1 semaine d’affilée");
    expect(fr.n("habits.streakWeeks", 3)).toBe("3 semaines d’affilée");
  });
});

describe("interpolation", () => {
  it("fills named holes", () => {
    expect(translator("en")("habits.checkIn", { name: "Run" })).toBe("Check in Run");
    expect(translator("fr")("habits.checkIn", { name: "Courir" })).toBe("Pointer Courir");
  });

  it("leaves a hole it was given nothing for, rather than emptying it", () => {
    // Visible in a screenshot beats silently absent: "Check in {name}" names the bug.
    expect(translator("en")("habits.checkIn")).toBe("Check in {name}");
  });
});

describe("dates", () => {
  it("names a month in the reader's language, not the machine's", () => {
    // Not `Intl`: the system locale on a developer machine here is French, and a heading
    // that changed with the machine would make a screenshot and a test irreproducible.
    expect(monthLabel("2026-08")).toBe("August 2026");
    expect(monthLabel("2026-08", translator("fr"))).toBe("août 2026");
  });

  it("names a day in the reader's language", () => {
    expect(dayLabel("2026-09-02")).toBe("Wed 2 September");
    expect(dayLabel("2026-09-02", translator("fr"))).toBe("mer. 2 septembre");
  });

  it("spells out a shifted month in the reader's language", () => {
    expect(monthRangeLabel("2026-09", 26)).toBe("26 Aug – 25 Sep");
    expect(monthRangeLabel("2026-09", 26, translator("fr"))).toBe("26 août – 25 sept.");
  });
});

describe("errors", () => {
  const t = translator("fr");

  it("says it in the reader's language, keyed by the server's code", () => {
    const caught = new ApiError(409, "You already have a habit with that name", "habit_name_taken");
    expect(errorMessage(t, caught, "error.generic")).toBe(
      "Vous avez déjà une habitude portant ce nom.",
    );
  });

  it("falls back to the server's sentence for a code it has never heard of", () => {
    // English in a French screen is the visible sign that a code needs adding — which is
    // strictly better than a blank banner or a generic shrug.
    const caught = new ApiError(409, "Something the server knows and we do not", "brand_new");
    expect(errorMessage(t, caught, "error.generic")).toBe(
      "Something the server knows and we do not",
    );
  });

  it("tells a wrong password from an expired session, which the status cannot", () => {
    // Both are 401. Guessing from the status is what once put "Your session has expired"
    // on a mistyped password.
    const wrong = new ApiError(401, "Incorrect email or password", "credentials_invalid");
    const expired = new ApiError(401, "Please sign in again.", "session_expired");
    expect(errorMessage(t, wrong, "error.generic")).toBe(
      "Adresse e-mail ou mot de passe incorrect.",
    );
    expect(errorMessage(t, expired, "error.generic")).toBe(
      "Votre session a expiré. Veuillez vous reconnecter.",
    );
  });

  it("says a validation failure in the reader's language, not pydantic's", () => {
    // FastAPI's own 422 carries a list of field errors written for a developer. It is one of
    // the few places where a generic sentence in the reader's language beats the specific
    // one in somebody else's — and before the server added the code, there was no way to
    // tell it apart from any other 422.
    const caught = new ApiError(
      422,
      "Input should be greater than or equal to 2",
      "validation",
    );
    expect(errorMessage(t, caught, "error.generic")).toBe(
      "Une partie de ce que vous avez saisi n’est pas dans une forme que l’application peut enregistrer.",
    );
  });

  it("recognises a failure to reach the server at all", () => {
    // `fetch` rejects with a TypeError when there is no response — no status, no body.
    expect(errorMessage(t, new TypeError("Failed to fetch"), "error.generic")).toBe(
      "Serveur injoignable. Vérifiez votre connexion et réessayez.",
    );
  });

  it("reads a 404 on a fixed path as an older server", () => {
    const caught = new ApiError(404, "Not Found", "not_found");
    expect(loadErrorMessage(t, caught, "error.generic")).toContain("version plus ancienne");
    // And only for a load: the same 404 elsewhere is an ordinary missing row.
    expect(errorMessage(t, caught, "error.generic")).toBe(
      "Introuvable — l’élément a peut-être été supprimé.",
    );
  });
});

describe("the translator's identity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not change when the account object does", async () => {
    // `t` is an effect dependency of every page's loader. Rebuilding it whenever the auth
    // object changed identity — which it does on every sign-in and every profile refresh —
    // made each of those refetch the whole page for a reason unrelated to its data. Made to
    // fail by folding the translator back into the memo that also holds `setLanguage`.
    window.localStorage.setItem("minimalbudget.token", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "u1",
            email: "sam@example.com",
            currency: "USD",
            weight_unit: "kg",
            budget_start_day: 1,
            language: "en",
            created_at: "",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const seen: unknown[] = [];
    function Probe() {
      seen.push(useT());
      return null;
    }

    render(
      <AuthProvider>
        <LanguageProvider>
          <Probe />
        </LanguageProvider>
      </AuthProvider>,
    );

    // Wait for /me to land, which is what flips `loading` and sets `user` — two changes of
    // the auth object's identity.
    await waitFor(() => {
      expect(seen.length).toBeGreaterThan(1);
    });
    expect(new Set(seen).size, "the translator was rebuilt").toBe(1);
  });
});

describe("choosing a language", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("narrows a browser tag to a catalogue this build actually has", () => {
    expect(browserLanguage(["fr-CA", "en-GB"])).toBe("fr");
    expect(browserLanguage(["en-GB"])).toBe("en");
    // No catalogue for it: English rather than a page of missing keys.
    expect(browserLanguage(["de-DE", "ja"])).toBe("en");
    expect(browserLanguage([])).toBe("en");
  });

  it("renders in the stored language before anyone has signed in", () => {
    // The sign-in page and the first paint read this; without it the app renders English
    // for a moment and then flips, on every load.
    window.localStorage.setItem("minimalbudget.language", "fr");
    render(
      <MemoryRouter>
        <LanguageProvider>
          <ViewSwitch current="summary" />
        </LanguageProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Résumé")).toBeInTheDocument();
    expect(screen.getByText("Calendrier")).toBeInTheDocument();
  });

  it("switches every word on screen, and remembers the choice on this device", async () => {
    function Switcher() {
      const { lang, setLanguage } = useLanguage();
      return (
        <button type="button" onClick={() => void setLanguage(lang === "en" ? "fr" : "en")}>
          switch
        </button>
      );
    }

    render(
      <MemoryRouter>
        <LanguageProvider>
          <ViewSwitch current="summary" />
          <Switcher />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("Summary")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "switch" }));

    await waitFor(() => {
      expect(screen.getByText("Résumé")).toBeInTheDocument();
    });
    expect(screen.queryByText("Summary")).toBeNull();
    expect(window.localStorage.getItem("minimalbudget.language")).toBe("fr");
  });

  it("stamps the language on the document, for screen readers and the browser itself", () => {
    window.localStorage.setItem("minimalbudget.language", "fr");
    render(
      <MemoryRouter>
        <LanguageProvider>
          <ViewSwitch current="summary" />
        </LanguageProvider>
      </MemoryRouter>,
    );
    expect(document.documentElement.lang).toBe("fr");
  });

  it("ignores a stored value that is not a language this build has", () => {
    window.localStorage.setItem("minimalbudget.language", "de");
    render(
      <MemoryRouter>
        <LanguageProvider>
          <ViewSwitch current="summary" />
        </LanguageProvider>
      </MemoryRouter>,
    );
    const fallback: Lang = browserLanguage(["en"]);
    expect(fallback).toBe("en");
    expect(screen.getByText("Summary")).toBeInTheDocument();
  });
});
