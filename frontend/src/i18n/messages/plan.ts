import type { Entry } from "../catalogue";

/** Budgets, savings targets, recurring templates and the interest projection. */
export const plan = {
  // --- the plan page
  "plan.couldNotLoad": {
    en: "Could not load your plan.",
    fr: "Impossible de charger votre budget.",
  },
  "plan.savingsTargets": {
    en: "Monthly savings targets",
    fr: "Objectifs d’épargne mensuels",
  },
  "plan.noTypes": { en: "No savings types yet.", fr: "Aucune enveloppe d’épargne." },
  "plan.colMonthlyTarget": {
    en: "Monthly target ({symbol})",
    fr: "Objectif mensuel ({symbol})",
  },
  "plan.newType": { en: "New savings type", fr: "Nouvelle enveloppe" },
  "plan.recordContribution": { en: "Record a contribution", fr: "Enregistrer un versement" },
  "plan.savingsType": { en: "Savings type", fr: "Enveloppe d’épargne" },
  "plan.contributionAmount": { en: "Contribution amount", fr: "Montant du versement" },
  "plan.contributionDate": { en: "Contribution date", fr: "Date du versement" },
  "plan.nothingAside": { en: "Nothing put aside yet.", fr: "Rien mis de côté pour l’instant." },
  "plan.budgets": { en: "Monthly budgets", fr: "Budgets mensuels" },
  "plan.budgetsHint": {
    en: "Expense categories only — a budget on income would mean nothing.",
    fr: "Catégories de dépenses uniquement — un budget sur un revenu n’aurait aucun sens.",
  },
  "plan.noCategories": {
    en: "No expense categories yet. Record an entry to create one.",
    fr: "Aucune catégorie de dépense. Enregistrez une opération pour en créer une.",
  },
  "plan.colMonthlyBudget": {
    en: "Monthly budget ({symbol})",
    fr: "Budget mensuel ({symbol})",
  },
  "plan.colMonthly": { en: "Monthly", fr: "Mensuel" },
  "plan.monthlyAmountFor": {
    en: "Monthly amount for {name}",
    fr: "Montant mensuel pour {name}",
  },
  "plan.notSetPlaceholder": { en: "not set", fr: "non défini" },
  "plan.deleteNamed": { en: "Delete {name}", fr: "Supprimer {name}" },
  "plan.badAmountZeroOrMore": {
    en: "Enter an amount of zero or more, with at most two decimal places.",
    fr: "Saisissez un montant de zéro ou plus, à deux décimales au plus.",
  },
  "plan.couldNotCreateType": {
    en: "Could not create that savings type.",
    fr: "Impossible de créer cette enveloppe.",
  },
  "plan.couldNotRecordContribution": {
    en: "Could not record that contribution.",
    fr: "Impossible d’enregistrer ce versement.",
  },
  "plan.couldNotSaveAmount": {
    en: "Could not save that amount.",
    fr: "Impossible d’enregistrer ce montant.",
  },
  "plan.couldNotDeleteType": {
    en: "Could not delete that savings type.",
    fr: "Impossible de supprimer cette enveloppe.",
  },
  "plan.couldNotDeleteContribution": {
    en: "Could not delete that contribution.",
    fr: "Impossible de supprimer ce versement.",
  },
  "plan.couldNotDeleteCategory": {
    en: "Could not delete that category.",
    fr: "Impossible de supprimer cette catégorie.",
  },

  // --- recurring
  "recurring.title": { en: "Recurring", fr: "Récurrent" },
  "recurring.toConfirm": { en: "{count} to confirm", fr: "{count} à confirmer" },
  "recurring.templates_one": { en: "{count} template", fr: "{count} modèle" },
  "recurring.templates_other": { en: "{count} templates", fr: "{count} modèles" },
  "recurring.entriesToConfirm": {
    en: "Entries to confirm",
    fr: "Opérations à confirmer",
  },
  "recurring.colDue": { en: "Due", fr: "Échéance" },
  "recurring.amountFor": {
    en: "Amount for {name} due {date}",
    fr: "Montant de {name} échu le {date}",
  },
  "recurring.addFor": { en: "Add {name} due {date}", fr: "Ajouter {name} échu le {date}" },
  "recurring.skip": { en: "Skip", fr: "Passer" },
  "recurring.skipFor": { en: "Skip {name} due {date}", fr: "Passer {name} échu le {date}" },
  "recurring.added": { en: "Added {amount}", fr: "{amount} ajouté" },
  "recurring.skipped": { en: "Skipped", fr: "Passé" },
  "recurring.addForm": { en: "Add a recurring entry", fr: "Ajouter une récurrence" },
  "recurring.kind": { en: "Recurring kind", fr: "Type de récurrence" },
  "recurring.amount": { en: "Recurring amount", fr: "Montant récurrent" },
  "recurring.category": { en: "Recurring category", fr: "Catégorie récurrente" },
  "recurring.howOften": { en: "How often", fr: "Fréquence" },
  "recurring.firstDue": { en: "First due", fr: "Première échéance" },
  "recurring.note": { en: "Recurring note", fr: "Note récurrente" },
  "recurring.auto": { en: "Add automatically", fr: "Ajouter automatiquement" },
  "recurring.saved": { en: "Recurring entry saved", fr: "Récurrence enregistrée" },
  "recurring.hint": {
    en: "By default a recurring entry is proposed on its due date and waits for you. Tick “add automatically” only for a fixed amount like rent — a wrong amount created silently is worse than one not created at all.",
    fr: "Par défaut, une récurrence est proposée à son échéance et vous attend. Ne cochez « ajouter automatiquement » que pour un montant fixe comme un loyer : un montant erroné créé en silence est pire qu’un montant non créé.",
  },
  "recurring.none": { en: "Nothing recurring yet.", fr: "Aucune récurrence pour l’instant." },
  "recurring.templatesAria": { en: "Recurring templates", fr: "Modèles récurrents" },
  "recurring.colNext": { en: "Next", fr: "Prochaine" },
  "recurring.tagAuto": { en: "auto", fr: "auto" },
  "recurring.tagPaused": { en: "paused", fr: "en pause" },
  "recurring.pause": { en: "Pause", fr: "Mettre en pause" },
  "recurring.resume": { en: "Resume", fr: "Reprendre" },
  "recurring.pauseNamed": { en: "Pause {name}", fr: "Mettre {name} en pause" },
  "recurring.resumeNamed": { en: "Resume {name}", fr: "Reprendre {name}" },
  "recurring.deleteNamed": {
    en: "Delete recurring {name}",
    fr: "Supprimer la récurrence {name}",
  },
  "recurring.needCategory": {
    en: "A recurring entry needs a category.",
    fr: "Une récurrence a besoin d’une catégorie.",
  },
  "recurring.couldNotLoad": {
    en: "Could not load recurring entries.",
    fr: "Impossible de charger les récurrences.",
  },
  "recurring.couldNotConfirm": {
    en: "Could not confirm that entry.",
    fr: "Impossible de confirmer cette opération.",
  },
  "recurring.couldNotSkip": {
    en: "Could not skip that entry.",
    fr: "Impossible de passer cette opération.",
  },
  "recurring.couldNotSave": {
    en: "Could not save that.",
    fr: "Impossible d’enregistrer cela.",
  },
  "recurring.couldNotChange": {
    en: "Could not change that.",
    fr: "Impossible de modifier cela.",
  },
  "recurring.couldNotDelete": {
    en: "Could not delete that.",
    fr: "Impossible de supprimer cela.",
  },

  // How often a template repeats. On the wire these are "weekly"/"monthly"/"yearly" and
  // never translated; these are only the words drawn around them.
  "cadence.weekly": { en: "Weekly", fr: "Chaque semaine" },
  "cadence.monthly": { en: "Monthly", fr: "Chaque mois" },
  "cadence.yearly": { en: "Yearly", fr: "Chaque année" },

  // --- the interest projection (Grow)
  "grow.badInput": {
    en: "Enter amounts of zero or more, with at most two decimal places, and a rate.",
    fr: "Saisissez des montants de zéro ou plus, à deux décimales au plus, et un taux.",
  },
  "grow.compare": { en: "Compare", fr: "Comparer" },
  "grow.whatItGrowsTo": { en: "What it grows to", fr: "Ce que cela devient" },
  "grow.overYears_one": { en: "Over {count} year", fr: "Sur {count} an" },
  "grow.overYears_other": { en: "Over {count} years", fr: "Sur {count} ans" },
  "grow.years": { en: "Years", fr: "Années" },
  "grow.removeComparison": { en: "Remove comparison", fr: "Retirer la comparaison" },
  "grow.compareWith": { en: "Compare with another", fr: "Comparer avec un autre" },
  "grow.sameHorizonHint": {
    en: "Both run over the same period — comparing five years against thirty would tell you very little.",
    fr: "Les deux couvrent la même période : comparer cinq ans à trente n’apprendrait pas grand-chose.",
  },
  "grow.endsAtA": { en: "A ends at", fr: "A finit à" },
  "grow.endsAtB": { en: "B ends at", fr: "B finit à" },
  "grow.bMinusA": { en: "B minus A", fr: "B moins A" },
  "grow.growthAB": { en: "Growth A / B", fr: "Croissance A / B" },
  "grow.endsAt": { en: "Ends at", fr: "Valeur finale" },
  "grow.youPutIn": { en: "You put in", fr: "Vous versez" },
  "grow.interest": { en: "Interest", fr: "Intérêts" },
  "grow.growth": { en: "Growth", fr: "Croissance" },
  "grow.balanceOverTime": { en: "Balance over time", fr: "Solde au fil du temps" },
  "grow.hintComparing": {
    en: "Contribution bands are hidden while comparing — four overlapping areas is mud.",
    fr: "Les bandes de versements sont masquées pendant une comparaison : quatre aires superposées ne se lisent plus.",
  },
  "grow.hintCompound": {
    en: "The gap between the two lines is interest earning interest.",
    fr: "L’écart entre les deux courbes, ce sont les intérêts qui produisent des intérêts.",
  },
  "grow.hintSimple": {
    en: "Simple interest is paid on what you put in, never on the interest itself.",
    fr: "Les intérêts simples portent sur ce que vous versez, jamais sur les intérêts eux-mêmes.",
  },
  "grow.yearByYear": { en: "Year by year", fr: "Année par année" },
  "grow.nothingYet": { en: "Nothing to show yet.", fr: "Rien à afficher pour l’instant." },
  "grow.colYear": { en: "Year", fr: "Année" },
  "grow.colPaidIn": { en: "Paid in", fr: "Versé" },
  "grow.colBalance": { en: "Balance", fr: "Solde" },
  "grow.colDifference": { en: "Difference", fr: "Écart" },
  "grow.withSymbol": { en: "{label} ({symbol})", fr: "{label} ({symbol})" },
  "grow.starting": { en: "Starting ({symbol})", fr: "Départ ({symbol})" },
  "grow.monthly": { en: "Monthly ({symbol})", fr: "Mensuel ({symbol})" },
  "grow.rate": { en: "Rate (% a year)", fr: "Taux (% par an)" },
  "grow.interestType": { en: "Interest", fr: "Intérêts" },
  "grow.compounded": { en: "Compounded", fr: "Capitalisés" },
  "grow.compound": { en: "Compound", fr: "Composés" },
  "grow.simple": { en: "Simple", fr: "Simples" },
  "grow.everyMonth": { en: "Monthly", fr: "Chaque mois" },
  "grow.everyQuarter": { en: "Quarterly", fr: "Chaque trimestre" },
  "grow.everyYear": { en: "Annually", fr: "Chaque année" },
  "grow.startingAria": { en: "{title} starting amount", fr: "{title} : montant de départ" },
  "grow.monthlyAria": { en: "{title} added monthly", fr: "{title} : versement mensuel" },
  "grow.rateAria": { en: "{title} annual rate", fr: "{title} : taux annuel" },
  "grow.modeAria": { en: "{title} interest type", fr: "{title} : type d’intérêts" },
  "grow.frequencyAria": {
    en: "{title} compounding frequency",
    fr: "{title} : fréquence de capitalisation",
  },
  "grow.rowStart": { en: "Start ({symbol})", fr: "Départ ({symbol})" },
  "grow.rowMonthly": { en: "Monthly ({symbol})", fr: "Mensuel ({symbol})" },
  "grow.rowRate": { en: "Rate %", fr: "Taux %" },
  "grow.rowEvery": { en: "Every", fr: "Tous les" },
  "grow.scenarioField": { en: "Scenario {which} {label}", fr: "Scénario {which} : {label}" },
  "grow.freqMonth": { en: "Month", fr: "Mois" },
  "grow.freqQuarter": { en: "Quarter", fr: "Trimestre" },
  "grow.freqYear": { en: "Year", fr: "An" },
} satisfies Record<string, Entry>;
