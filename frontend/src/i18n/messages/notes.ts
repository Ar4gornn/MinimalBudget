import type { Entry } from "../catalogue";

/**
 * Notes (Epic 32). "Notes" in both languages — the name was chosen in the interview, and
 * French uses the same word for the same thing.
 *
 * The save line is the one place wording carries a promise, so it says where the words
 * *are*: "Saved" only once the server has them, and "On this device" — not "Offline" —
 * while they wait, because the reader's question is "is it safe", not "what is the
 * network doing".
 */
export const notes = {
  "nav.addNote": { en: "Write a note", fr: "Écrire une note" },

  "notes.title": { en: "Notes", fr: "Notes" },
  "notes.newText": { en: "New note", fr: "Nouvelle note" },
  "notes.newSketch": { en: "New sketch", fr: "Nouveau croquis" },
  "notes.search": { en: "Search notes", fr: "Rechercher dans les notes" },
  "notes.none": {
    en: "No notes yet. Write one — a line is enough.",
    fr: "Aucune note pour l’instant. Écrivez-en une : une ligne suffit.",
  },
  "notes.noneMatching": {
    en: "No note matches that.",
    fr: "Aucune note ne correspond.",
  },
  "notes.untitled": { en: "Untitled note", fr: "Note sans titre" },
  "notes.untitledSketch": { en: "Untitled sketch", fr: "Croquis sans titre" },
  "notes.unsynced": { en: "not synced yet", fr: "pas encore synchronisée" },
  "notes.pin": { en: "Pin", fr: "Épingler" },
  "notes.unpin": { en: "Unpin", fr: "Désépingler" },
  "notes.pinNamed": { en: "Pin {title}", fr: "Épingler {title}" },
  "notes.unpinNamed": { en: "Unpin {title}", fr: "Désépingler {title}" },
  "notes.delete": { en: "Delete", fr: "Supprimer" },
  "notes.deleteNamed": { en: "Delete {title}", fr: "Supprimer {title}" },
  "notes.deleted": { en: "Note deleted.", fr: "Note supprimée." },
  "notes.notFound": {
    en: "This note is not here any more.",
    fr: "Cette note n’existe plus.",
  },
  "notes.couldNotLoad": {
    en: "Could not load your notes.",
    fr: "Impossible de charger vos notes.",
  },
  "notes.couldNotLoadOne": {
    en: "Could not load this note.",
    fr: "Impossible de charger cette note.",
  },
  "notes.couldNotSave": {
    en: "Could not save this note.",
    fr: "Impossible d’enregistrer cette note.",
  },
  "notes.couldNotDelete": {
    en: "Could not delete this note.",
    fr: "Impossible de supprimer cette note.",
  },

  // --- the editor
  "notes.kind": { en: "Kind of note", fr: "Type de note" },
  "notes.kindText": { en: "Text", fr: "Texte" },
  "notes.kindSketch": { en: "Sketch", fr: "Croquis" },
  "notes.titleLabel": { en: "Title", fr: "Titre" },
  "notes.titlePlaceholder": { en: "Title (optional)", fr: "Titre (facultatif)" },
  "notes.bodyLabel": { en: "Note", fr: "Note" },
  "notes.bodyPlaceholder": { en: "Write something…", fr: "Écrivez quelque chose…" },
  "notes.done": { en: "Done", fr: "Terminé" },
  "notes.saving": { en: "Saving…", fr: "Enregistrement…" },
  "notes.saved": { en: "Saved", fr: "Enregistrée" },
  "notes.onDevice": {
    en: "On this device — will sync when online",
    fr: "Sur cet appareil — synchronisée dès le retour du réseau",
  },
  "notes.emptyNotSaved": {
    en: "Empty notes are not saved",
    fr: "Une note vide n’est pas enregistrée",
  },

  // --- the sketch pad
  "notes.tools": { en: "Drawing tools", fr: "Outils de dessin" },
  "notes.tool": { en: "Tool", fr: "Outil" },
  "notes.pen": { en: "Pen", fr: "Stylo" },
  "notes.eraser": { en: "Eraser", fr: "Gomme" },
  "notes.ink": { en: "Colour", fr: "Couleur" },
  "notes.inkDefault": { en: "Ink", fr: "Encre" },
  "notes.inkRed": { en: "Red", fr: "Rouge" },
  "notes.inkBlue": { en: "Blue", fr: "Bleu" },
  "notes.nib": { en: "Line width", fr: "Épaisseur" },
  "notes.thin": { en: "Thin", fr: "Fin" },
  "notes.thick": { en: "Thick", fr: "Épais" },
  "notes.undo": { en: "Undo", fr: "Annuler" },
  "notes.canvas": { en: "Drawing area", fr: "Zone de dessin" },
  "notes.sketchFull": {
    en: "This sketch is full. Start another one to keep drawing.",
    fr: "Ce croquis est plein. Commencez-en un autre pour continuer.",
  },

  // --- the server's refusals (AD-44). The editor never sends an empty note or a changed
  // kind, so these are what a stale client or a hand-made request would see.
  "error.note_empty": {
    en: "A note needs a title or some text.",
    fr: "Une note a besoin d’un titre ou d’un peu de texte.",
  },
  "error.note_kind_mismatch": {
    en: "A note is either text or a sketch, not both.",
    fr: "Une note est soit un texte, soit un croquis, pas les deux.",
  },
  "error.note_kind_changed": {
    en: "A note cannot change between text and sketch.",
    fr: "Une note ne peut pas passer du texte au croquis, ni l’inverse.",
  },
} satisfies Record<string, Entry>;
