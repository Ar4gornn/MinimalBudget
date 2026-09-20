import { useState, type FormEvent } from "react";

import { api } from "../api/client";
import { QUOTE_MAX_LENGTH, QUOTES_PER_BOOK, type Book, type BookQuote } from "../api/types";
import { useT } from "../i18n";
import { errorMessage } from "../i18n/errors";
import { useToast } from "./Toast";

/**
 * The quotes kept under one book (Epic 31).
 *
 * **Two layers.** The quotes themselves are always drawn — small, italic, under the book's
 * own lines — because that is what they are for: a glance at the shelf brings the line
 * back. Changing them is the rarer act, so it sits behind one small toggle that opens a
 * panel with the form and, per quote, Edit and Delete. Closed by default; the shelf does
 * not become a notebook.
 *
 * **The cap is the server's** (`book_quotes_full`), but the form disappears at ten rather
 * than offering a submit that will be refused, and says why in one line.
 *
 * **Nothing here loads.** The book carries its quotes; every write calls `onChanged` and
 * the shelf reloads, the same round-trip Start and Finished make.
 */
export function BookQuotes({ book, onChanged }: { book: Book; onChanged: () => Promise<void> }) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BookQuote | null>(null);
  const [text, setText] = useState("");
  const [page, setPage] = useState("");
  const [saving, setSaving] = useState(false);

  const quotes = book.quotes;
  const full = quotes.length >= QUOTES_PER_BOOK && editing === null;

  function reset() {
    setEditing(null);
    setText("");
    setPage("");
  }

  function startEditing(quote: BookQuote) {
    setEditing(quote);
    setText(quote.text);
    setPage(quote.page === null ? "" : String(quote.page));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !text.trim()) return;
    setSaving(true);
    // An emptied page box is null on the wire, never "" (the API's language for a 422).
    const body = { text: text.trim(), page: page.trim() === "" ? null : Number(page) };
    try {
      if (editing) await api.updateBookQuote(book.id, editing.id, body);
      else await api.addBookQuote(book.id, body);
      reset();
      await onChanged();
    } catch (caught) {
      toast.show(errorMessage(t, caught, "quotes.couldNotSave"), { tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(quote: BookQuote) {
    try {
      await api.deleteBookQuote(book.id, quote.id);
      if (editing?.id === quote.id) reset();
      toast.show(t("quotes.deleted"), {
        onUndo: async () => {
          await api.addBookQuote(book.id, { text: quote.text, page: quote.page });
          await onChanged();
        },
      });
      await onChanged();
    } catch (caught) {
      toast.show(errorMessage(t, caught, "quotes.couldNotDelete"), { tone: "error" });
    }
  }

  // A real space before the dash, so copied or read-aloud text does not run together.
  const pageRef = (quote: BookQuote) =>
    quote.page === null ? null : (
      <>
        {" "}
        <span className="quote-page">— {t("quotes.page", { page: quote.page })}</span>
      </>
    );

  return (
    <>
      {quotes.length > 0 && (
        <ul className="book-quotes" aria-label={t("quotes.panelFor", { title: book.title })}>
          {quotes.map((quote) => (
            <li key={quote.id} className="book-quote">
              {quote.text}
              {pageRef(quote)}
            </li>
          ))}
        </ul>
      )}

      <div>
        <button
          type="button"
          className="quiet quote-btn"
          aria-expanded={open}
          onClick={() => {
            setOpen((was) => !was);
            if (open) reset();
          }}
        >
          {open ? t("quotes.hide") : quotes.length === 0 ? t("quotes.add") : t("quotes.manage")}
        </button>
      </div>

      {open && (
        <div
          className="quote-panel"
          role="group"
          aria-label={t("quotes.panelFor", { title: book.title })}
        >
          {quotes.map((quote) => (
            <div key={quote.id} className="quote-panel-row">
              <span className="book-quote">
                {quote.text}
                {pageRef(quote)}
              </span>
              <button
                type="button"
                className="quiet quote-btn"
                aria-label={t("quotes.edit")}
                onClick={() => startEditing(quote)}
              >
                {t("action.edit")}
              </button>
              <button
                type="button"
                className="quiet quote-btn"
                aria-label={t("quotes.delete")}
                onClick={() => void remove(quote)}
              >
                {t("action.delete")}
              </button>
            </div>
          ))}

          {full ? (
            <p className="hint" style={{ margin: 0 }}>
              {t("quotes.full", { max: QUOTES_PER_BOOK })}
            </p>
          ) : (
            <form onSubmit={submit} className="quote-panel-form">
              <label>
                {t("quotes.fieldText")}
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={t("quotes.placeholder")}
                  maxLength={QUOTE_MAX_LENGTH}
                  required
                />
              </label>
              <div className="row" style={{ gap: 8 }}>
                <label className="quote-page-field">
                  {t("quotes.fieldPage")}
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={page}
                    onChange={(event) => setPage(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={saving}>
                  {saving ? t("state.working") : editing ? t("action.save") : t("action.add")}
                </button>
                {editing && (
                  <button type="button" className="quiet" onClick={reset}>
                    {t("action.cancel")}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
