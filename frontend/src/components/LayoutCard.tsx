import { useState } from "react";

import { useT } from "../i18n";
import { MODULE_NAME } from "../layout/modules";
import { MODULES } from "../layout/preferences";
import { usePreferences } from "../layout/useLayout";
import { Card, ErrorBanner } from "./ui";

/**
 * Settings → Layout (Epic 33). Each switch applies at once and is saved in the
 * background; a save that fails is undone and says so here, not in a page-wide banner.
 */
export function LayoutCard() {
  const t = useT();
  const { preferences, update } = usePreferences();
  const [failed, setFailed] = useState(false);

  function setModule(id: (typeof MODULES)[number], on: boolean) {
    setFailed(false);
    update({ modules: { ...preferences.modules, [id]: on } }).catch(() => setFailed(true));
  }

  return (
    // The id is where a module's "turned off" page links to.
    <div id="layout">
      <Card title={t("layout.title")}>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>{t("layout.modules")}</legend>
          <div className="row" style={{ flexWrap: "wrap", gap: "6px 16px" }}>
            {MODULES.map((id) => (
              <label key={id} className="check" style={{ flex: "0 0 auto" }}>
                <input
                  type="checkbox"
                  checked={preferences.modules[id]}
                  onChange={(event) => setModule(id, event.target.checked)}
                />
                {t(MODULE_NAME[id])}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="hint" style={{ marginTop: 8 }}>
          {t("layout.modulesHint")}
        </p>
        {failed && <ErrorBanner message={t("layout.saveFailed")} />}
      </Card>
    </div>
  );
}
