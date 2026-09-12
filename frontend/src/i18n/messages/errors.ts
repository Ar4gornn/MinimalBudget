import type { Entry } from "../catalogue";

/**
 * What a refusal says, keyed by the server's own error code (AD-44).
 *
 * The server answers `{"detail": "<an English sentence>", "code": "<a stable fact>"}`. The
 * sentence is a fallback and the code is the contract: `errorMessage` in `../errors.ts`
 * looks the code up here, and falls back to the server's sentence when it finds nothing —
 * so a code this build has never heard of degrades to English rather than to blank.
 *
 * Keys are `error.<code>`, exactly. Deriving the key from the code by string concatenation
 * is what makes it impossible to map a code to the wrong message by hand.
 */
export const errors = {
  // --- the shape of a failure the client itself decided
  "error.generic": { en: "Something went wrong.", fr: "Une erreur est survenue." },
  // FastAPI's own validation failure. Its `detail` is a list of field errors written by
  // pydantic, in English, and phrased for a developer ("Input should be greater than or
  // equal to 2") — so this is one of the few places where a generic sentence in the
  // reader's language beats the specific one in somebody else's.
  "error.validation": {
    en: "Some of what you typed is not in a form this app can record.",
    fr: "Une partie de ce que vous avez saisi n’est pas dans une forme que l’application peut enregistrer.",
  },
  "error.network": {
    en: "Could not reach the server. Check your connection and try again.",
    fr: "Serveur injoignable. Vérifiez votre connexion et réessayez.",
  },
  "error.staleApi": {
    en: "The server answered 404 for a page that should exist, so it is probably running an older build than this one.",
    fr: "Le serveur a répondu 404 pour une page qui devrait exister : il fait probablement tourner une version plus ancienne que celle-ci.",
  },

  // --- auth
  "error.credentials_invalid": {
    en: "Incorrect email or password.",
    fr: "Adresse e-mail ou mot de passe incorrect.",
  },
  "error.session_expired": {
    en: "Your session has expired. Please sign in again.",
    fr: "Votre session a expiré. Veuillez vous reconnecter.",
  },
  "error.email_taken": {
    en: "That email is already registered.",
    fr: "Cette adresse e-mail est déjà utilisée.",
  },
  "error.invite_invalid": {
    en: "That invite code is not valid.",
    fr: "Ce code d’invitation n’est pas valide.",
  },
  "error.login_rate_limited": {
    en: "Too many failed sign-in attempts. Try again shortly.",
    fr: "Trop de tentatives de connexion échouées. Réessayez dans un instant.",
  },
  "error.recovery_rate_limited": {
    en: "Too many attempts. Try again shortly.",
    fr: "Trop de tentatives. Réessayez dans un instant.",
  },
  "error.recovery_invalid": {
    en: "Incorrect email or recovery code.",
    fr: "Adresse e-mail ou code de récupération incorrect.",
  },
  "error.password_incorrect": {
    en: "That password is not correct.",
    fr: "Ce mot de passe n’est pas correct.",
  },
  "error.currency_locked": {
    en: "This account already has entries. Changing the currency would relabel them rather than convert them, so it is locked.",
    fr: "Ce compte contient déjà des opérations. Changer la devise les réétiquetterait au lieu de les convertir : le réglage est donc verrouillé.",
  },
  "error.weight_unit_locked": {
    en: "This account already has logged sets. Changing the unit would relabel them rather than convert them, so it is locked.",
    fr: "Ce compte contient déjà des séries enregistrées. Changer l’unité les réétiquetterait au lieu de les convertir : le réglage est donc verrouillé.",
  },

  // --- the ledger
  "error.month_invalid": {
    en: "That is not a month this app understands.",
    fr: "Ce n’est pas un mois que l’application sait lire.",
  },
  "error.category_in_use": {
    en: "That category still has entries.",
    fr: "Cette catégorie contient encore des opérations.",
  },
  "error.vendor_in_use": {
    en: "That shop is still used by some entries.",
    fr: "Ce commerçant est encore utilisé par des opérations.",
  },
  "error.quantity_expense_only": {
    en: "Only an expense can carry a quantity.",
    fr: "Seule une dépense peut porter une quantité.",
  },
  "error.span_reversed": {
    en: "The end date must not be before the start date.",
    fr: "La date de fin ne peut pas précéder la date de début.",
  },
  "error.occurrence_decided": {
    en: "That one was already decided.",
    fr: "Celle-ci a déjà été traitée.",
  },
  "error.savings_type_in_use": {
    en: "That savings pot still has contributions.",
    fr: "Cette enveloppe d’épargne contient encore des versements.",
  },

  // --- the inventory
  "error.space_name_taken": {
    en: "A place with that name already exists.",
    fr: "Un endroit porte déjà ce nom.",
  },
  "error.space_in_use": {
    en: "That place still has items in it.",
    fr: "Cet endroit contient encore des articles.",
  },
  "error.quantity_not_positive": {
    en: "The quantity must be greater than zero.",
    fr: "La quantité doit être supérieure à zéro.",
  },
  "error.purchase_category_missing": {
    en: "An amount needs a category to file it under.",
    fr: "Un montant a besoin d’une catégorie pour être classé.",
  },
  "error.purchase_amount_missing": {
    en: "A category without an amount records nothing.",
    fr: "Une catégorie sans montant n’enregistre rien.",
  },

  // --- the gym
  "error.exercise_name_taken": {
    en: "You already have an exercise with that name.",
    fr: "Vous avez déjà un exercice portant ce nom.",
  },
  "error.exercise_in_use": {
    en: "That exercise is still used by a routine or a logged set.",
    fr: "Cet exercice est encore utilisé par un programme ou une série enregistrée.",
  },
  "error.routine_name_taken": {
    en: "You already have a routine with that name.",
    fr: "Vous avez déjà un programme portant ce nom.",
  },
  "error.routine_exercise_duplicate": {
    en: "That exercise is already in this routine.",
    fr: "Cet exercice fait déjà partie de ce programme.",
  },
  "error.video_link_not_https": {
    en: "A video link must start with https://",
    fr: "Un lien vidéo doit commencer par https://",
  },
  "error.video_link_invalid": {
    en: "That does not look like a video link.",
    fr: "Cela ne ressemble pas à un lien vidéo.",
  },

  // --- habits (Epic 26)
  "error.habit_name_taken": {
    en: "You already have a habit with that name.",
    fr: "Vous avez déjà une habitude portant ce nom.",
  },
  "error.habit_start_future": {
    en: "A habit cannot start in the future.",
    fr: "Une habitude ne peut pas commencer dans le futur.",
  },
  "error.schedule_kind_unknown": {
    en: "That is not a repeat this app knows.",
    fr: "Ce n’est pas une répétition que l’application connaît.",
  },
  "error.schedule_incomplete": {
    en: "That repeat is missing something — check the fields beside it.",
    fr: "Il manque quelque chose à cette répétition — vérifiez les champs à côté.",
  },
  "error.checkin_future": {
    en: "A check-in cannot be in the future.",
    fr: "Un pointage ne peut pas être dans le futur.",
  },
  "error.checkin_before_start": {
    en: "That is before this habit started.",
    fr: "C’est avant le début de cette habitude.",
  },
  "error.checkin_day_full": {
    en: "That is already a hundred times in one day.",
    fr: "Cela fait déjà cent fois dans la journée.",
  },
  "error.heatmap_window_invalid": {
    en: "That is not a window this app can draw.",
    fr: "Ce n’est pas une période que l’application sait dessiner.",
  },

  // --- mood
  "error.mood_day_future": {
    en: "That day has not happened yet.",
    fr: "Ce jour n’est pas encore arrivé.",
  },
  "error.mood_out_of_range": {
    en: "That is not a point on the scale.",
    fr: "Ce n’est pas un point de l’échelle.",
  },

  "error.not_found": {
    en: "That is not there — it may have been deleted.",
    fr: "Introuvable — l’élément a peut-être été supprimé.",
  },
  "error.conflict": {
    en: "That clashes with something already recorded.",
    fr: "Cela entre en conflit avec un élément déjà enregistré.",
  },
  "error.invalid": {
    en: "That is not something this app can record.",
    fr: "L’application ne peut pas enregistrer cela.",
  },
} satisfies Record<string, Entry>;
