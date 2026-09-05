import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.deps import CurrentUserId, DbSession
from app.schemas.common import Page
from app.schemas.inventory import (
    ItemChangeOut,
    ItemCreate,
    ItemOut,
    ItemUpdate,
    RestocksOut,
    SpaceCreate,
    SpaceOut,
    SpaceUpdate,
)
from app.services import inventory

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


# ------------------------------------------------------------------- spaces


@router.get("/spaces", response_model=Page[SpaceOut])
def list_spaces(user_id: CurrentUserId, session: DbSession) -> Page[SpaceOut]:
    rows = inventory.list_spaces(session, user_id)
    return Page[SpaceOut](items=[SpaceOut.model_validate(r) for r in rows])


@router.post("/spaces", response_model=SpaceOut, status_code=status.HTTP_201_CREATED)
def create_space(payload: SpaceCreate, user_id: CurrentUserId, session: DbSession) -> SpaceOut:
    return SpaceOut.model_validate(
        inventory.get_or_create_space(session, user_id, name=payload.name)
    )


@router.patch("/spaces/{space_id}", response_model=SpaceOut)
def rename_space(
    space_id: uuid.UUID, payload: SpaceUpdate, user_id: CurrentUserId, session: DbSession
) -> SpaceOut:
    return SpaceOut.model_validate(
        inventory.rename_space(session, user_id, space_id, name=payload.name)
    )


@router.delete("/spaces/{space_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_space(space_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    inventory.delete_space(session, user_id, space_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -------------------------------------------------------------------- items


@router.get("/items", response_model=Page[ItemOut])
def list_items(
    user_id: CurrentUserId,
    session: DbSession,
    space_id: uuid.UUID | None = None,
    needs_restock: bool | None = None,
) -> Page[ItemOut]:
    rows = inventory.list_items(session, user_id, space_id=space_id, needs_restock=needs_restock)
    return Page[ItemOut](items=[ItemOut.model_validate(r) for r in rows])


@router.post("/items", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemCreate, user_id: CurrentUserId, session: DbSession) -> ItemOut:
    item = inventory.create_item(
        session,
        user_id,
        name=payload.name,
        quantity=payload.quantity,
        restock_below=payload.restock_below,
        cost=payload.cost,
        note=payload.note,
        space_id=payload.space_id,
        space_name=payload.space_name,
    )
    return ItemOut.model_validate(item)


@router.patch("/items/{item_id}", response_model=ItemOut)
def update_item(
    item_id: uuid.UUID, payload: ItemUpdate, user_id: CurrentUserId, session: DbSession
) -> ItemOut:
    # Only the fields that were sent: a threshold, cost or note can be cleared to null,
    # so "absent" and "null" are different instructions.
    fields = {k: getattr(payload, k) for k in payload.model_fields_set}
    return ItemOut.model_validate(inventory.update_item(session, user_id, item_id, fields=fields))


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    inventory.delete_item(session, user_id, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/items/{item_id}/history", response_model=Page[ItemChangeOut])
def item_history(
    item_id: uuid.UUID,
    user_id: CurrentUserId,
    session: DbSession,
    days: Annotated[int, Query(ge=1, le=730)] = 90,
) -> Page[ItemChangeOut]:
    rows = inventory.item_history(session, user_id, item_id, days=days)
    return Page[ItemChangeOut](items=[ItemChangeOut.model_validate(r) for r in rows])


@router.get("/restocks", response_model=RestocksOut)
def restocks(
    user_id: CurrentUserId,
    session: DbSession,
    months: Annotated[int, Query(ge=1, le=36)] = 6,
    ending: Annotated[str | None, Query(description="YYYY-MM, defaults to this month")] = None,
) -> RestocksOut:
    return RestocksOut.model_validate(
        inventory.restocks(session, user_id, months=months, ending=ending)
    )
