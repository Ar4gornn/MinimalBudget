import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../api/client";
import type { Note, NoteInput } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { Empty, ErrorBanner } from "../components/ui";
import { useT } from "../i18n";
import { errorMessage } from "../i18n/errors";
import { type Draft, dropDraft, flushDrafts, readDrafts } from "../notes/drafts";
import { SketchView } from "../notes/SketchPad";
import { useDates } from "../useDates";
import { useLoad } from "../useLoad";

/**
 * Every note, pinned first (Epic 32). Reached from the note editor and from the Dashboard's
 * note button; it is a view of the Dashboard section, so that tab stays lit here.
 *
 * Search is the server's (AD-30), over the title and the body. A note still waiting on this
 * device is drawn from its draft — on top when the server has never seen it, in place of
 * the server's copy when it has — with a line saying it has not synced, so what the list
 * shows is what the person last wrote rather than what the server last heard.
 */

/** How long the search box waits after the last keystroke before asking. */
const SEARCH_AFTER_MS = 250;

interface Row {
  id: string;
  note: NoteInput;
  updated: string;
  unsynced: boolean;
}

function localDay(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function matches(note: NoteInput, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [note.title, note.body].some((text) => text?.toLowerCase().includes(needle));
}

/** Server rows with the device's drafts laid over them. Pinned first, then newest. */
export function mergeDrafts(server: Note[], drafts: Record<string, Draft>, q: string): Row[] {
  const rows: Row[] = server.map((note) => {
    const draft = drafts[note.id];
    return draft?.pending
      ? { id: note.id, note: draft.note, updated: draft.savedAt, unsynced: true }
      : { id: note.id, note, updated: note.updated_at, unsynced: false };
  });
  const known = new Set(server.map((note) => note.id));
  for (const [id, draft] of Object.entries(drafts)) {
    if (!known.has(id) && (draft.pending || draft.refused) && matches(draft.note, q)) {
      rows.push({ id, note: draft.note, updated: draft.savedAt, unsynced: true });
    }
  }
  return rows.sort(
    (a, b) =>
      Number(b.note.pinned) - Number(a.note.pinned) || b.updated.localeCompare(a.updated),
  );
}

export function NotesPage() {
  const t = useT();
  const toast = useToast();
  const dates = useDates();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(typed), SEARCH_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const { data, loading, failure: loadFailure, reload } = useLoad(
    async () => {
      // Anything waiting on this device goes first, so the list that follows includes it.
      await flushDrafts(userId).catch(() => 0);
      return api.listNotes(q);
    },
    [] as Note[],
    [q, userId],
    "notes.couldNotLoad",
  );

  // A draft that reaches the server while this page is open is reflected on the next load.
  useEffect(() => {
    const onOnline = () => void reload();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [reload]);

  const rows = mergeDrafts(data, readDrafts(userId), q);

  async function togglePin(row: Row) {
    setBusy(true);
    setFailure(null);
    try {
      await api.putNote(row.id, { ...row.note, pinned: !row.note.pinned });
      // An unsynced row's content just reached the server with its new pin; the draft
      // would otherwise be sent again later with the old one.
      dropDraft(userId, row.id);
      await reload();
    } catch (caught) {
      setFailure(errorMessage(t, caught, "notes.couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Row) {
    setBusy(true);
    setFailure(null);
    try {
      if (!row.unsynced || data.some((note) => note.id === row.id)) {
        await api.deleteNote(row.id);
      }
      dropDraft(userId, row.id);
      await reload();
      toast.show(t("notes.deleted"), {
        onUndo: async () => {
          // Put back under the id it had, so a link to it works again.
          await api.putNote(row.id, row.note);
          await reload();
        },
      });
    } catch (caught) {
      setFailure(errorMessage(t, caught, "notes.couldNotDelete"));
    } finally {
      setBusy(false);
    }
  }

  const heading = (row: Row) =>
    row.note.title ||
    row.note.body?.trim().split("\n")[0] ||
    t(row.note.kind === "sketch" ? "notes.untitledSketch" : "notes.untitled");

  return (
    <div className="notes-page">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("notes.title")}</h1>
        <div className="row">
          <button type="button" onClick={() => navigate("/notes/new")}>
            {t("notes.newText")}
          </button>
          <button type="button" className="quiet" onClick={() => navigate("/notes/new?kind=sketch")}>
            {t("notes.newSketch")}
          </button>
        </div>
      </div>

      <input
        type="search"
        className="notes-search"
        aria-label={t("notes.search")}
        placeholder={t("notes.search")}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
      />

      <ErrorBanner message={failure ?? loadFailure} />

      {!loading && !loadFailure && rows.length === 0 && (
        <Empty>{q.trim() ? t("notes.noneMatching") : t("notes.none")}</Empty>
      )}

      <ul className="note-list">
        {rows.map((row) => (
          <li key={row.id} className={`note-card ${row.note.pinned ? "pinned" : ""}`}>
            <Link to={`/notes/${row.id}`} className="note-open">
              {row.note.kind === "sketch" && (
                <SketchView className="note-thumb" strokes={row.note.sketch?.strokes ?? []} />
              )}
              <span className="note-text">
                <strong className="note-heading">{heading(row)}</strong>
                {row.note.kind === "text" && row.note.title && row.note.body && (
                  <span className="note-snippet">{row.note.body}</span>
                )}
                <span className="hint">
                  {dates.dayAcrossYears(localDay(row.updated))}
                  {row.unsynced && ` · ${t("notes.unsynced")}`}
                </span>
              </span>
            </Link>
            <div className="note-actions">
              <button
                type="button"
                className={`quiet pin ${row.note.pinned ? "on" : ""}`}
                aria-pressed={row.note.pinned}
                aria-label={t(row.note.pinned ? "notes.unpinNamed" : "notes.pinNamed", {
                  title: heading(row),
                })}
                disabled={busy}
                onClick={() => void togglePin(row)}
              >
                <span aria-hidden="true">📌</span>
              </button>
              <button
                type="button"
                className="quiet"
                aria-label={t("notes.deleteNamed", { title: heading(row) })}
                disabled={busy}
                onClick={() => void remove(row)}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
