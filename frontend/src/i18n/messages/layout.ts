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
