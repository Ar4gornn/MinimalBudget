import type { Entry } from "../catalogue";

/**
 * The calendar — the Dashboard section's day-by-day view (Epic 22).
 *
 * The mood layer's own words are deliberately absent. Epic 24 is not committed, and the
 * layer chip, the face and the "good day" verdict all come from its components; translating
 * them would be writing French against code that may still move. It is the same gap the
 * Habits page's mood card leaves, and it is written down in both places rather than left to
 * be discovered.
 */
export const calendar = {
  "cal.layers": { en: "Layers", fr: "Couches" },
  "cal.layerMoney": { en: "Money", fr: "Argent" },
  "cal.layerSavings": { en: "Savings", fr: "Épargne" },
  "cal.layerStock": { en: "Stock", fr: "Stock" },
  "cal.layerGym": { en: "Gym", fr: "Sport" },
  "cal.layerHabits": { en: "Habits", fr: "Habitudes" },
  "cal.layerMeals": { en: "Meals", fr: "Repas" },
  "cal.layerDue": { en: "Due", fr: "À venir" },

  "cal.gridAria": { en: "{month} calendar", fr: "Calendrier de {month}" },
  "cal.dayAria": { en: "{date}", fr: "{date}" },
  "cal.dayNet": { en: "{date}, net {amount}", fr: "{date}, solde {amount}" },
  "cal.dayWith": { en: "{label}, {layers}", fr: "{label}, {layers}" },
  "cal.dayOutside": {
    en: "{date}, outside this period — open {month}",
    fr: "{date}, hors de cette période — ouvrir {month}",
  },
  "cal.more": { en: "+{count} more", fr: "+{count} de plus" },
  "cal.gridHint": {
    en: "Day totals are rounded; tap a day for exact amounts. Stock is placed by its UTC day, since a quantity change is an instant rather than a date anybody chose.",
    fr: "Les totaux du jour sont arrondis ; touchez un jour pour les montants exacts. Le stock est placé selon son jour UTC, un changement de quantité étant un instant et non une date choisie.",
  },
  "cal.addOnThisDay": { en: "Add on this day", fr: "Ajouter ce jour-là" },
  "cal.couldNotLoad": {
    en: "Could not load the calendar.",
    fr: "Impossible de charger le calendrier.",
  },
  "cal.partial": {
    en: "Some of this month could not be loaded: {layers}. Everything else is shown.",
    fr: "Une partie de ce mois n’a pas pu être chargée : {layers}. Tout le reste est affiché.",
  },
  "cal.partialStale": {
    en: " The API answered 404, so it is probably running an older build than this page.",
    fr: " Le serveur a répondu 404 : il fait probablement tourner une version plus ancienne que cette page.",
  },
  "cal.layerWhatIsDue": { en: "what is due", fr: "les échéances" },
  "cal.layerForecast": { en: "the forecast", fr: "les prévisions" },
  "cal.emptyDay": {
    en: "Nothing on this day, in the layers you have on.",
    fr: "Rien ce jour-là, dans les couches activées.",
  },

  "cal.tagIn": { en: "in", fr: "entrée" },
  "cal.tagOut": { en: "out", fr: "sortie" },
  "cal.tagSaved": { en: "saved", fr: "épargné" },
  "cal.tagStock": { en: "stock", fr: "stock" },
  "cal.tagGym": { en: "gym", fr: "sport" },
  "cal.tagHabit": { en: "habit", fr: "habitude" },
  "cal.tagWaiting": { en: "waiting", fr: "en attente" },
  "cal.tagExpected": { en: "expected", fr: "prévu" },
  "cal.workout": { en: "Workout", fr: "Séance" },
  "cal.tagMeal": { en: "meal", fr: "repas" },
  // The day's energy, summed across its meals in whole ten-thousandths the way
  // the money line is summed in whole cents — never as a float (AD-5, AD-29).
  "cal.dayEnergy": { en: "{kcal} kcal eaten", fr: "{kcal} kcal mangées" },
  "cal.stockAdded": { en: "added, {quantity}", fr: "ajouté, {quantity}" },
  "cal.stockMoved": { en: "{before} → {after}", fr: "{before} → {after}" },
  "cal.proposedNotRecorded": {
    en: " — proposed, not yet recorded",
    fr: " — proposé, pas encore enregistré",
  },
  "cal.willBeAutomatic": {
    en: " — will be recorded automatically",
    fr: " — sera enregistré automatiquement",
  },
  "cal.willBeProposed": { en: " — will be proposed", fr: " — sera proposé" },
} satisfies Record<string, Entry>;
