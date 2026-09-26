import type { Entry } from "../catalogue";

/**
 * Epic 33: what the account uses, and the page shown for what it does not.
 *
 * A module's name here is its own key rather than a nav label reused: "Mood" and "Books"
 * are not tabs, and a label written for a 64px tab is not always the word for a switch.
 */
export const layout = {
  "layout.title": { en: "Layout", fr: "Disposition" },
  "layout.modules": { en: "Sections you use", fr: "Rubriques utilisées" },
  "layout.modulesHint": {
    en: "Turning one off hides it everywhere. Nothing is deleted: switch it back on and everything is where you left it.",
    fr: "Désactiver une rubrique la masque partout. Rien n'est supprimé : réactivez-la et tout est là où vous l'avez laissé.",
  },
  "layout.saveFailed": {
    en: "Could not save, so the change was undone.",
    fr: "Enregistrement impossible, la modification a été annulée.",
  },

  "layout.tabs": { en: "Tabs", fr: "Onglets" },
  "layout.phone": { en: "Phone", fr: "Téléphone" },
  "layout.desktop": { en: "Computer", fr: "Ordinateur" },
  "layout.tabsHint": {
    en: "A phone fits five tabs and three links at the top, so moving one across swaps it with the last of the other row.",
    fr: "Un téléphone affiche cinq onglets et trois liens en haut : déplacer un élément d'une rangée à l'autre l'échange avec le dernier de l'autre rangée.",
  },
  "layout.bar": { en: "Tab bar", fr: "Barre d'onglets" },
  "layout.top": { en: "Top bar", fr: "Barre du haut" },
  "layout.up": { en: "Move {name} up", fr: "Monter {name}" },
  "layout.down": { en: "Move {name} down", fr: "Descendre {name}" },
  "layout.toTop": { en: "Move {name} to the top bar", fr: "Placer {name} dans la barre du haut" },
  "layout.toBar": { en: "Move {name} to the tab bar", fr: "Placer {name} dans la barre d'onglets" },
  "layout.toTopSwap": {
    en: "Move {name} to the top bar, and {other} to the tab bar",
    fr: "Placer {name} dans la barre du haut, et {other} dans la barre d'onglets",
  },
  "layout.toBarSwap": {
    en: "Move {name} to the tab bar, and {other} to the top bar",
    fr: "Placer {name} dans la barre d'onglets, et {other} dans la barre du haut",
  },
  "layout.hidden": { en: "turned off", fr: "rubrique désactivée" },
  "layout.reset": { en: "Reset these tabs", fr: "Rétablir ces onglets" },
  "layout.resetConfirm": {
    en: "Put the {layout} tabs back in their original order?",
    fr: "Remettre les onglets ({layout}) dans leur ordre d'origine ?",
  },
  "layout.resetYes": { en: "Reset", fr: "Rétablir" },

  "module.habits": { en: "Habits", fr: "Habitudes" },
  "module.books": { en: "Books", fr: "Livres" },
  "module.mood": { en: "Mood", fr: "Humeur" },
  "module.stock": { en: "Stock", fr: "Stock" },
  "module.gym": { en: "Gym", fr: "Sport" },
  "module.recipes": { en: "Recipes", fr: "Recettes" },
  "module.notes": { en: "Notes", fr: "Notes" },

  "module.offTitle": { en: "{name} is turned off", fr: "La rubrique {name} est désactivée" },
  "module.offBody": {
    en: "Its data is kept. Turn it back on in Settings to use it again.",
    fr: "Ses données sont conservées. Réactivez-la dans les réglages pour l'utiliser à nouveau.",
  },
  "module.offLink": { en: "Open Settings", fr: "Ouvrir les réglages" },
} satisfies Record<string, Entry>;
