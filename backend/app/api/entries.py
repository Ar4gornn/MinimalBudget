import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.deps import CurrentUserId, DbSession
from app.models.ledger import EntryKind
from app.schemas.common import Page
from app.schemas.ledger import EntryCreate, EntryOut, EntryUpdate
from app.services import ledger

router = APIRouter(prefix="/api/entries", tags=["entries"])


@router.get("", response_model=Page[EntryOut])
def list_entries(
    user_id: CurrentUserId,
    session: DbSession,
    kind: EntryKind | None = None,
    month: Annotated[str | None, Query(description="YYYY-MM")] = None,
    category_id: uuid.UUID | None = None,
) -> Page[EntryOut]:
    rows = ledger.list_entries(
        session, user_id, kind=kind, month=month, category_id=category_id
    )
    return Page[EntryOut](items=[EntryOut.model_validate(r) for r in rows])


@router.post("", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(payload: EntryCreate, user_id: CurrentUserId, session: DbSession) -> EntryOut:
    entry = ledger.create_entry(
        session,
        user_id,
        kind=payload.kind,
        amount=payload.amount,
        occurred_on=payload.occurred_on,
        note=payload.note,
        category_id=payload.category_id,
        category_name=payload.category_name,
        quantity=payload.quantity,
        unit=payload.unit.value if payload.unit is not None else None,
    )
    return EntryOut.model_validate(entry)


@router.patch("/{entry_id}", response_model=EntryOut)
def update_entry(
    entry_id: uuid.UUID,
    payload: EntryUpdate,
    user_id: CurrentUserId,
    session: DbSession,
) -> EntryOut:
    entry = ledger.update_entry(
        session,
        user_id,
        entry_id,
        amount=payload.amount,
        occurred_on=payload.occurred_on,
        note=payload.note,
        # A note can legitimately be cleared to null, so "was it sent?" is not the same
        # question as "is it None?".
        note_given="note" in payload.model_fields_set,
        category_id=payload.category_id,
        quantity=payload.quantity,
        unit=payload.unit.value if payload.unit is not None else None,
        # The validator has already refused a lone half; either key present means the pair.
        quantity_given="quantity" in payload.model_fields_set,
    )
    return EntryOut.model_validate(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    ledger.delete_entry(session, user_id, entry_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
