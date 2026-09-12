import type { Entry } from "../catalogue";

/** The dashboard, the entries list and a single category's page. */
export const entries = {
  // --- dashboard
  "dash.period": { en: "Period", fr: "Période" },
  "dash.month": { en: "Month", fr: "Mois" },
  "dash.year": { en: "Year", fr: "Année" },
  "dash.allTime": { en: "All time", fr: "Depuis le début" },
  "dash.couldNotLoad": {
    en: "Could not load the dashboard.",
    fr: "Impossible de charger le tableau de bord.",
  },
  "dash.income": { en: "Income", fr: "Revenus" },
  "dash.expense": { en: "Expense", fr: "Dépenses" },
  "dash.net": { en: "Net", fr: "Solde" },
  "dash.saved": { en: "Saved", fr: "Épargné" },
  "dash.rangeTo": { en: "{start} to {end}", fr: "du {start} au {end}" },

  "dash.toConfirm": { en: "To confirm", fr: "À confirmer" },
  "dash.pendingCount_one": { en: "{count} entry", fr: "{count} opération" },
  "dash.pendingCount_other": { en: "{count} entries", fr: "{count} opérations" },
  "dash.pendingWaiting_one": {
    en: "{count} recurring entry is waiting for you",
    fr: "{count} opération récurrente vous attend",
  },
  "dash.pendingWaiting_other": {
    en: "{count} recurring entries are waiting for you",
    fr: "{count} opérations récurrentes vous attendent",
  },

  "dash.restock": { en: "Restock", fr: "À racheter" },
  "dash.restockCount_one": { en: "{count} item", fr: "{count} article" },
  "dash.restockCount_other": { en: "{count} items", fr: "{count} articles" },
  "dash.restockNeed_one": {
    en: "{count} item needs restocking",
    fr: "{count} article est à racheter",
  },
  "dash.restockNeed_other": {
    en: "{count} items need restocking",
    fr: "{count} articles sont à racheter",
  },
  "dash.andMore": { en: ", …", fr: ", …" },

  "dash.periodNote": {
    en: "Budgets and savings targets are monthly amounts, so they are shown for a month only. The figures above cover {label}.",
    fr: "Les budgets et les objectifs d’épargne sont des montants mensuels : ils ne sont affichés que pour un mois. Les chiffres ci-dessus couvrent {label}.",
  },

  "dash.budgetVsActual": { en: "Budget vs actual", fr: "Budget et réel" },
  "dash.summaryNone": { en: "none", fr: "aucun" },
  "dash.categoriesCount": { en: "{count} categories", fr: "{count} catégories" },
  "dash.overCount": { en: " · {count} over", fr: " · {count} dépassé(s)" },
  "dash.noBudgets": {
    en: "No budgets set and nothing spent this month.",
    fr: "Aucun budget défini et rien de dépensé ce mois-ci.",
  },
  "dash.colCategory": { en: "Category", fr: "Catégorie" },
  "dash.colSpent": { en: "Spent ({symbol})", fr: "Dépensé ({symbol})" },
  "dash.colBudget": { en: "Budget ({symbol})", fr: "Budget ({symbol})" },
  "dash.colLeft": { en: "Left ({symbol})", fr: "Restant ({symbol})" },
  "dash.colProgress": { en: "Progress", fr: "Avancement" },
  "dash.colSpentShort": { en: "Spent", fr: "Dépensé" },
  "dash.colBudgetShort": { en: "Budget", fr: "Budget" },
  "dash.colLeftShort": { en: "Left", fr: "Restant" },
  "dash.notSet": { en: "not set", fr: "non défini" },
  "dash.budgetUsed": { en: "{name} budget used", fr: "budget {name} utilisé" },

  "dash.savingsProgress": { en: "Savings progress", fr: "Avancement de l’épargne" },
  "dash.savingsCount_one": { en: "{count} type", fr: "{count} enveloppe" },
  "dash.savingsCount_other": { en: "{count} types", fr: "{count} enveloppes" },
  "dash.noSavings": {
    en: "No targets set and nothing put aside this month.",
    fr: "Aucun objectif défini et rien mis de côté ce mois-ci.",
  },
  "dash.colType": { en: "Type", fr: "Enveloppe" },
  "dash.colSaved": { en: "Saved ({symbol})", fr: "Épargné ({symbol})" },
  "dash.colTarget": { en: "Target ({symbol})", fr: "Objectif ({symbol})" },
  "dash.colSavedShort": { en: "Saved", fr: "Épargné" },
  "dash.colTargetShort": { en: "Target", fr: "Objectif" },
  "dash.targetReached": { en: "{name} target reached", fr: "objectif {name} atteint" },

  "dash.lastMonths": { en: "Last {count} months", fr: "{count} derniers mois" },
  "dash.trendWindow": { en: "Trend window", fr: "Période du graphique" },
  "dash.monthsChip": { en: "{count} months", fr: "{count} mois" },
  "dash.expenseByCategory": { en: "Expense by category", fr: "Dépenses par catégorie" },
  "dash.nothingSpent": {
    en: "Nothing spent in this window.",
    fr: "Rien de dépensé sur cette période.",
  },
  "dash.colTrend": { en: "Trend", fr: "Tendance" },
  "dash.colThisMonth": { en: "This month ({symbol})", fr: "Ce mois-ci ({symbol})" },

  // --- units of measure (AD-29)
  //
  // Only three of the seven need translating at all: kg, lb, kWh and m³ are symbols, and a
  // symbol is the same in every language. Translating "kg" to "kg" is not redundancy — it
  // is the entry that stops someone "fixing" it later.
  "unit.l": { en: "litres", fr: "litres" },
  "unit.gal": { en: "gallons", fr: "gallons" },
  "unit.kg": { en: "kg", fr: "kg" },
  "unit.lb": { en: "lb", fr: "lb" },
  "unit.kwh": { en: "kWh", fr: "kWh" },
  "unit.m3": { en: "m³", fr: "m³" },
  "unit.unit": { en: "units", fr: "unités" },
  "unitOne.l": { en: "litre", fr: "litre" },
  "unitOne.gal": { en: "gallon", fr: "gallon" },
  "unitOne.kg": { en: "kg", fr: "kg" },
  "unitOne.lb": { en: "lb", fr: "lb" },
  "unitOne.kwh": { en: "kWh", fr: "kWh" },
  "unitOne.m3": { en: "m³", fr: "m³" },
  "unitOne.unit": { en: "unit", fr: "unité" },

  // --- the entries page
  "entries.title": { en: "Entries", fr: "Opérations" },
  "entries.record": { en: "Record an entry", fr: "Enregistrer une opération" },
  "entries.kind": { en: "Kind", fr: "Type" },
  "entries.amountAria": { en: "Amount in {currency}", fr: "Montant en {currency}" },
  "entries.categoryPlaceholder": { en: "Rent, Salary…", fr: "Loyer, Salaire…" },
  "entries.vendor": { en: "Vendor", fr: "Commerçant" },
  "entries.vendorPlaceholder": { en: "Shell, Lidl…", fr: "Total, Lidl…" },
  "entries.addQuantity": { en: "+ Quantity", fr: "+ Quantité" },
  "entries.quantityDetails": { en: "Quantity details", fr: "Détails de quantité" },
  "entries.quantityPlaceholder": { en: "40", fr: "40" },
  "entries.unit": { en: "Unit", fr: "Unité" },
  "entries.unitPrice": { en: "Unit price", fr: "Prix unitaire" },
  "entries.unitPriceAria": {
    en: "Unit price in {currency}",
    fr: "Prix unitaire en {currency}",
  },
  "entries.removeQuantity": { en: "Remove quantity", fr: "Retirer la quantité" },
  "entries.saving": { en: "Saving…", fr: "Enregistrement…" },
  "entries.formHint": {
    en: "A category that does not exist yet is created as you type it.",
    fr: "Une catégorie qui n’existe pas encore est créée au fur et à mesure que vous la tapez.",
  },
  "entries.formHintQuantity": {
    en: " Fill any two of amount, quantity and unit price.",
    fr: " Remplissez deux des trois : montant, quantité, prix unitaire.",
  },
  "entries.filterKind": { en: "Filter by kind", fr: "Filtrer par type" },
  "entries.filterMonth": { en: "Filter by month", fr: "Filtrer par mois" },
  "entries.filterCategory": { en: "Filter by category", fr: "Filtrer par catégorie" },
  "entries.filterAll": { en: "All", fr: "Tous" },
  "entries.search": { en: "Search", fr: "Recherche" },
  "entries.searchAria": { en: "Search entries", fr: "Rechercher des opérations" },
  "entries.searchPlaceholder": { en: "note or category", fr: "note ou catégorie" },
  "entries.monthRuns": { en: "{month} runs {range}", fr: "{month} va {range}" },
  "entries.noneMatching": {
    en: "Nothing matching “{search}” in this month.",
    fr: "Rien qui corresponde à « {search} » ce mois-ci.",
  },
  "entries.noneForFilter": {
    en: "Nothing recorded for this filter.",
    fr: "Rien d’enregistré pour ce filtre.",
  },
  "entries.colAmount": { en: "Amount ({symbol})", fr: "Montant ({symbol})" },
  "entries.colAmountShort": { en: "Amount", fr: "Montant" },
  "entries.editDate": { en: "Edit date", fr: "Modifier la date" },
  "entries.editCategory": { en: "Edit category", fr: "Modifier la catégorie" },
  "entries.editAmount": { en: "Edit amount", fr: "Modifier le montant" },
  "entries.editQuantity": { en: "Edit quantity", fr: "Modifier la quantité" },
  "entries.editUnit": { en: "Edit unit", fr: "Modifier l’unité" },
  "entries.editNote": { en: "Edit note", fr: "Modifier la note" },
  "entries.quantityShort": { en: "qty", fr: "qté" },
  "entries.editRow": {
    en: "Edit entry of {amount} on {date}",
    fr: "Modifier l’opération de {amount} du {date}",
  },
  "entries.deleteRow": {
    en: "Delete entry of {amount} on {date}",
    fr: "Supprimer l’opération de {amount} du {date}",
  },
  "entries.added": { en: "Entry added", fr: "Opération ajoutée" },
  "entries.updated": { en: "Entry updated", fr: "Opération modifiée" },
  "entries.deleted": { en: "Deleted {amount}", fr: "{amount} supprimé" },
  "entries.badAmount": {
    en: "Enter an amount with at most two decimal places, greater than zero.",
    fr: "Saisissez un montant à deux décimales au plus, supérieur à zéro.",
  },
  "entries.badQuantity": {
    en: "Enter a quantity with at most three decimal places, greater than zero.",
    fr: "Saisissez une quantité à trois décimales au plus, supérieure à zéro.",
  },
  "entries.needUnit": {
    en: "Choose a unit for the quantity.",
    fr: "Choisissez une unité pour la quantité.",
  },
  "entries.couldNotLoad": {
    en: "Could not load entries.",
    fr: "Impossible de charger les opérations.",
  },
  "entries.couldNotSave": {
    en: "Could not save the entry.",
    fr: "Impossible d’enregistrer l’opération.",
  },
  "entries.couldNotSaveChange": {
    en: "Could not save that change.",
    fr: "Impossible d’enregistrer cette modification.",
  },
  "entries.couldNotDelete": {
    en: "Could not delete the entry.",
    fr: "Impossible de supprimer l’opération.",
  },

  // --- one category's page
  "category.couldNotLoad": {
    en: "Could not load that category.",
    fr: "Impossible de charger cette catégorie.",
  },
  "category.backToEntries": { en: "← All entries", fr: "← Toutes les opérations" },
  "category.spentThisMonth": { en: "Spent this month", fr: "Dépensé ce mois-ci" },
  "category.budget": { en: "Budget", fr: "Budget" },
  "category.left": { en: "Left", fr: "Restant" },
  "category.noEntries": {
    en: "Nothing recorded in this category this month.",
    fr: "Rien d’enregistré dans cette catégorie ce mois-ci.",
  },
  "category.backToDashboard": { en: "← Dashboard", fr: "← Tableau" },
  "category.fallbackName": { en: "Category", fr: "Catégorie" },
  "category.entries": { en: "Entries", fr: "Opérations" },
  "category.byVendor": { en: "By vendor", fr: "Par commerçant" },
  "category.vendorRows": { en: "{count} rows", fr: "{count} lignes" },
  "category.colVendor": { en: "Vendor", fr: "Commerçant" },
  "category.colPerUnit": { en: "Per unit", fr: "Par unité" },
  "category.vendorHint": {
    en: "Volume-weighted over the last {months} months. A dash means those entries carried no quantity, so there is no rate to compare — they still count as spend.",
    fr: "Pondéré par les volumes sur les {months} derniers mois. Un tiret signifie que ces opérations ne portaient aucune quantité : il n’y a donc pas de prix à comparer, mais elles comptent bien comme dépense.",
  },
  "category.pricePer": {
    en: "Price per {unit} ({symbol})",
    fr: "Prix par {unit} ({symbol})",
  },
  "category.nothingIn": {
    en: "Nothing recorded here in {month}.",
    fr: "Rien d’enregistré ici en {month}.",
  },
  "category.addAnEntry": { en: "Add an entry", fr: "Ajouter une opération" },
  "category.or": { en: ", or ", fr: ", ou " },
  "category.previousMonth": {
    en: "look at the previous month",
    fr: "regarder le mois précédent",
  },
  "category.tableAria": { en: "Category entries", fr: "Opérations de la catégorie" },
  "category.couldNotDelete": {
    en: "Could not delete that entry.",
    fr: "Impossible de supprimer cette opération.",
  },

  // --- the dashboard's two views
  "view.dashboardView": { en: "Dashboard view", fr: "Vue du tableau de bord" },
  "view.summary": { en: "Summary", fr: "Résumé" },
  "view.calendar": { en: "Calendar", fr: "Calendrier" },

  // --- the toast
  "toast.undo": { en: "Undo", fr: "Annuler" },

  // --- chart captions
  //
  // A chart's `aria-label` is the only description a screen reader gets of it, so it is a
  // sentence rather than a title — and it is the part of a chart most easily forgotten in a
  // translation pass, because nothing on screen shows it.
  "chart.noMonths": { en: "No months to show.", fr: "Aucun mois à afficher." },
  "chart.trendAria": {
    en: "Income, expense and savings for {from} to {to}",
    fr: "Revenus, dépenses et épargne de {from} à {to}",
  },
  "chart.trendPoint": {
    en: "{series} — {month}: {amount}",
    fr: "{series} — {month} : {amount}",
  },
  "chart.spendingAria": {
    en: "{label} spending per month",
    fr: "Dépenses mensuelles : {label}",
  },
  "chart.restocksAria": {
    en: "{label} restocks per month",
    fr: "Réapprovisionnements mensuels : {label}",
  },
  "chart.quantityAria": {
    en: "{label} quantity over time",
    fr: "Quantité au fil du temps : {label}",
  },
  "chart.rateAria": {
    en: "{label} price per {unit} by month",
    fr: "Prix par {unit} et par mois : {label}",
  },
  "chart.strengthAria": {
    en: "{label}: heaviest set per session, in {unit}",
    fr: "{label} : série la plus lourde par séance, en {unit}",
  },
  "chart.growthAria": {
    en: "Balance and contributions over {years} years",
    fr: "Solde et versements sur {years} ans",
  },
  "chart.growthComparingAria": {
    en: "Comparing {labels}",
    fr: "Comparaison de {labels}",
  },
} satisfies Record<string, Entry>;
