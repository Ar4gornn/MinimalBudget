import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { ModuleId } from "../api/types";
import { useT } from "../i18n";
import { MODULE_NAME, useModule } from "../layout/modules";

/**
 * A module's route while the module is off (Epic 33). A page, not a redirect: a bookmark
 * or a home-screen shortcut that silently lands on the Dashboard looks broken, and this
 * says what happened and where to undo it.
 */
export function ModuleOff({ module }: { module: ModuleId }) {
  const t = useT();
  return (
    <section className="card" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 18, marginTop: 0 }}>
        {t("module.offTitle", { name: t(MODULE_NAME[module]) })}
      </h1>
      <p className="hint">{t("module.offBody")}</p>
      <Link to="/settings#layout">{t("module.offLink")}</Link>
    </section>
  );
}

/** The page when its module is on, the notice when it is off. */
export function ModuleGate({ module, children }: { module: ModuleId; children: ReactNode }) {
  return useModule(module) ? <>{children}</> : <ModuleOff module={module} />;
}
