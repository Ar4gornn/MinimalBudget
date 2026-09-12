import type { Entry } from "../catalogue";

/** The stock page, its spaces, and the shopping list that sits above them. */
export const inventory = {
  "stock.title": { en: "Stock", fr: "Stock" },
  "stock.searchAria": { en: "Search items", fr: "Rechercher des articles" },
  "stock.searchPlaceholder": { en: "name or note", fr: "nom ou note" },
  "stock.filter": { en: "Filter", fr: "Filtre" },
  "stock.all": { en: "All", fr: "Tout" },
  "stock.needsRestocking": { en: "Needs restocking", fr: "À racheter" },
  "stock.addItem": { en: "Add an item", fr: "Ajouter un article" },
  "stock.namePlaceholder": { en: "Milk, batteries…", fr: "Lait, piles…" },
  "stock.space": { en: "Space", fr: "Endroit" },
  "stock.spacePlaceholder": { en: "Fridge, Garage…", fr: "Frigo, Garage…" },
  "stock.remindAt": { en: "Remind at", fr: "Alerter à" },
  "stock.restockThreshold": { en: "Restock threshold", fr: "Seuil de réapprovisionnement" },
  "stock.cost": { en: "Cost", fr: "Coût" },
  "stock.costAria": { en: "Cost in {currency}", fr: "Coût en {currency}" },
  "stock.formHint": {
    en: "A space that does not exist yet is created as you type it. “Remind at” is the quantity at or below which the item shows as needing restocking.",
    fr: "Un endroit qui n’existe pas encore est créé au fur et à mesure que vous le tapez. « Alerter à » est la quantité à partir de laquelle l’article apparaît comme à racheter.",
  },
  "stock.noSpaces": {
    en: "A space is anywhere you keep things — Fridge, Garage, House stuff. Add an item above and its space is created with it.",
    fr: "Un endroit est n’importe où vous rangez des choses — Frigo, Garage, Maison. Ajoutez un article ci-dessus et son endroit est créé avec lui.",
  },
  "stock.nothingLow": { en: "Nothing needs restocking.", fr: "Rien à racheter." },
  "stock.renameSpaceAria": { en: "Rename space", fr: "Renommer l’endroit" },
  "stock.rename": { en: "Rename", fr: "Renommer" },
  "stock.renameNamed": { en: "Rename {name}", fr: "Renommer {name}" },
  "stock.deleteNamed": { en: "Delete {name}", fr: "Supprimer {name}" },
  "stock.itemsIn": { en: "{name} items", fr: "Articles : {name}" },
  "stock.colItem": { en: "Item", fr: "Article" },
  "stock.colCost": { en: "Cost ({symbol})", fr: "Coût ({symbol})" },
  "stock.editName": { en: "Edit name", fr: "Modifier le nom" },
  "stock.editSpace": { en: "Edit space", fr: "Modifier l’endroit" },
  "stock.editNote": { en: "Edit note", fr: "Modifier la note" },
  "stock.editQuantity": { en: "Edit quantity", fr: "Modifier la quantité" },
  "stock.editThreshold": { en: "Edit restock threshold", fr: "Modifier le seuil" },
  "stock.editCost": { en: "Edit cost", fr: "Modifier le coût" },
  "stock.notePlaceholder": { en: "note", fr: "note" },
  "stock.restockBadge": { en: "restock", fr: "à racheter" },
  "stock.oneLess": { en: "One less {name}", fr: "Un {name} de moins" },
  "stock.oneMore": { en: "One more {name}", fr: "Un {name} de plus" },
  "stock.quantityOf": { en: "{name} quantity", fr: "Quantité : {name}" },
  "stock.runningLow": { en: "Running low", fr: "Bientôt épuisé" },
  "stock.runningLowAria": {
    en: "{name} is running low",
    fr: "{name} est bientôt épuisé",
  },
  "stock.history": { en: "History", fr: "Historique" },
  "stock.historyOf": { en: "History of {name}", fr: "Historique de {name}" },
  "stock.editNamed": { en: "Edit {name}", fr: "Modifier {name}" },
  "stock.noChanges": {
    en: "No changes in the last 90 days.",
    fr: "Aucun changement ces 90 derniers jours.",
  },
  "stock.spaces": { en: "Spaces", fr: "Endroits" },
  "stock.addSpace": { en: "Add a space", fr: "Ajouter un endroit" },
  "stock.newSpace": { en: "New space", fr: "Nouvel endroit" },
  "stock.newSpacePlaceholder": { en: "Pantry", fr: "Cellier" },
  "stock.addSpaceButton": { en: "Add space", fr: "Ajouter" },
  "stock.restocksTitle": {
    en: "Restocks per space, last {months} months",
    fr: "Réapprovisionnements par endroit, {months} derniers mois",
  },
  "stock.restocksAria": {
    en: "Restocks per space",
    fr: "Réapprovisionnements par endroit",
  },
  "stock.colPerMonth": { en: "Per month", fr: "Par mois" },
  "stock.colTotal": { en: "Total", fr: "Total" },
  "stock.itemAdded": { en: "Item added", fr: "Article ajouté" },
  "stock.itemUpdated": { en: "Item updated", fr: "Article modifié" },
  "stock.itemDeleted": { en: "Deleted {name}", fr: "{name} supprimé" },
  "stock.badQuantity": {
    en: "Quantity must be a whole number, zero or more.",
    fr: "La quantité doit être un nombre entier, zéro ou plus.",
  },
  "stock.badThreshold": {
    en: "Restock threshold must be a whole number, zero or more.",
    fr: "Le seuil doit être un nombre entier, zéro ou plus.",
  },
  "stock.badCost": {
    en: "Enter a cost with at most two decimal places.",
    fr: "Saisissez un coût à deux décimales au plus.",
  },
  "stock.needName": { en: "An item needs a name.", fr: "Un article a besoin d’un nom." },
  "stock.couldNotLoad": {
    en: "Could not load the inventory.",
    fr: "Impossible de charger le stock.",
  },
  "stock.couldNotAdd": {
    en: "Could not add the item.",
    fr: "Impossible d’ajouter l’article.",
  },
  "stock.couldNotChangeQuantity": {
    en: "Could not change the quantity.",
    fr: "Impossible de modifier la quantité.",
  },
  "stock.couldNotMark": {
    en: "Could not mark the item.",
    fr: "Impossible de signaler l’article.",
  },
  "stock.couldNotSave": {
    en: "Could not save that change.",
    fr: "Impossible d’enregistrer cette modification.",
  },
  "stock.couldNotDelete": {
    en: "Could not delete the item.",
    fr: "Impossible de supprimer l’article.",
  },
  "stock.couldNotLoadHistory": {
    en: "Could not load the history.",
    fr: "Impossible de charger l’historique.",
  },
  "stock.couldNotAddSpace": {
    en: "Could not add the space.",
    fr: "Impossible d’ajouter l’endroit.",
  },
  "stock.couldNotRenameSpace": {
    en: "Could not rename the space.",
    fr: "Impossible de renommer l’endroit.",
  },
  "stock.couldNotDeleteSpace": {
    en: "Could not delete the space.",
    fr: "Impossible de supprimer l’endroit.",
  },

  // --- the shopping list
  "shopping.title": { en: "Shopping list", fr: "Liste de courses" },
  "shopping.fileUnder": { en: "File spending under", fr: "Classer la dépense dans" },
  "shopping.fileUnderPlaceholder": { en: "Groceries", fr: "Courses" },
  "shopping.colBuy": { en: "Buy", fr: "À acheter" },
  "shopping.howMany": { en: "How many {name}", fr: "Combien de {name}" },
  "shopping.whatCost": { en: "What {name} cost", fr: "Prix de {name}" },
  "shopping.bought": { en: "Bought", fr: "Acheté" },
  "shopping.boughtAria": { en: "Bought {name}", fr: "{name} acheté" },
  "shopping.restocked": { en: "{name} restocked", fr: "{name} réapprovisionné" },
  "shopping.restockedFor": {
    en: "{name} restocked · {amount}",
    fr: "{name} réapprovisionné · {amount}",
  },
  "shopping.estimated": { en: "{amount} estimated", fr: "{amount} estimés" },
  "shopping.withoutCost_one": {
    en: ", not counting {count} item with no recorded cost",
    fr: ", sans compter {count} article sans coût enregistré",
  },
  "shopping.withoutCost_other": {
    en: ", not counting {count} items with no recorded cost",
    fr: ", sans compter {count} articles sans coût enregistré",
  },
  "shopping.blankCostNote": {
    en: ". Leaving the cost blank still restocks the item, without recording an expense.",
    fr: ". Laisser le coût vide réapprovisionne quand même l’article, sans enregistrer de dépense.",
  },
  "shopping.howManyError": {
    en: "How many did you buy? A whole number, at least one.",
    fr: "Combien en avez-vous acheté ? Un nombre entier, au moins un.",
  },
  "shopping.couldNotLoad": {
    en: "Could not load the shopping list.",
    fr: "Impossible de charger la liste de courses.",
  },
  "shopping.couldNotRecord": {
    en: "Could not record that.",
    fr: "Impossible d’enregistrer cela.",
  },
} satisfies Record<string, Entry>;
