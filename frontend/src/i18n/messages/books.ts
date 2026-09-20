import type { Entry } from "../catalogue";

/**
 * The library (Epic 28).
 *
 * Two things here are not word-for-word, and each is deliberate.
 *
 * **The statuses read as what the person would say.** English "To read / Reading / Read"
 * is three forms of one verb; French does the same job with "À lire / En cours / Lu". "Lu"
 * for the finished state rather than "Terminé", because a shelf says what was *read*, not
 * what was *completed* — and "En cours" rather than "En lecture", which is what a screen
 * says about a file.
 *
 * **"Start" and "Finished" are the two buttons, not "mark as reading".** They are the act,
 * in the order it happens, so a row's control reads as a step rather than a menu.
 */
export const books = {
  // --- the section switch (Habits · Books), drawn on both pages
  "view.habitsView": { en: "Habits view", fr: "Vue des habitudes" },
  "view.habits": { en: "Habits", fr: "Habitudes" },
  "view.books": { en: "Books", fr: "Livres" },

  // --- the page
  "books.title": { en: "Books", fr: "Livres" },
  "books.shelf": { en: "Your shelf", fr: "Votre étagère" },
  "books.none": {
    en: "No books yet. Add one below — a title and an author are enough.",
    fr: "Aucun livre pour l’instant. Ajoutez-en un ci-dessous : un titre et un auteur suffisent.",
  },
  "books.noneMatching": {
    en: "Nothing on the shelf matches that.",
    fr: "Rien sur l’étagère ne correspond.",
  },
  "books.couldNotLoad": {
    en: "Could not load your books.",
    fr: "Impossible de charger vos livres.",
  },
  "books.couldNotSave": {
    en: "Could not save that book.",
    fr: "Impossible d’enregistrer ce livre.",
  },
  "books.couldNotDelete": {
    en: "Could not delete that book.",
    fr: "Impossible de supprimer ce livre.",
  },
  "books.deleted": { en: "Deleted {title}.", fr: "{title} supprimé." },
  "books.count_one": { en: "{count} book", fr: "{count} livre" },
  "books.count_other": { en: "{count} books", fr: "{count} livres" },

  // --- filters
  "books.search": { en: "Search the shelf", fr: "Chercher sur l’étagère" },
  "books.searchPlaceholder": {
    en: "Title, author, tag or series",
    fr: "Titre, auteur, étiquette ou série",
  },
  "books.filterStatus": { en: "Show", fr: "Afficher" },
  "books.all": { en: "All", fr: "Tous" },
  "books.sort": { en: "Sort by", fr: "Trier par" },
  "books.sortAdded": { en: "Newest first", fr: "Plus récents d’abord" },
  "books.sortTitle": { en: "Title", fr: "Titre" },
  "books.sortAuthor": { en: "Author", fr: "Auteur" },
  "books.sortRating": { en: "Best rated", fr: "Mieux notés" },
  "books.sortFinished": { en: "Last finished", fr: "Derniers terminés" },
  "books.series": { en: "Series", fr: "Série" },
  "books.anySeries": { en: "Any series", fr: "Toutes les séries" },

  // --- the statuses, as the person would say them
  "books.status.to-read": { en: "To read", fr: "À lire" },
  "books.status.reading": { en: "Reading", fr: "En cours" },
  "books.status.read": { en: "Read", fr: "Lu" },
  "books.start": { en: "Start", fr: "Commencer" },
  "books.finish": { en: "Finished", fr: "Terminé" },

  // --- a row
  "books.by": { en: "by {author}", fr: "de {author}" },
  "books.inSeries": { en: "{series} #{order}", fr: "{series} nº {order}" },
  "books.pages": {
    en: "page {page} of {count}",
    fr: "page {page} sur {count}",
  },
  "books.pageCountOnly": { en: "{count} pages", fr: "{count} pages" },
  "books.progress": { en: "Reading progress", fr: "Progression de lecture" },
  "books.rating": { en: "Rating", fr: "Note" },
  "books.unrated": { en: "Unrated", fr: "Sans note" },
  "books.rate": { en: "Rate {n} out of 5", fr: "Noter {n} sur 5" },
  "books.clearRating": { en: "Clear the rating", fr: "Effacer la note" },
  "books.startedOn": { en: "Started {date}", fr: "Commencé le {date}" },
  "books.finishedOn": { en: "Finished {date}", fr: "Terminé le {date}" },
  "books.addedOn": { en: "Added {date}", fr: "Ajouté le {date}" },
  "books.edit": { en: "Edit {title}", fr: "Modifier {title}" },
  "books.delete": { en: "Delete {title}", fr: "Supprimer {title}" },
  "books.updatePage": {
    en: "Update the page for {title}",
    fr: "Mettre à jour la page de {title}",
  },

  // --- the form
  "books.add": { en: "Add a book", fr: "Ajouter un livre" },
  "books.adding": { en: "Adding…", fr: "Ajout…" },
  "books.editing": { en: "Editing {title}", fr: "Modification de {title}" },
  "books.fieldTitle": { en: "Title", fr: "Titre" },
  "books.fieldAuthor": { en: "Author", fr: "Auteur" },
  "books.fieldSeries": { en: "Series (optional)", fr: "Série (facultatif)" },
  "books.fieldSeriesOrder": { en: "No. in series", fr: "Nº dans la série" },
  "books.fieldStatus": { en: "Status", fr: "Statut" },
  "books.fieldPages": { en: "Pages", fr: "Pages" },
  "books.fieldCurrentPage": { en: "Current page", fr: "Page en cours" },
  "books.fieldTags": {
    en: "Tags, comma-separated",
    fr: "Étiquettes, séparées par des virgules",
  },
  "books.fieldNote": { en: "Note", fr: "Remarque" },
  "books.fieldAddedOn": { en: "Added on", fr: "Ajouté le" },
  "books.fieldStartedOn": { en: "Started on", fr: "Commencé le" },
  "books.fieldFinishedOn": { en: "Finished on", fr: "Terminé le" },
  "books.datesHint": {
    en: "Leave the dates empty and they fill in themselves when you press Start or Finished.",
    fr: "Laissez les dates vides : elles se remplissent d’elles-mêmes quand vous appuyez sur Commencer ou Terminé.",
  },

  // --- the dashboard card (AD-37: composed at the edge, read from this module)
  "dash.readingNow": { en: "Reading now", fr: "En cours de lecture" },
  "dash.readingCount_one": {
    en: "{count} book open",
    fr: "{count} livre en cours",
  },
  "dash.readingCount_other": {
    en: "{count} books open",
    fr: "{count} livres en cours",
  },

  // --- settings
  "settings.exportBooks": { en: "Books", fr: "Livres" },

  // --- refusals, keyed by the server's codes (AD-44)
  "error.book_date_future": {
    en: "That date has not happened yet.",
    fr: "Cette date n’est pas encore arrivée.",
  },
  "error.book_date_too_early": {
    en: "That date is too far in the past to be right.",
    fr: "Cette date est trop lointaine pour être juste.",
  },
  "error.book_dates_out_of_order": {
    en: "A book cannot be finished before it was started.",
    fr: "Un livre ne peut pas être terminé avant d’avoir été commencé.",
  },
  "error.book_page_without_count": {
    en: "Give the book a page count before recording a page.",
    fr: "Indiquez le nombre de pages du livre avant d’enregistrer une page.",
  },
  "error.book_page_beyond_count": {
    en: "The current page cannot be past the last one.",
    fr: "La page en cours ne peut pas dépasser la dernière.",
  },
  "error.book_series_order_without_series": {
    en: "A number in a series needs a series.",
    fr: "Un numéro dans une série nécessite une série.",
  },
} satisfies Record<string, Entry>;
