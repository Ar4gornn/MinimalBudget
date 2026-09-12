import type { Entry } from "../catalogue";

/** Signing in, settings, password and recovery codes. */
export const account = {
  // --- sign in / register / recover
  "signin.intro": { en: "Sign in to your account.", fr: "Connectez-vous à votre compte." },
  "signin.introRegister": {
    en: "Create an account. Your data is visible only to you.",
    fr: "Créez un compte. Vos données ne sont visibles que par vous.",
  },
  "signin.introRecover": {
    en: "Enter your email, one unused recovery code, and a new password.",
    fr: "Saisissez votre adresse e-mail, un code de récupération inutilisé et un nouveau mot de passe.",
  },
  "signin.email": { en: "Email", fr: "Adresse e-mail" },
  "signin.password": { en: "Password", fr: "Mot de passe" },
  "signin.newPassword": { en: "New password", fr: "Nouveau mot de passe" },
  "signin.recoveryCode": { en: "Recovery code", fr: "Code de récupération" },
  "signin.inviteCode": { en: "Invite code", fr: "Code d’invitation" },
  "signin.currency": { en: "Currency", fr: "Devise" },
  "signin.language": { en: "Language", fr: "Langue" },
  "signin.show": { en: "Show", fr: "Afficher" },
  "signin.hide": { en: "Hide", fr: "Masquer" },
  "signin.showPassword": { en: "Show password", fr: "Afficher le mot de passe" },
  "signin.hidePassword": { en: "Hide password", fr: "Masquer le mot de passe" },
  "signin.submit": { en: "Sign in", fr: "Se connecter" },
  "signin.submitRegister": { en: "Create account", fr: "Créer le compte" },
  "signin.submitRecover": { en: "Set new password", fr: "Définir le mot de passe" },
  "signin.registerHint": {
    en: "Passwords need at least 10 characters. An invite code is required unless this instance is running in open mode. Your currency can only be changed while the account is still empty — amounts are stored, not converted.",
    fr: "Le mot de passe doit faire au moins 10 caractères. Un code d’invitation est requis, sauf si cette instance est en mode ouvert. La devise ne peut être changée que tant que le compte est vide : les montants sont enregistrés, jamais convertis.",
  },
  "signin.forgot": { en: "Forgot your password?", fr: "Mot de passe oublié ?" },
  "signin.backToSignIn": { en: "Back to sign in", fr: "Retour à la connexion" },
  "signin.haveAccount": { en: "Already have an account? ", fr: "Vous avez déjà un compte ? " },
  "signin.noAccount": { en: "No account yet? ", fr: "Pas encore de compte ? " },
  "signin.createOne": { en: "Create one", fr: "En créer un" },

  // --- settings
  "settings.title": { en: "Settings", fr: "Réglages" },
  "settings.account": { en: "Account", fr: "Compte" },
  "settings.signedInAs": { en: "Signed in as ", fr: "Connecté en tant que " },
  "settings.currency": { en: "Account currency", fr: "Devise du compte" },
  "settings.currencyUsd": { en: "US dollars ($)", fr: "Dollars américains ($)" },
  "settings.currencyEur": { en: "Euros (€)", fr: "Euros (€)" },
  "settings.currencyHint": {
    en: "Amounts are stored, not converted — changing this relabels them. It locks as soon as the account has its first entry.",
    fr: "Les montants sont enregistrés, pas convertis : changer ce réglage les réétiquette. Il se verrouille dès la première opération du compte.",
  },
  "settings.language": { en: "Language", fr: "Langue" },
  "settings.languageEn": { en: "English", fr: "Anglais" },
  "settings.languageFr": { en: "French", fr: "Français" },
  "settings.languageHint": {
    en: "Follows the account, not the device, so your phone and your laptop agree — and the daily notification arrives in the same language. Change it as often as you like: unlike the currency, it never locks, because it changes the words around a number and never the number.",
    fr: "Suit le compte et non l’appareil : votre téléphone et votre ordinateur restent d’accord, et la notification quotidienne arrive dans la même langue. Changez-en aussi souvent que vous voulez : contrairement à la devise, ce réglage ne se verrouille jamais, car il change les mots autour d’un nombre, jamais le nombre.",
  },
  "settings.budgetMonth": { en: "Budget month", fr: "Mois budgétaire" },
  "settings.startsOnDay": { en: "Starts on day", fr: "Commence le jour" },
  // The accessible name says which "day" this is; the visible label sits under a heading
  // that already does, and repeating it there would make the column twice as wide.
  "settings.startsOnDayAria": {
    en: "Budget month starts on day",
    fr: "Jour de début du mois budgétaire",
  },
  "settings.startsOnDayCalendar": {
    en: "1 (calendar month)",
    fr: "1 (mois calendaire)",
  },
  "settings.monthPlainHint": {
    en: "Months run from the 1st, as on a calendar.",
    fr: "Les mois commencent le 1er, comme sur un calendrier.",
  },
  "settings.monthShiftedHint": {
    en: "Months run from the {day} to the day before, and are named after the month they end in — so {month} is {range}.",
    fr: "Les mois vont du {day} à la veille du {day} suivant, et portent le nom du mois où ils se terminent : {month} correspond donc à {range}.",
  },
  "settings.monthHintTail": {
    en: "Set this to the day you are paid. Changing it only re-groups what you have already recorded; no amount or date is altered, so you can change it as often as you like.",
    fr: "Réglez-le sur le jour de votre paie. Le changer ne fait que regrouper autrement ce que vous avez déjà enregistré : aucun montant ni aucune date n’est modifié, vous pouvez donc en changer aussi souvent que vous voulez.",
  },
  "settings.export": { en: "Export", fr: "Export" },
  "settings.exportHint": {
    en: "Your records as CSV files, for a spreadsheet or for keeping. Text that a spreadsheet would run as a formula is written as plain text.",
    fr: "Vos enregistrements en fichiers CSV, pour un tableur ou pour les conserver. Tout texte qu’un tableur exécuterait comme une formule est écrit en texte brut.",
  },
  "settings.exportEntries": { en: "Entries CSV", fr: "Opérations (CSV)" },
  "settings.exportSavings": { en: "Savings CSV", fr: "Épargne (CSV)" },
  "settings.exportInventory": { en: "Stock CSV", fr: "Stock (CSV)" },
  "settings.exportPreparing": { en: "Preparing…", fr: "Préparation…" },
  "settings.notifications": { en: "Notifications", fr: "Notifications" },
  "settings.notificationsHint": {
    en: "A single daily reminder on this device when something needs restocking or a recurring entry is waiting. At most one a day, and nothing at all on a day with nothing to say.",
    fr: "Un seul rappel par jour sur cet appareil quand un article est à racheter ou qu’une opération récurrente attend. Au plus une fois par jour, et rien du tout un jour sans rien à signaler.",
  },
  "settings.notificationsOn": {
    en: "Turn on for this device",
    fr: "Activer sur cet appareil",
  },
  "settings.notificationsOff": { en: "Turn off", fr: "Désactiver" },
  "settings.noDevices": {
    en: "No devices are receiving notifications.",
    fr: "Aucun appareil ne reçoit de notifications.",
  },
  "settings.devices_one": {
    en: "{count} device is receiving them.",
    fr: "{count} appareil les reçoit.",
  },
  "settings.devices_other": {
    en: "{count} devices are receiving them.",
    fr: "{count} appareils les reçoivent.",
  },
  "settings.pushBlocked": {
    en: "Your browser is blocking notifications for this site. Allow them in its site settings, then try again.",
    fr: "Votre navigateur bloque les notifications pour ce site. Autorisez-les dans ses réglages, puis réessayez.",
  },
  "settings.pushUnsupported": {
    en: "This browser cannot show notifications.",
    fr: "Ce navigateur ne peut pas afficher de notifications.",
  },
  "settings.pushUnavailable": {
    en: "Notifications are not configured on this instance.",
    fr: "Les notifications ne sont pas configurées sur cette instance.",
  },
  "settings.session": { en: "Session", fr: "Session" },
  "settings.sessionHint": {
    en: "Signs this device out. Other devices stay signed in; changing the password signs out everything.",
    fr: "Déconnecte cet appareil. Les autres restent connectés ; changer le mot de passe les déconnecte tous.",
  },
  "settings.signOut": { en: "Sign out", fr: "Se déconnecter" },
  "settings.couldNotChange": {
    en: "Could not change that.",
    fr: "Impossible de modifier cela.",
  },
  "settings.couldNotExport": {
    en: "Could not export that.",
    fr: "Impossible d’exporter cela.",
  },

  // --- password and recovery codes
  "security.title": { en: "Password and recovery", fr: "Mot de passe et récupération" },
  "security.changePassword": { en: "Change password", fr: "Changer le mot de passe" },
  "security.currentPassword": { en: "Current password", fr: "Mot de passe actuel" },
  "security.newPassword": { en: "New password", fr: "Nouveau mot de passe" },
  "security.showNewPassword": {
    en: "Show new password",
    fr: "Afficher le nouveau mot de passe",
  },
  "security.hideNewPassword": {
    en: "Hide new password",
    fr: "Masquer le nouveau mot de passe",
  },
  "security.changing": { en: "Changing…", fr: "Modification…" },
  "security.tooShort": {
    en: "The new password needs at least 10 characters.",
    fr: "Le nouveau mot de passe doit faire au moins 10 caractères.",
  },
  "security.changed": {
    en: "Password changed. Other devices were signed out.",
    fr: "Mot de passe changé. Les autres appareils ont été déconnectés.",
  },
  "security.couldNotChange": {
    en: "Could not change the password.",
    fr: "Impossible de changer le mot de passe.",
  },
  "security.codes": { en: "Recovery codes", fr: "Codes de récupération" },
  "security.codesHint": {
    en: "If you forget your password, one of these codes plus your email lets you set a new one. Each works once. Keep them somewhere that is not this app.",
    fr: "Si vous oubliez votre mot de passe, un de ces codes et votre adresse e-mail vous permettent d’en définir un nouveau. Chacun ne sert qu’une fois. Conservez-les ailleurs que dans cette application.",
  },
  "security.codesUnused": {
    en: " {unused} of {total} unused.",
    fr: " {unused} sur {total} encore utilisables.",
  },
  "security.codesNone": { en: " None generated yet.", fr: " Aucun code généré pour l’instant." },
  "security.codesShownOnce": {
    en: "Shown once. Any codes you had before no longer work.",
    fr: "Affichés une seule fois. Vos anciens codes ne fonctionnent plus.",
  },
  "security.codesSaved": { en: "I have saved them", fr: "Je les ai notés" },
  "security.confirmPassword": { en: "Confirm password", fr: "Confirmez le mot de passe" },
  "security.generate": { en: "Generate codes", fr: "Générer des codes" },
  "security.generateNew": { en: "Generate new codes", fr: "Générer de nouveaux codes" },
  "security.generating": { en: "Generating…", fr: "Génération…" },
  "security.couldNotGenerate": {
    en: "Could not generate codes.",
    fr: "Impossible de générer les codes.",
  },
} satisfies Record<string, Entry>;
