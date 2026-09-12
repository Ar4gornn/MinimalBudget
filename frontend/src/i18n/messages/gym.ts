import type { Entry } from "../catalogue";

/** Routines, sessions and the set log (Epic 19). */
export const gym = {
  "gym.title": { en: "Gym", fr: "Sport" },
  "gym.couldNotLoad": { en: "Could not load the gym.", fr: "Impossible de charger la page." },

  // --- the session being logged
  "gym.session": { en: "Session · {date}", fr: "Séance · {date}" },
  "gym.done": { en: "Done", fr: "Terminé" },
  "gym.fromRoutine": { en: "From {name}", fr: "D’après {name}" },
  "gym.logASet": { en: "Log a set", fr: "Enregistrer une série" },
  "gym.exercise": { en: "Exercise", fr: "Exercice" },
  "gym.exercisePlaceholder": { en: "Bench press", fr: "Développé couché" },
  "gym.reps": { en: "Reps", fr: "Répétitions" },
  "gym.weight": { en: "Weight ({unit})", fr: "Poids ({unit})" },
  "gym.weightAria": { en: "Weight in {unit}", fr: "Poids en {unit}" },
  "gym.weightShort": { en: "Weight", fr: "Poids" },
  "gym.logSet": { en: "Log set", fr: "Enregistrer" },
  "gym.bodyweightHint": {
    en: "Leave the weight blank for a bodyweight set.",
    fr: "Laissez le poids vide pour une série au poids du corps.",
  },
  "gym.noSets": { en: "No sets yet.", fr: "Aucune série pour l’instant." },
  "gym.sets": { en: "Sets", fr: "Séries" },
  "gym.bodyweight": { en: "bodyweight", fr: "poids du corps" },
  "gym.deleteSet": {
    en: "Delete set of {name}",
    fr: "Supprimer la série de {name}",
  },
  "gym.badReps": {
    en: "How many reps? A whole number, at least one.",
    fr: "Combien de répétitions ? Un nombre entier, au moins une.",
  },
  "gym.badWeight": {
    en: "Enter a weight in {unit}, with at most two decimal places.",
    fr: "Saisissez un poids en {unit}, à deux décimales au plus.",
  },
  "gym.setLogged": { en: "Set logged", fr: "Série enregistrée" },
  "gym.couldNotLogSet": {
    en: "Could not log that set.",
    fr: "Impossible d’enregistrer cette série.",
  },
  "gym.couldNotDeleteSet": {
    en: "Could not delete that set.",
    fr: "Impossible de supprimer cette série.",
  },

  // --- starting a session
  "gym.startSession": { en: "Start a session", fr: "Commencer une séance" },
  "gym.startEmpty": { en: "Start empty", fr: "Séance libre" },
  "gym.startNamed": { en: "Start {name}", fr: "Commencer {name}" },
  "gym.noRoutinesHint": {
    en: "No routines yet. A routine is a named list of exercises you start a session from; you can also just start empty.",
    fr: "Aucun programme pour l’instant. Un programme est une liste d’exercices nommée par laquelle commencer une séance ; vous pouvez aussi commencer à vide.",
  },
  "gym.couldNotStart": {
    en: "Could not start that session.",
    fr: "Impossible de commencer cette séance.",
  },

  // --- routines
  "gym.routines": { en: "Routines", fr: "Programmes" },
  "gym.addRoutine": { en: "Add a routine", fr: "Ajouter un programme" },
  "gym.routineName": { en: "Routine name", fr: "Nom du programme" },
  "gym.routinePlaceholder": { en: "Push day", fr: "Jour poussée" },
  "gym.editNamed": { en: "Edit {name}", fr: "Modifier {name}" },
  "gym.addExerciseTo": {
    en: "Add an exercise to the routine",
    fr: "Ajouter un exercice au programme",
  },
  // Not just "Exercise": the session form above uses that, and two fields with the same
  // visible label on one screen is a question rather than a label.
  "gym.addExercise": { en: "Add exercise", fr: "Ajouter un exercice" },
  "gym.routineExercise": { en: "Routine exercise", fr: "Exercice du programme" },
  "gym.targetSets": { en: "Target sets", fr: "Séries visées" },
  "gym.targetReps": { en: "Target reps", fr: "Répétitions visées" },
  "gym.setsShort": { en: "Sets", fr: "Séries" },
  "gym.emptyRoutine": { en: "Nothing in {name} yet.", fr: "{name} est encore vide." },
  "gym.routineExercises": { en: "{name} exercises", fr: "Exercices : {name}" },
  "gym.colTarget": { en: "Target", fr: "Objectif" },
  "gym.video": { en: "video", fr: "vidéo" },
  "gym.removeFrom": {
    en: "Remove {exercise} from {routine}",
    fr: "Retirer {exercise} de {routine}",
  },
  "gym.couldNotCreateRoutine": {
    en: "Could not create that routine.",
    fr: "Impossible de créer ce programme.",
  },
  "gym.couldNotAddExercise": {
    en: "Could not add that exercise.",
    fr: "Impossible d’ajouter cet exercice.",
  },
  "gym.couldNotOpenRoutine": {
    en: "Could not open that routine.",
    fr: "Impossible d’ouvrir ce programme.",
  },
  "gym.couldNotRemove": {
    en: "Could not remove that.",
    fr: "Impossible de retirer cela.",
  },

  // --- progress
  "gym.progress": { en: "Progress", fr: "Progression" },
  "gym.exerciseCount": { en: "{count} exercises", fr: "{count} exercices" },
  "gym.logToSee": {
    en: "Log a set and the history appears here.",
    fr: "Enregistrez une série et l’historique apparaîtra ici.",
  },
  "gym.nothingLoggedFor": {
    en: "Nothing logged for {name} yet.",
    fr: "Rien d’enregistré pour {name} pour l’instant.",
  },
  "gym.couldNotLoadHistory": {
    en: "Could not load that history.",
    fr: "Impossible de charger cet historique.",
  },

  // --- recent sessions
  "gym.recent": { en: "Recent sessions", fr: "Séances récentes" },
  "gym.nothingLogged": { en: "Nothing logged yet.", fr: "Rien d’enregistré pour l’instant." },
  "gym.colRoutine": { en: "Routine", fr: "Programme" },
  "gym.open": { en: "Open", fr: "Ouvrir" },
  "gym.openSession": {
    en: "Open session of {date}",
    fr: "Ouvrir la séance du {date}",
  },
  "gym.deleteSession": {
    en: "Delete session of {date}",
    fr: "Supprimer la séance du {date}",
  },
  "gym.couldNotOpenSession": {
    en: "Could not open that session.",
    fr: "Impossible d’ouvrir cette séance.",
  },
  "gym.couldNotDeleteSession": {
    en: "Could not delete that session.",
    fr: "Impossible de supprimer cette séance.",
  },
} satisfies Record<string, Entry>;
