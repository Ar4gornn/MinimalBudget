import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import {
  BOOK_SORTS,
  BOOK_STATUSES,
  type Book,
  type BookInput,
  type BookSeries,
  type BookSort,
  type BookStatus,
} from "../api/types";
import { Card, Empty, ErrorBanner } from "../components/ui";
import { useToast } from "../components/Toast";
import { HABITS_VIEWS, ViewSwitch } from "../components/ViewSwitch";
import { useT, type MessageKey } from "../i18n";
import { errorMessage, loadErrorMessage } from "../i18n/errors";
import { useDates } from "../useDates";

/**
 * The shelf (Epic 28): what is to be read, what is open, what has been read.
 *
 * **One form, two modes.** Twelve fields is too many to swap into a list row the way a food
 * or an inventory item does, so the card at the bottom is the form for a new book *and* the
 * form for the one being edited — "Edit" on a row fills it and retitles it. What the row
 * itself offers is the handful of acts that happen more than once per book: Start, Finished,
 * the rating, and the page you are on.
 *
 * **The status buttons are the transition, not the state.** "Start" is drawn on a book to
 * read and "Finished" on one being read, and pressing either sends only the status. The
 * server fills the date the move implies when it is empty (AD-46), which is why the form's
 * hint says to leave the dates alone.
 *
 * **Nothing here filters or sorts.** The chips and the search box are sent to the server,
 * so "which books match" is defined once and the dashboard's "reading now" reads the same
 * list with the same filter (AD-30, AD-37).
 */

const STATUS_LABEL: Record<BookStatus, MessageKey> = {
  "to-read": "books.status.to-read",
  reading: "books.status.reading",
  read: "books.status.read",
};

const SORT_LABEL: Record<BookSort, MessageKey> = {
  added: "books.sortAdded",
  title: "books.sortTitle",
  author: "books.sortAuthor",
  rating: "books.sortRating",
  finished: "books.sortFinished",
};

/** Every box on the form, as the strings an input holds. Empty is "not said". */
interface Draft {
  title: string;
  author: string;
  series_name: string;
  series_order: string;
  status: BookStatus;
  page_count: string;
  current_page: string;
  tags: string;
  note: string;
  added_on: string;
  started_on: string;
  finished_on: string;
}

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function blankDraft(): Draft {
  return {
    title: "",
    author: "",
    series_name: "",
    series_order: "",
    status: "to-read",
    page_count: "",
    current_page: "",
    tags: "",
    note: "",
    added_on: today(),
    started_on: "",
    finished_on: "",
  };
}

function draftOf(book: Book): Draft {
  return {
    title: book.title,
    author: book.author,
    series_name: book.series_name ?? "",
    series_order: book.series_order === null ? "" : String(book.series_order),
    status: book.status,
    page_count: book.page_count === null ? "" : String(book.page_count),
    current_page: book.current_page === null ? "" : String(book.current_page),
    tags: book.tags,
    note: book.note ?? "",
    added_on: book.added_on,
    started_on: book.started_on ?? "",
    finished_on: book.finished_on ?? "",
  };
}

/** An empty box is `null` on the wire, never `""` — a cleared date is a 422 otherwise. */
const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());
const numberOrNull = (value: string): number | null => (value.trim() === "" ? null : Number(value));

function toInput(draft: Draft): BookInput {
  return {
    title: draft.title.trim(),
    author: draft.author.trim(),
    series_name: orNull(draft.series_name),
    series_order: numberOrNull(draft.series_order),
    status: draft.status,
    page_count: numberOrNull(draft.page_count),
    current_page: numberOrNull(draft.current_page),
    tags: draft.tags,
    note: orNull(draft.note),
    // Required on the row; an emptied box falls back to today rather than nulling it.
    added_on: orNull(draft.added_on) ?? today(),
    started_on: orNull(draft.started_on),
    finished_on: orNull(draft.finished_on),
  };
}

/** What the undo of a delete sends: the row as it was, minus its id. */
function inputOf(book: Book): BookInput {
  return {
    title: book.title,
    author: book.author,
    series_name: book.series_name,
    series_order: book.series_order,
    status: book.status,
    rating: book.rating,
    page_count: book.page_count,
    current_page: book.current_page,
    tags: book.tags,
    note: book.note,
    added_on: book.added_on,
    started_on: book.started_on,
    finished_on: book.finished_on,
  };
}

