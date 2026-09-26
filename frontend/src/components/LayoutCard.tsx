import { useState } from "react";

import type { LayoutName, ModuleId, PreferencesPatch, SectionId } from "../api/types";
import { useT } from "../i18n";
import { MODULE_NAME, SECTION_LABEL, SECTION_MODULE } from "../layout/modules";
import {
  DEFAULT_PREFERENCES,
  LAYOUTS,
  MODULES,
  moveTab,
  normalizeTabs,
  swapPartner,
  switchSlot,
} from "../layout/preferences";
import { usePreferences } from "../layout/useLayout";
import { Card, ErrorBanner } from "./ui";

/**
 * Settings → Layout (Epic 33): which modules the account uses, and where each section sits
 * in each of its two layouts. Every change applies at once and is saved in the background;
 * a save that fails is undone and says so here, not in a page-wide banner.
 *
 * Up and down buttons rather than drag and drop (the interview's choice): they work the
 * same by touch, mouse and keyboard, and each one says in words what it will do.
 */
export function LayoutCard() {
  const t = useT();
  const { preferences, layout, update } = usePreferences();
  const [failed, setFailed] = useState(false);
  // The layout this screen uses opens first; the other is one tap away, editable from here.
  const [editing, setEditing] = useState<LayoutName>(layout);
  const [confirming, setConfirming] = useState(false);

  function save(patch: PreferencesPatch) {
    setFailed(false);
    update(patch).catch(() => setFailed(true));
  }

  function setModule(id: ModuleId, on: boolean) {
    save({ modules: { ...preferences.modules, [id]: on } });
  }

  const current = preferences[editing];
  const tabs = normalizeTabs(current.tabs);
  const setTabs = (next: typeof tabs) => save({ [editing]: { ...current, tabs: next } });
  const name = (id: SectionId) => t(SECTION_LABEL[id]);
  const hidden = (id: SectionId) => {
    if (id === "habits") return !preferences.modules.habits && !preferences.modules.books;
    const module = SECTION_MODULE[id];
    return module ? !preferences.modules[module] : false;
  };

  function row(id: SectionId, index: number, group: typeof tabs) {
    const slot = group[index]?.slot ?? "bar";
    const partner = swapPartner(tabs, id, editing);
    const across = partner
      ? t(slot === "bar" ? "layout.toTopSwap" : "layout.toBarSwap", {
          name: name(id),
          other: name(partner),
        })
      : t(slot === "bar" ? "layout.toTop" : "layout.toBar", { name: name(id) });
    return (
      <li key={id} className="row" style={{ alignItems: "center", gap: 6, margin: "4px 0" }}>
        <span style={{ flex: "1 1 auto", minWidth: 0 }}>
          {name(id)}
          {hidden(id) && <span className="hint"> · {t("layout.hidden")}</span>}
        </span>
        <button
          type="button"
          className="quiet"
          aria-label={t("layout.up", { name: name(id) })}
          disabled={index === 0}
          onClick={() => setTabs(moveTab(tabs, id, -1))}
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          type="button"
          className="quiet"
          aria-label={t("layout.down", { name: name(id) })}
          disabled={index === group.length - 1}
          onClick={() => setTabs(moveTab(tabs, id, 1))}
        >
          <span aria-hidden="true">↓</span>
        </button>
        <button
          type="button"
          className="quiet"
          aria-label={across}
          data-tip={across}
          onClick={() => setTabs(switchSlot(tabs, id, editing))}
        >
          <span aria-hidden="true">{slot === "bar" ? "⤒" : "⤓"}</span>
        </button>
      </li>
    );
  }

  const bar = tabs.filter((tab) => tab.slot === "bar");
  const top = tabs.filter((tab) => tab.slot === "top");

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

        <h3 style={{ fontSize: 15, margin: "16px 0 6px" }}>{t("layout.tabs")}</h3>
        <div className="chips" role="group" aria-label={t("layout.tabs")}>
          {LAYOUTS.map((name) => (
            <button
              key={name}
              type="button"
              className={`chip ${editing === name ? "on" : ""}`}
              aria-pressed={editing === name}
              onClick={() => {
                setEditing(name);
                setConfirming(false);
              }}
            >
              {t(`layout.${name}`)}
            </button>
          ))}
        </div>
        <p className="hint">{t("layout.tabsHint")}</p>

        <h4 style={{ margin: "10px 0 2px" }} id="layout-bar">
          {t("layout.bar")}
        </h4>
        <ol aria-labelledby="layout-bar" style={{ margin: 0, paddingLeft: 20 }}>
          {bar.map((tab, index) => row(tab.id, index, bar))}
        </ol>
        <h4 style={{ margin: "10px 0 2px" }} id="layout-top">
          {t("layout.top")}
        </h4>
        <ol aria-labelledby="layout-top" style={{ margin: 0, paddingLeft: 20 }}>
          {top.map((tab, index) => row(tab.id, index, top))}
        </ol>

        <div className="row" style={{ marginTop: 12, alignItems: "center", gap: 8 }}>
          {confirming ? (
            <>
              <span>
                {t("layout.resetConfirm", { layout: t(`layout.${editing}`).toLowerCase() })}
              </span>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setTabs(DEFAULT_PREFERENCES[editing].tabs);
                }}
              >
                {t("layout.resetYes")}
              </button>
              <button type="button" className="quiet" onClick={() => setConfirming(false)}>
                {t("action.cancel")}
              </button>
            </>
          ) : (
            <button type="button" className="quiet" onClick={() => setConfirming(true)}>
              {t("layout.reset")}
            </button>
          )}
        </div>
        {failed && <ErrorBanner message={t("layout.saveFailed")} />}
      </Card>
    </div>
  );
}
