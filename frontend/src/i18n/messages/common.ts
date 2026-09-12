import type { Entry } from "../catalogue";

/**
 * The shell, and the words that appear on more than one page.
 *
 * A string belongs here only when the *same* string is genuinely used in two places. A
 * shared "Save" is fine; a shared "Add" that means "add an entry" on one page and "add an
 * exercise" on another is not — French would want different words, and a shared key would
 * make that impossible to fix without touching both pages.
 */
export const common = {
  // The product name is a name. It is not translated, in either direction.
  "app.name": { en: "MinimalBudget", fr: "MinimalBudget" },

  "nav.sections": { en: "Sections", fr: "Sections" },
  "nav.more": { en: "More", fr: "Plus" },
  "nav.dashboard": { en: "Dashboard", fr: "Tableau" },
  "nav.entries": { en: "Entries", fr: "Opérations" },
  "nav.habits": { en: "Habits", fr: "Habitudes" },
  "nav.stock": { en: "Stock", fr: "Stock" },
  "nav.gym": { en: "Gym", fr: "Sport" },
  "nav.plan": { en: "Plan", fr: "Budget" },
  "nav.grow": { en: "Grow", fr: "Épargne" },
  "nav.settings": { en: "Settings", fr: "Réglages" },
  "nav.addEntry": { en: "Add an entry", fr: "Ajouter une opération" },

  "action.add": { en: "Add", fr: "Ajouter" },
  "action.save": { en: "Save", fr: "Enregistrer" },
  "action.cancel": { en: "Cancel", fr: "Annuler" },
  "action.edit": { en: "Edit", fr: "Modifier" },
  "action.delete": { en: "Delete", fr: "Supprimer" },
  "action.remove": { en: "Remove", fr: "Retirer" },
  "action.archive": { en: "Archive", fr: "Archiver" },
  "action.restore": { en: "Restore", fr: "Restaurer" },
  "action.close": { en: "Close", fr: "Fermer" },
  "action.showArchived": { en: "Show archived", fr: "Afficher les archivés" },
  "action.hideArchived": { en: "Hide archived", fr: "Masquer les archivés" },

  "state.loading": { en: "Loading…", fr: "Chargement…" },
  "state.working": { en: "Working…", fr: "En cours…" },
  "state.empty": { en: "Nothing here yet.", fr: "Rien pour l’instant." },

  "field.name": { en: "Name", fr: "Nom" },
  "field.amount": { en: "Amount", fr: "Montant" },
  "field.date": { en: "Date", fr: "Date" },
  "field.note": { en: "Note", fr: "Note" },
  "field.category": { en: "Category", fr: "Catégorie" },
  "field.quantity": { en: "Quantity", fr: "Quantité" },
  "field.month": { en: "Month", fr: "Mois" },

  // The two directions of the ledger. `kind` on the wire is "income"/"expense" and never
  // translated; these are only ever the words drawn around it (AD-6).
  "kind.income": { en: "Income", fr: "Revenu" },
  "kind.expense": { en: "Expense", fr: "Dépense" },

  "month.previous": { en: "Previous month", fr: "Mois précédent" },
  "month.next": { en: "Next month", fr: "Mois suivant" },
  "month.thisMonth": { en: "This month", fr: "Ce mois-ci" },
} satisfies Record<string, Entry>;
