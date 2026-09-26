"""Notes: text or a sketch, pinned or not, found by search (Epic 32).

Its own module (AD-31): it imports its own model and ``core``, nothing else, and nothing
here commits (AD-4).

The write is an upsert on a **client-chosen id** (AD-48). A note is written from a draft
that may have been made offline, and a retry after a lost response must land on the row
the first attempt made rather than beside it — an id the client already holds is the only
key that survives the round trip. Everything else follows from that:

* An id that is somebody else's is a primary-key clash on a row this caller cannot see.
  It answers 404, the same as any other id that is not yours (AD-8), and never a 500.
* ``updated_at`` moves only when the content does. Pinning is filing, not editing, and a
  pin that bumped the note to the top of "recent" would reorder the list under the thumb
  that pressed it.
"""

import uuid
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import Invalid, NotFound
from app.core.search import ESCAPE, pattern
from app.models.notes import Note


def _query(user_id: uuid.UUID):
    return select(Note).where(Note.user_id == user_id)


def get_note(session: Session, user_id: uuid.UUID, note_id: uuid.UUID) -> Note:
    note = session.execute(_query(user_id).where(Note.id == note_id)).scalar_one_or_none()
    if note is None:
        raise NotFound("No note with that id")
    return note


def list_notes(session: Session, user_id: uuid.UUID, *, q: str | None = None) -> list[Note]:
    """Pinned first, then the most recently changed.

    ``q`` matches the title and the body. A sketch is found by its title only: there are no
    words inside a drawing to match, and pretending otherwise would need handwriting
    recognition this app does not have.
    """
    query = _query(user_id)
    if q and q.strip():
        like = pattern(q)
        query = query.where(
            or_(
                Note.title.ilike(like, escape=ESCAPE),
                Note.body.ilike(like, escape=ESCAPE),
            )
        )
    query = query.order_by(Note.pinned.desc(), Note.updated_at.desc(), Note.id)
    return list(session.execute(query).scalars())


def _content_error(kind: str, title: str | None, body: str | None, sketch: Any) -> None:
    """The kind rules, with a code, before the CHECK would refuse them with a 500."""
    if kind == "text":
        if sketch is not None:
            raise Invalid("a text note carries no sketch", "note_kind_mismatch")
        if title is None and body is None:
            raise Invalid("a note needs a title or some text", "note_empty")
    else:
        if body is not None:
            raise Invalid("a sketch carries no body text", "note_kind_mismatch")
        if sketch is None:
            raise Invalid("a sketch note needs its strokes", "note_empty")


def put_note(
    session: Session,
    user_id: uuid.UUID,
    note_id: uuid.UUID,
    *,
    kind: str,
    title: str | None,
    body: str | None,
    sketch: dict[str, Any] | None,
    pinned: bool,
) -> tuple[Note, bool]:
    """Create or replace the note with this id. Returns the note and whether it is new.

    A note's kind is fixed at birth: a text that became a sketch would be a different note,
    and the client never offers the switch once anything is written. Asking for it answers
    422 ``note_kind_changed`` rather than silently discarding one kind's content.
    """
    _content_error(kind, title, body, sketch)
    note = session.execute(_query(user_id).where(Note.id == note_id)).scalar_one_or_none()

    if note is None:
        note = Note(
            id=note_id,
            user_id=user_id,
            kind=kind,
            title=title,
            body=body,
            sketch=sketch,
            pinned=pinned,
        )
        session.add(note)
        try:
            session.flush()
        except IntegrityError as exc:
            # A unique violation on an insert of an id this caller cannot see means the id
            # is somebody else's row, hidden by RLS. Same answer as any id that is not
            # yours (AD-8). Anything else — a CHECK — is a bug here, and stays a 500
            # rather than hiding behind a 404.
            if getattr(exc.orig, "sqlstate", None) != "23505":
                raise
            session.rollback()
            raise NotFound("No note with that id") from exc
        session.refresh(note)
        return note, True

    if note.kind != kind:
        raise Invalid("a note cannot change from text to sketch or back", "note_kind_changed")

    changed = (note.title, note.body, note.sketch) != (title, body, sketch)
    note.title = title
    note.body = body
    note.sketch = sketch
    note.pinned = pinned
    if changed:
        note.updated_at = func.now()
    session.flush()
    # ``updated_at`` is a SQL expression on the instance until it is read back.
    session.refresh(note)
    return note, False


def delete_note(session: Session, user_id: uuid.UUID, note_id: uuid.UUID) -> None:
    note = get_note(session, user_id, note_id)
    session.delete(note)
    session.flush()
