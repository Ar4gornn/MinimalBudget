import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type { NoteInput, NoteKind, Stroke } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { ErrorBanner } from "../components/ui";
import { useT } from "../i18n";
import { errorMessage } from "../i18n/errors";
import { dropDraft, keepDraft, readDrafts, saveDraft } from "../notes/drafts";
import { SketchPad } from "../notes/SketchPad";

/**
 * One note, being written (Epic 32). `/notes/new` starts one; `/notes/:id` opens one.
 *
 * **There is no Save button.** Every change is kept on the device at once and sent to the
 * server a moment after the typing stops, and again when the page is left or hidden — the
 * way a phone's own notes app behaves, which is the thing this is measured against. The
 * line under the title says where the words are: saved, saving, or on this device until
 * there is a network (AD-48).
 *
 * **The id is minted here**, when a new note opens, and the address is replaced with it
 * once there is something to keep. From then on every save is a PUT under that id, so a
 * retry after a lost response cannot make a second note.
 *
 * **Text or sketch, chosen while the note is empty.** The two chips disappear with the
 * first word or stroke: a note that changed kind would lose one kind's content, and the
 * server refuses the switch anyway.
 */

/** How long after the last change the server is asked. The device copy is immediate. */
const SAVE_AFTER_MS = 1200;

type Status = "idle" | "saving" | "saved" | "device" | "refused" | "empty";

const blank = (kind: NoteKind): NoteInput => ({
  kind,
  title: null,
  body: null,
  sketch: kind === "sketch" ? { strokes: [] } : null,
  pinned: false,
});

/** Empty text is `null` on the wire, never `""` — the server's rule, applied at the edge. */
function tidy(note: NoteInput): NoteInput {
  const title = note.title?.trim() ? note.title.trim() : null;
  const body = note.body?.trim() ? note.body : null;
  return { ...note, title, body: note.kind === "text" ? body : null };
}

function isEmpty(note: NoteInput): boolean {
  if (note.kind === "sketch") return (note.sketch?.strokes.length ?? 0) === 0 && !note.title?.trim();
  return !note.title?.trim() && !note.body?.trim();
}

