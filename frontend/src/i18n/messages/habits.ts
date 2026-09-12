import type { Entry } from "../catalogue";

/**
 * Habits, their schedules and their check-ins (Epics 23, 25 and 26).
 *
 * The schedule sentences are the interesting part. The server sends a *rule* — a kind and
 * its parameters — and never a sentence, precisely so that "Mon, Wed, Fri" and
 * "lun., mer., ven." can be the same rule. French does not build these the way English
 * does: "the last Friday of the month" is "le dernier vendredi du mois", where the article
 * and the adjective both agree with a noun that is not in the template. So each kind gets
 * a whole sentence with holes, not a shared skeleton with a `{noun}` in the middle.
 *
 * The mood card is deliberately absent: Epic 24 is not committed, and translating strings
 * against code that may still change would be a guess wearing a translation.
 */
export const habits = {
  "habits.title": { en: "Habits", fr: "Habitudes" },
  "habits.today": { en: "Today", fr: "Aujourd’hui" },
  "habits.yours": { en: "Your habits", fr: "Vos habitudes" },
  "habits.none": {
    en: "No habits yet. Add one below — a name, and when it repeats.",
    fr: "Aucune habitude pour l’instant. Ajoutez-en une ci-dessous : un nom, et sa répétition.",
  },
  "habits.name": { en: "Habit name", fr: "Nom de l’habitude" },
  "habits.namePlaceholder": { en: "Run", fr: "Courir" },
  "habits.editName": { en: "Edit habit name", fr: "Modifier le nom de l’habitude" },
  "habits.remindMe": { en: "Remind me", fr: "Me le rappeler" },
  "habits.remindMeAbout": {
    en: "Remind me about this one",
    fr: "Me rappeler celle-ci",
  },
  "habits.reminds": { en: " · reminds", fr: " · rappel" },
  "habits.archived": { en: " · archived", fr: " · archivée" },
  "habits.historyFor": { en: "History for {name}", fr: "Historique de {name}" },
  "habits.checkIn": { en: "Check in {name}", fr: "Pointer {name}" },
  "habits.timeFor": {
    en: "Time for the next check-in of {name}",
    fr: "Heure du prochain pointage de {name}",
  },
  "habits.todaysCheckins": {
    en: "Today’s check-ins for {name}",
    fr: "Pointages du jour pour {name}",
  },
  "habits.removeCheckin": {
    en: "Remove the {time} check-in for {name}",
    fr: "Supprimer le pointage de {time} pour {name}",
  },
  "habits.untimed": { en: "untimed", fr: "sans heure" },
  "habits.todayHint": {
    en: "A check-in records the time in the box beside the button; tap a time to take that one back. A day the schedule does not ask for still accepts a check-in — it just counts towards neither the week nor the streak.",
    fr: "Un pointage enregistre l’heure indiquée dans le champ à côté du bouton ; touchez une heure pour annuler ce pointage-là. Un jour non prévu accepte quand même un pointage : il ne compte simplement ni pour la semaine ni pour la série.",
  },
  "habits.weeksStartMonday": {
    en: "Weeks start on Monday.",
    fr: "Les semaines commencent le lundi.",
  },
  "habits.editHint": {
    en: "Changing the schedule re-judges the past rather than rewriting it: every check-in keeps its date and its time, and only the verdict moves. “Remind me” adds this habit to the one daily notification — and only on the days it is actually due.",
    fr: "Changer la répétition réévalue le passé au lieu de le réécrire : chaque pointage garde sa date et son heure, seul le verdict change. « Me le rappeler » ajoute cette habitude à l’unique notification quotidienne — et seulement les jours où elle est prévue.",
  },
  "habits.editAria": { en: "Edit {name}", fr: "Modifier {name}" },
  "habits.addAria": { en: "Add a habit", fr: "Ajouter une habitude" },

  // --- progress
  "habits.doneToday": { en: "{done} of {target} today", fr: "{done} sur {target} aujourd’hui" },
  "habits.doneThisWeek": {
    en: "{done} of {target} this week",
    fr: "{done} sur {target} cette semaine",
  },
  "habits.occasionsThisWeek": {
    en: "{done} of {due} this week",
    fr: "{done} sur {due} cette semaine",
  },
  "habits.notDue": { en: "Not due today", fr: "Pas prévue aujourd’hui" },
  "habits.notDueNext": {
    en: "Not due today — next {date}",
    fr: "Pas prévue aujourd’hui — prochaine fois {date}",
  },
  // "5 in a row" counts occasions, not days: for a Mon/Wed/Fri habit five in a row spans
  // nearly a fortnight, which is exactly the figure the epic set out to make honest.
  "habits.streak_one": { en: "{count} in a row", fr: "{count} d’affilée" },
  "habits.streak_other": { en: "{count} in a row", fr: "{count} d’affilée" },
  "habits.streakWeeks_one": { en: "{count} week in a row", fr: "{count} semaine d’affilée" },
  "habits.streakWeeks_other": {
    en: "{count} weeks in a row",
    fr: "{count} semaines d’affilée",
  },

  // --- the schedule, as a rule the reader can read
  "habits.repeats": { en: "Repeats", fr: "Répétition" },
  "habits.scheduleAria": { en: "{form}: repeats", fr: "{form} : répétition" },
  "habits.formNew": { en: "New habit", fr: "Nouvelle habitude" },
  "habits.formEdit": { en: "Edit", fr: "Modification" },
  "habits.kind.daily": { en: "Every day", fr: "Tous les jours" },
  "habits.kind.weekdays": {
    en: "Certain days of the week",
    fr: "Certains jours de la semaine",
  },
  "habits.kind.times_per_week": {
    en: "So many times a week",
    fr: "Un certain nombre de fois par semaine",
  },
  "habits.kind.every_n_days": { en: "Every so many days", fr: "Tous les N jours" },
  "habits.kind.day_of_month": { en: "A day of the month", fr: "Un jour du mois" },
  "habits.kind.nth_weekday": {
    en: "A weekday of the month",
    fr: "Un jour de semaine dans le mois",
  },
  "habits.whichDays": { en: "Which days", fr: "Quels jours" },
  "habits.badInterval": {
    en: "Every how many days? A whole number from 2 to 365 — “every 1 day” is simply daily.",
    fr: "Tous les combien de jours ? Un nombre entier de 2 à 365 — « tous les 1 jour », c’est tous les jours.",
  },
  "habits.every": { en: "Every", fr: "Tous les" },
  "habits.intervalAria": { en: "{form}: interval in days", fr: "{form} : intervalle en jours" },
  "habits.dayOfMonth": { en: "Day", fr: "Jour" },
  "habits.dayOfMonthAria": { en: "{form}: day of the month", fr: "{form} : jour du mois" },
  "habits.which": { en: "Which", fr: "Lequel" },
  "habits.whichAria": { en: "{form}: which one", fr: "{form} : lequel" },
  "habits.weekday": { en: "Weekday", fr: "Jour" },
  "habits.weekdayAria": { en: "{form}: weekday", fr: "{form} : jour de la semaine" },
  "habits.timesPerWeek": { en: "Times/week", fr: "Fois/semaine" },
  "habits.timesEach": { en: "Times each", fr: "Fois par fois" },
  "habits.targetAria": {
    en: "{form}: times per occasion",
    fr: "{form} : nombre de fois par occasion",
  },
  "habits.nth.1": { en: "first", fr: "premier" },
  "habits.nth.2": { en: "second", fr: "deuxième" },
  "habits.nth.3": { en: "third", fr: "troisième" },
  "habits.nth.4": { en: "fourth", fr: "quatrième" },
  "habits.nth.last": { en: "last", fr: "dernier" },

  // Whole sentences per kind: French puts the article, the number and the noun in an order
  // English does not, so a shared skeleton would only ever fit one of the two.
  "habits.says.daily": { en: "Every day", fr: "Tous les jours" },
  "habits.says.dailyTimes": { en: "{count}× a day", fr: "{count}× par jour" },
  "habits.says.timesPerWeek": { en: "{count}× a week", fr: "{count}× par semaine" },
  "habits.says.weekdays": { en: "{days}", fr: "{days}" },
  "habits.says.weekdaysTimes": { en: "{count}× {days}", fr: "{count}× {days}" },
  "habits.says.everyDays": { en: "every {count} days", fr: "tous les {count} jours" },
  "habits.says.everyDaysTimes": {
    en: "{times}× every {count} days",
    fr: "{times}× tous les {count} jours",
  },
  "habits.says.dayOfMonth": { en: "the {day} of the month", fr: "le {day} du mois" },
  "habits.says.dayOfMonthTimes": {
    en: "{count}× the {day} of the month",
    fr: "{count}× le {day} du mois",
  },
  "habits.says.nthWeekday": {
    en: "the {nth} {weekday} of the month",
    fr: "le {nth} {weekday} du mois",
  },
  "habits.says.nthWeekdayTimes": {
    en: "{count}× the {nth} {weekday} of the month",
    fr: "{count}× le {nth} {weekday} du mois",
  },

  // --- the heat-map
  "habits.heatmapTitle": {
    en: "{name} — the last {weeks} weeks",
    fr: "{name} — les {weeks} dernières semaines",
  },
  "habits.heatmapAria": {
    en: "{name}: the last {weeks} weeks",
    fr: "{name} : les {weeks} dernières semaines",
  },
  "habits.heatmapLegend": {
    en: "An outlined square is a day it was due and not done; a flat one was never a habit day.",
    fr: "Un carré entouré est un jour prévu mais non fait ; un carré plat n’a jamais été un jour d’habitude.",
  },
  "habits.cellDone": { en: "{date}: {times}", fr: "{date} : {times}" },
  "habits.cellMissed": { en: "{date}: due, not done", fr: "{date} : prévu, non fait" },
  "habits.cellResting": { en: "{date}: not a habit day", fr: "{date} : jour sans habitude" },

  // --- confirmations and failures
  "habits.confirmDelete": { en: "Delete {name}?", fr: "Supprimer {name} ?" },
  "habits.confirmDeleteWith_one": {
    en: "Delete {name} and its {count} recorded check-in? Archiving keeps them.",
    fr: "Supprimer {name} et son {count} pointage enregistré ? L’archivage les conserve.",
  },
  "habits.confirmDeleteWith_other": {
    en: "Delete {name} and its {count} recorded check-ins? Archiving keeps them.",
    fr: "Supprimer {name} et ses {count} pointages enregistrés ? L’archivage les conserve.",
  },
  "habits.archivedToast": {
    en: "{name} archived. Its history is kept.",
    fr: "{name} archivée. Son historique est conservé.",
  },
  "habits.restoredToast": { en: "{name} is back.", fr: "{name} est de retour." },
  "habits.couldNotLoad": {
    en: "Could not load your habits.",
    fr: "Impossible de charger vos habitudes.",
  },
  "habits.couldNotCreate": {
    en: "Could not create that habit.",
    fr: "Impossible de créer cette habitude.",
  },
  "habits.couldNotSave": {
    en: "Could not save that habit.",
    fr: "Impossible d’enregistrer cette habitude.",
  },
  "habits.couldNotChange": {
    en: "Could not change that habit.",
    fr: "Impossible de modifier cette habitude.",
  },
  "habits.couldNotDelete": {
    en: "Could not delete that habit.",
    fr: "Impossible de supprimer cette habitude.",
  },
  "habits.couldNotRecord": { en: "Could not record that.", fr: "Impossible d’enregistrer cela." },
  "habits.couldNotUndo": { en: "Could not undo that.", fr: "Impossible d’annuler cela." },
  "habits.couldNotLoadHistory": {
    en: "Could not load that history.",
    fr: "Impossible de charger cet historique.",
  },
} satisfies Record<string, Entry>;
