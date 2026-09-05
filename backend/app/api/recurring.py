import uuid

from fastapi import APIRouter, Response, status

from app.core.deps import CurrentUserId, DbSession
from app.schemas.common import Page
from app.schemas.ledger import EntryOut
from app.schemas.recurring import (
    ConfirmRequest,
    PendingOut,
    TemplateCreate,
    TemplateOut,
    TemplateUpdate,
)
from app.services import recurring

router = APIRouter(prefix="/api/recurring", tags=["recurring"])


@router.get("/templates", response_model=Page[TemplateOut])
def list_templates(user_id: CurrentUserId, session: DbSession) -> Page[TemplateOut]:
    rows = recurring.list_templates(session, user_id)
    return Page[TemplateOut](items=[TemplateOut.model_validate(r) for r in rows])


@router.post("/templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: TemplateCreate, user_id: CurrentUserId, session: DbSession
) -> TemplateOut:
    template = recurring.create_template(
        session,
        user_id,
        kind=payload.kind,
        amount=payload.amount,
        note=payload.note,
        cadence=payload.cadence.value,
        start_on=payload.start_on,
        end_on=payload.end_on,
        auto=payload.auto,
        category_id=payload.category_id,
        category_name=payload.category_name,
    )
    return TemplateOut.model_validate(template)


@router.patch("/templates/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: uuid.UUID, payload: TemplateUpdate, user_id: CurrentUserId, session: DbSession
) -> TemplateOut:
    fields = {key: getattr(payload, key) for key in payload.model_fields_set}
    return TemplateOut.model_validate(
        recurring.update_template(session, user_id, template_id, fields)
    )


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    recurring.delete_template(session, user_id, template_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/pending", response_model=Page[PendingOut])
def list_pending(user_id: CurrentUserId, session: DbSession) -> Page[PendingOut]:
    """Materialises first, so reading the list is what brings it up to date (AD-33)."""
    recurring.materialise(session, user_id)
    rows = recurring.list_pending(session, user_id)
    return Page[PendingOut](items=[PendingOut.model_validate(r) for r in rows])


@router.post("/occurrences/{occurrence_id}/confirm", response_model=EntryOut)
def confirm(
    occurrence_id: uuid.UUID,
    payload: ConfirmRequest,
    user_id: CurrentUserId,
    session: DbSession,
) -> EntryOut:
    entry = recurring.confirm(session, user_id, occurrence_id, amount=payload.amount)
    return EntryOut.model_validate(entry)


@router.post("/occurrences/{occurrence_id}/skip", status_code=status.HTTP_204_NO_CONTENT)
def skip(occurrence_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    recurring.skip(session, user_id, occurrence_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
