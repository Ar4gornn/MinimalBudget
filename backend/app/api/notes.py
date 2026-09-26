import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.deps import CurrentUserId, DbSession
from app.models.notes import Note
from app.schemas.common import Page
from app.schemas.notes import NoteIn, NoteOut, Sketch
from app.services import notes

router = APIRouter(prefix="/api/notes", tags=["notes"])


def _out(note: Note) -> NoteOut:
    return NoteOut(
        id=note.id,
        kind=note.kind,
        title=note.title,
        body=note.body,
        sketch=Sketch.model_validate(note.sketch) if note.sketch is not None else None,
        pinned=note.pinned,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.get("", response_model=Page[NoteOut])
def list_notes(
    user_id: CurrentUserId,
    session: DbSession,
    q: Annotated[str | None, Query(max_length=200)] = None,
) -> Page[NoteOut]:
    """Pinned first, then the most recently changed. ``q`` matches the title and the body."""
    return Page[NoteOut](items=[_out(note) for note in notes.list_notes(session, user_id, q=q)])


@router.get("/{note_id}", response_model=NoteOut)
def read_note(note_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> NoteOut:
    return _out(notes.get_note(session, user_id, note_id))


@router.put("/{note_id}", response_model=NoteOut)
def write_note(
    note_id: uuid.UUID,
    payload: NoteIn,
    user_id: CurrentUserId,
    session: DbSession,
    response: Response,
) -> NoteOut:
    """Create or replace the note with this id, chosen by the client (AD-48).

    201 when the row is new, 200 when it replaced one — so a retried draft whose first
    attempt did land answers 200 and writes nothing twice.
    """
    note, created = notes.put_note(
        session,
        user_id,
        note_id,
        kind=payload.kind,
        title=payload.title,
        body=payload.body,
        sketch=payload.sketch.model_dump() if payload.sketch is not None else None,
        pinned=payload.pinned,
    )
    if created:
        response.status_code = status.HTTP_201_CREATED
    return _out(note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    notes.delete_note(session, user_id, note_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