const STARS = [1, 2, 3, 4, 5] as const;

function Stars({ book, onRate }: { book: Book; onRate: (rating: number | null) => void }) {
  const t = useT();
  return (
    <span className="stars" role="group" aria-label={t("books.rating")}>
      {STARS.map((n) => {
        const lit = book.rating !== null && n <= book.rating;
        const clears = book.rating === n;
        return (
          <button
            key={n}
            type="button"
            className={`star ${lit ? "lit" : ""}`}
            aria-pressed={lit}
            aria-label={clears ? t("books.clearRating") : t("books.rate", { n })}
            onClick={() => onRate(clears ? null : n)}
          >
            <span aria-hidden="true">{lit ? "★" : "☆"}</span>
          </button>
        );
      })}
      {book.rating === null && <span className="hint">{t("books.unrated")}</span>}
    </span>
  );
}

export function BooksPage() {
  const t = useT();
  const toast = useToast();
  const dates = useDates();
  const [searchParams, setSearchParams] = useSearchParams();

  const [books, setBooks] = useState<Book[]>([]);
  const [series, setSeries] = useState<BookSeries[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The dashboard links here with ?status=reading; the chip starts there.
  const fromUrl = searchParams.get("status");
  const [status, setStatus] = useState<BookStatus | "all">(
    BOOK_STATUSES.some((s) => s === fromUrl) ? (fromUrl as BookStatus) : "all",
  );
  const [seriesId, setSeriesId] = useState<string>("");
  const [sort, setSort] = useState<BookSort>("added");
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");

  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [editing, setEditing] = useState<Book | null>(null);
  const [saving, setSaving] = useState(false);
  // The page box on a "reading" row, keyed by book id, so typing does not write on every
  // keystroke — it is sent on blur or Enter.
  const [pageDrafts, setPageDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shelf, groups] = await Promise.all([
        api.listBooks({
          q,
          status: status === "all" ? undefined : status,
          series_id: seriesId || undefined,
          sort,
        }),
        api.listBookSeries(),
      ]);
      setBooks(shelf);
      setSeries(groups);
      setError(null);
    } catch (caught) {
      setError(loadErrorMessage(t, caught, "books.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [t, q, status, seriesId, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  // Once the ?status= from the dashboard has been read, drop it so a refresh is a normal
  // visit — the same handling Stock gives ?filter=restock.
  useEffect(() => {
    if (!searchParams.has("status")) return;
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // The search box waits for the typing to pause rather than asking on every letter.
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(typed.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [typed]);

  // A series that no longer exists (its last book left) cannot stay selected.
  useEffect(() => {
    if (seriesId && !series.some((s) => s.id === seriesId)) setSeriesId("");
  }, [series, seriesId]);

  const filtered = q !== "" || status !== "all" || seriesId !== "";

  async function act(work: () => Promise<unknown>, fallback: MessageKey) {
    try {
      await work();
      await load();
    } catch (caught) {
      toast.show(errorMessage(t, caught, fallback), { tone: "error" });
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !draft.title.trim() || !draft.author.trim()) return;
    setSaving(true);
    try {
      if (editing) await api.updateBook(editing.id, toInput(draft));
      else await api.createBook(toInput(draft));
      setDraft(blankDraft());
      setEditing(null);
      setError(null);
      await load();
    } catch (caught) {
      setError(errorMessage(t, caught, "books.couldNotSave"));
    } finally {
      setSaving(false);
    }
  }

  function startEditing(book: Book) {
    setEditing(book);
    setDraft(draftOf(book));
  }

  function cancelEditing() {
    setEditing(null);
    setDraft(blankDraft());
  }

  async function remove(book: Book) {
    await act(async () => {
      await api.deleteBook(book.id);
      if (editing?.id === book.id) cancelEditing();
      toast.show(t("books.deleted", { title: book.title }), {
        onUndo: async () => {
          await api.createBook(inputOf(book));
          await load();
        },
      });
    }, "books.couldNotDelete");
  }

  function commitPage(book: Book) {
    const typedPage = pageDrafts[book.id];
    if (typedPage === undefined) return;
    setPageDrafts((was) => {
      const next = { ...was };
      delete next[book.id];
      return next;
    });
    const page = numberOrNull(typedPage);
    if (page === book.current_page) return;
    void act(() => api.updateBook(book.id, { current_page: page }), "books.couldNotSave");
  }

  const seriesNames = useMemo(() => series.map((s) => s.name), [series]);

  const field = (key: keyof Draft, label: MessageKey, extra: Record<string, unknown> = {}) => (
    <label>
      {t(label)}
      <input
        value={draft[key]}
        onChange={(event) => setDraft((was) => ({ ...was, [key]: event.target.value }))}
        {...extra}
      />
    </label>
  );

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("books.title")}</h1>
        {/* Two views of one section: habits next door, books here. The shelf takes no
            bottom tab of its own — see App.tsx for the whole argument. */}
        <ViewSwitch label="view.habitsView" views={HABITS_VIEWS} current="/books" />
      </div>

      <ErrorBanner message={error} />

      <Card title={t("books.shelf")}>
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="chips" role="group" aria-label={t("books.filterStatus")}>
            <button
              type="button"
              className={`chip ${status === "all" ? "on" : ""}`}
              aria-pressed={status === "all"}
              onClick={() => setStatus("all")}
            >
              {t("books.all")}
            </button>
            {BOOK_STATUSES.map((option) => (
              <button
                key={option}
                type="button"
                className={`chip ${status === option ? "on" : ""}`}
                aria-pressed={status === option}
                onClick={() => setStatus(option)}
              >
                {t(STATUS_LABEL[option])}
              </button>
            ))}
          </div>
          <label style={{ flex: "1 1 160px" }}>
            {t("books.search")}
            <input
              type="search"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={t("books.searchPlaceholder")}
              maxLength={200}
            />
          </label>
          {series.length > 0 && (
            <label>
              {t("books.series")}
              <select value={seriesId} onChange={(event) => setSeriesId(event.target.value)}>
                <option value="">{t("books.anySeries")}</option>
                {series.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.books})
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t("books.sort")}
            <select value={sort} onChange={(event) => setSort(event.target.value as BookSort)}>
              {BOOK_SORTS.map((option) => (
                <option key={option} value={option}>
                  {t(SORT_LABEL[option])}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && books.length === 0 ? (
          <p className="hint">{t("state.loading")}</p>
        ) : books.length === 0 ? (
          // Only when the list really came back empty — not beside a red banner.
          error ? null : (
            <Empty>{filtered ? t("books.noneMatching") : t("books.none")}</Empty>
          )
        ) : (
          <>
            <p className="hint" style={{ margin: "0 0 6px" }}>
              {t.n("books.count", books.length)}
            </p>
            <ul className="book-list">
              {books.map((book) => {
                const pct =
                  book.page_count && book.current_page !== null
                    ? Math.round((100 * book.current_page) / book.page_count)
                    : null;
                return (
                  <li key={book.id} className="book" data-status={book.status}>
                    <div className="book-main">
                      <div className="book-title">
                        <strong>{book.title}</strong>
                        <span className="tag">{t(STATUS_LABEL[book.status])}</span>
                      </div>
                      <div className="hint">
                        {t("books.by", { author: book.author })}
                        {book.series_name && (
                          <>
                            {" · "}
                            {book.series_order === null
                              ? book.series_name
                              : t("books.inSeries", {
                                  series: book.series_name,
                                  order: book.series_order,
                                })}
                          </>
                        )}
                      </div>
                      {/* A shelf spans years, so a date not from this year says which. */}
                      <div className="hint book-dates">
                        {book.status === "read" && book.finished_on
                          ? t("books.finishedOn", {
                              date: dates.dayAcrossYears(book.finished_on),
                            })
                          : book.status === "reading" && book.started_on
                            ? t("books.startedOn", {
                                date: dates.dayAcrossYears(book.started_on),
                              })
                            : t("books.addedOn", {
                                date: dates.dayAcrossYears(book.added_on),
                              })}
                        {book.tags && (
                          <>
                            {" · "}
                            {book.tags}
                          </>
                        )}
                      </div>
                      {book.note && <div className="hint">{book.note}</div>}
                    </div>

                    <div className="book-side">
                      {book.status === "reading" && book.page_count !== null && (
                        <div className="book-progress">
                          <div
                            className="bar-track"
                            role="progressbar"
                            aria-label={t("books.progress")}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={pct ?? 0}
                          >
                            <div className="bar-fill under" style={{ width: `${pct ?? 0}%` }} />
                          </div>
                          <div className="book-page">
                            <label>
                              <span className="visually-hidden">
                                {t("books.updatePage", { title: book.title })}
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={book.page_count}
                                step={1}
                                value={pageDrafts[book.id] ?? book.current_page ?? ""}
                                onChange={(event) =>
                                  setPageDrafts((was) => ({
                                    ...was,
                                    [book.id]: event.target.value,
                                  }))
                                }
                                onBlur={() => commitPage(book)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    event.currentTarget.blur();
                                  }
                                }}
                              />
                            </label>
                            <span className="hint">
                              {t("books.pages", {
                                page: book.current_page ?? 0,
                                count: book.page_count,
                              })}
                            </span>
                          </div>
                        </div>
                      )}
                      {book.status !== "reading" && book.page_count !== null && (
                        <span className="hint">
                          {t("books.pageCountOnly", {
                            count: book.page_count,
                          })}
                        </span>
                      )}
                      <Stars
                        book={book}
                        onRate={(rating) =>
                          void act(() => api.updateBook(book.id, { rating }), "books.couldNotSave")
                        }
                      />
                      <div className="row" style={{ gap: 6 }}>
                        {book.status === "to-read" && (
                          <button
                            type="button"
                            onClick={() =>
                              void act(
                                () =>
                                  api.updateBook(book.id, {
                                    status: "reading",
                                  }),
                                "books.couldNotSave",
                              )
                            }
                          >
                            {t("books.start")}
                          </button>
                        )}
                        {book.status === "reading" && (
                          <button
                            type="button"
                            onClick={() =>
                              void act(
                                () => api.updateBook(book.id, { status: "read" }),
                                "books.couldNotSave",
                              )
                            }
                          >
                            {t("books.finish")}
                          </button>
                        )}
                        <button
                          type="button"
                          className="quiet"
                          aria-label={t("books.edit", { title: book.title })}
                          onClick={() => startEditing(book)}
                        >
                          {t("action.edit")}
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          aria-label={t("books.delete", { title: book.title })}
                          onClick={() => void remove(book)}
                        >
                          {t("action.delete")}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <Card
        title={editing ? t("books.editing", { title: editing.title }) : t("books.add")}
        actions={
          editing ? (
            <button type="button" className="quiet" onClick={cancelEditing}>
              {t("action.cancel")}
            </button>
          ) : undefined
        }
      >
        <form onSubmit={submit} className="row" style={{ gap: 8 }}>
          {field("title", "books.fieldTitle", {
            maxLength: 300,
            required: true,
          })}
          {field("author", "books.fieldAuthor", {
            maxLength: 200,
            required: true,
          })}
          {field("series_name", "books.fieldSeries", {
            maxLength: 200,
            list: "book-series-names",
          })}
          <datalist id="book-series-names">
            {seriesNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {field("series_order", "books.fieldSeriesOrder", {
            type: "number",
            min: 1,
            step: 1,
          })}
          <label>
            {t("books.fieldStatus")}
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft((was) => ({
                  ...was,
                  status: event.target.value as BookStatus,
                }))
              }
            >
              {BOOK_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {t(STATUS_LABEL[option])}
                </option>
              ))}
            </select>
          </label>
          {field("page_count", "books.fieldPages", {
            type: "number",
            min: 1,
            step: 1,
          })}
          {field("current_page", "books.fieldCurrentPage", {
            type: "number",
            min: 0,
            step: 1,
          })}
          {field("tags", "books.fieldTags", { maxLength: 500 })}
          {field("note", "books.fieldNote", { maxLength: 5000 })}
          {field("added_on", "books.fieldAddedOn", {
            type: "date",
            required: true,
          })}
          {field("started_on", "books.fieldStartedOn", { type: "date" })}
          {field("finished_on", "books.fieldFinishedOn", { type: "date" })}
          <button type="submit" disabled={saving}>
            {saving ? t("books.adding") : editing ? t("action.save") : t("action.add")}
          </button>
        </form>
        <p className="hint">{t("books.datesHint")}</p>
      </Card>
    </>
  );
}
