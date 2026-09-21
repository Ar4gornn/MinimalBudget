import type { Entry } from "../catalogue";

/** The guided tour on first sign-in (Epic 30), and its replay control in Settings. */
export const tour = {
  "tour.stepOf": { en: "Step {n} of {total}", fr: "Étape {n} sur {total}" },
  "tour.next": { en: "Next", fr: "Suivant" },
  "tour.skip": { en: "Skip the tour", fr: "Passer la visite" },
  "tour.begin": { en: "Let’s go", fr: "C’est parti" },
  "tour.finish": { en: "Done", fr: "Terminer" },

  "tour.welcome.title": { en: "Welcome to Everything Everywhere", fr: "Bienvenue dans Everything Everywhere" },
  "tour.welcome.body": {
    en: "Let’s add your first expense and see it tracked. It takes about two minutes, and you can leave at any point.",
    fr: "Ajoutons votre première dépense et voyons-la suivie. Cela prend environ deux minutes, et vous pouvez quitter à tout moment.",
  },

  "tour.entry.title": { en: "Record your first entry", fr: "Enregistrez votre première opération" },
  // {add} is the form’s own submit label, so the two cannot drift apart.
  "tour.entry.body": {
    en: "Enter an amount, type a category name — a new one is created as you go — and press {add}. The tour moves on by itself once it is saved.",
    fr: "Saisissez un montant, tapez un nom de catégorie — elle est créée au passage — puis appuyez sur {add}. La visite avance d’elle-même une fois l’opération enregistrée.",
  },

  "tour.history.title": { en: "It’s on the list", fr: "Elle est dans la liste" },
  "tour.history.body": {
    en: "Everything you record shows up here, filtered by month, kind or category, and any line can be edited or deleted in place.",
    fr: "Tout ce que vous enregistrez apparaît ici, filtrable par mois, type ou catégorie, et chaque ligne se modifie ou se supprime sur place.",
  },

  "tour.budget.title": { en: "Set a monthly budget", fr: "Fixez un budget mensuel" },
  "tour.budget.body": {
    en: "Give a category a monthly amount here, and the dashboard will tell you how you are doing against it. You can also leave this for later.",
    fr: "Donnez ici un montant mensuel à une catégorie, et le tableau de bord vous dira où vous en êtes. Vous pouvez aussi remettre cela à plus tard.",
  },

  "tour.progress.title": { en: "See how you’re tracking", fr: "Voyez où vous en êtes" },
  "tour.progress.body": {
    en: "This card compares what you have spent with each budget this month. Come back here whenever you want the short answer.",
    fr: "Cette carte compare vos dépenses du mois à chaque budget. Revenez ici dès que vous voulez la réponse courte.",
  },

  "tour.done.title": { en: "You’re all set", fr: "Tout est prêt" },
  "tour.done.body": {
    en: "Explore on your own from here. You can replay this tour at any time from Settings.",
    fr: "Explorez par vous-même à partir d’ici. Vous pouvez rejouer cette visite à tout moment depuis les réglages.",
  },

  // --- settings
  "settings.help": { en: "Help", fr: "Aide" },
  "settings.tourHint": {
    en: "A two-minute tour: record an entry, set a budget, read the dashboard.",
    fr: "Une visite de deux minutes : enregistrer une opération, fixer un budget, lire le tableau de bord.",
  },
  "settings.replayTour": { en: "Show the tour again", fr: "Revoir la visite" },
} satisfies Record<string, Entry>;