export function NotePage() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const { noteId = "new" } = useParams();
  const [searchParams] = useSearchParams();

  const isNew = noteId === "new";
  // Minted once per new note, and kept when the address changes to carry it.
  const [id] = useState(() => (isNew ? crypto.randomUUID() : noteId));
  const [note, setNote] = useState<NoteInput | null>(() =>
    isNew ? blank(searchParams.get("kind") === "sketch" ? "sketch" : "text") : null,
  );
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [failure, setFailure] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  // What the load threw, put into words at render so the language is no dependency of it.
  const [loadCaught, setLoadCaught] = useState<unknown>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // The latest content, readable from the unmount and visibility handlers without making
  // them depend on it.
  const latest = useRef<NoteInput | null>(note);
  latest.current = note;
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  // An existing note: the device's draft wins when there is one, because it is newer than
  // anything the server has — it is the edit that has not reached it yet.
  useEffect(() => {
    // Not before the account is known: the drafts are keyed by it, and reading them as
    // nobody's would open the server's older copy over the device's newer one.
    if (isNew || latest.current || !userId) return;
    const draft = readDrafts(userId)[id];
    if (draft) {
      setNote(draft.note);
      setStatus(draft.pending ? "device" : draft.refused ? "refused" : "idle");
      return;
    }
    let live = true;
    api
      .getNote(id)
      .then((found) => {
        if (!live) return;
        const { kind, title, body, sketch, pinned } = found;
        setNote({ kind, title, body, sketch, pinned });
        setStatus("saved");
      })
      .catch((caught) => {
        if (!live) return;
        if (caught instanceof ApiError && caught.status === 404) setMissing(true);
        else setLoadCaught(caught ?? new Error("rejected with no reason"));
      });
    return () => {
      live = false;
    };
  }, [id, isNew, userId]);

  // A new text note is opened to be typed into, so the keyboard comes up with it. Done here
  // rather than with `autoFocus`, so it happens once, on arrival, and not on every remount.
  useEffect(() => {
    if (isNew) bodyRef.current?.focus();
  }, [isNew]);

  const send = useCallback(async () => {
    window.clearTimeout(timer.current);
    const current = latest.current;
    if (!current || !dirty.current) return;
    if (isEmpty(current)) {
      setStatus("empty");
      return;
    }
    dirty.current = false;
    setStatus("saving");
    const outcome = await saveDraft(userId, id, tidy(current));
    if (outcome.state === "saved") {
      // A newer edit made while this one was in flight is still dirty and still on the device.
      setStatus(dirty.current ? "saving" : "saved");
      setFailure(null);
    } else if (outcome.state === "offline") {
      setStatus("device");
    } else {
      setStatus("refused");
      setFailure(errorMessage(t, outcome.error, "notes.couldNotSave"));
    }
  }, [id, userId, t]);

  const change = (next: NoteInput) => {
    setNote(next);
    setTouched(true);
    dirty.current = true;
    if (isEmpty(next)) {
      // Nothing to keep. A new note that was emptied again leaves no draft behind.
      if (isNew) dropDraft(userId, id);
      setStatus("empty");
      window.clearTimeout(timer.current);
      return;
    }
    keepDraft(userId, id, tidy(next));
    if (isNew && noteId === "new") navigate(`/notes/${id}`, { replace: true });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void send(), SAVE_AFTER_MS);
  };

  // Leaving the page or hiding the app sends what is there now rather than after the delay:
  // a phone may never run the timer of a tab it has put in the background.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void send();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void send();
    };
  }, [send]);

  async function done() {
    await send();
    navigate("/notes");
  }

  async function remove() {
    if (!note) return;
    window.clearTimeout(timer.current);
    dirty.current = false;
    const kept = tidy(note);
    dropDraft(userId, id);
    try {
      await api.deleteNote(id);
    } catch (caught) {
      // Never saved on the server: removing the draft was the whole delete.
      if (!(caught instanceof ApiError && caught.status === 404)) {
        keepDraft(userId, id, kept);
        setFailure(errorMessage(t, caught, "notes.couldNotDelete"));
        return;
      }
    }
    navigate("/notes");
    if (!isEmpty(kept)) {
      toast.show(t("notes.deleted"), {
        onUndo: async () => {
          await api.putNote(id, kept);
        },
      });
    }
  }

  if (missing) {
    return (
      <div className="notes-editor">
        <Link to="/notes" className="hint back">
          ← {t("notes.title")}
        </Link>
        <p className="hint">{t("notes.notFound")}</p>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="notes-editor">
        <ErrorBanner
          message={loadCaught === null ? null : errorMessage(t, loadCaught, "notes.couldNotLoadOne")}
        />
      </div>
    );
  }

  const choosing = isNew && !touched;
  const strokes = note.sketch?.strokes ?? [];

  return (
    <div className="notes-editor">
      <div className="notes-editor-bar">
        <Link to="/notes" className="hint back">
          ← {t("notes.title")}
        </Link>
        <span className="hint" role="status">
          {status === "saving" && t("notes.saving")}
          {status === "saved" && t("notes.saved")}
          {status === "device" && t("notes.onDevice")}
          {status === "empty" && t("notes.emptyNotSaved")}
        </span>
        <button
          type="button"
          className={`quiet pin ${note.pinned ? "on" : ""}`}
          aria-pressed={note.pinned}
          onClick={() => change({ ...note, pinned: !note.pinned })}
        >
          {t(note.pinned ? "notes.unpin" : "notes.pin")}
        </button>
      </div>

      <ErrorBanner message={failure} />

      {choosing && (
        <div className="chips" role="group" aria-label={t("notes.kind")}>
          {(["text", "sketch"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={`chip ${note.kind === kind ? "on" : ""}`}
              aria-pressed={note.kind === kind}
              onClick={() => setNote(blank(kind))}
            >
              {t(kind === "text" ? "notes.kindText" : "notes.kindSketch")}
            </button>
          ))}
        </div>
      )}

      <input
        className="note-title"
        aria-label={t("notes.titleLabel")}
        placeholder={t("notes.titlePlaceholder")}
        maxLength={200}
        value={note.title ?? ""}
        onChange={(event) => change({ ...note, title: event.target.value })}
      />

      {note.kind === "text" ? (
        <textarea
          className="note-body"
          aria-label={t("notes.bodyLabel")}
          placeholder={t("notes.bodyPlaceholder")}
          maxLength={20000}
          ref={bodyRef}
          value={note.body ?? ""}
          onChange={(event) => change({ ...note, body: event.target.value })}
        />
      ) : (
        <SketchPad
          strokes={strokes}
          onChange={(next: Stroke[]) => change({ ...note, sketch: { strokes: next } })}
        />
      )}

      <div className="row notes-editor-actions">
        <button type="button" onClick={() => void done()}>
          {t("notes.done")}
        </button>
        {!choosing && (
          <button type="button" className="quiet" onClick={() => void remove()}>
            {t("notes.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
