import datetime as dt
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
    PurchaseCreate,
    PurchaseOut,
    PurchaseResultOut,
    RestocksOut,
    ShoppingListOut,
    SpaceCreate,
    SpaceOut,
    SpaceUpdate,
)
from app.services import inventory, shopping

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
    q: Annotated[str | None, Query(max_length=80, description="matches name or note")] = None,
) -> Page[ItemOut]:
    rows = inventory.list_items(
        session, user_id, space_id=space_id, needs_restock=needs_restock, q=q
    )
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


@router.get("/shopping-list", response_model=ShoppingListOut)
def shopping_list(user_id: CurrentUserId, session: DbSession) -> ShoppingListOut:
    return ShoppingListOut.model_validate(shopping.shopping_list(session, user_id))


@router.post("/items/{item_id}/purchase", response_model=PurchaseResultOut)
def purchase(
    item_id: uuid.UUID,
    payload: PurchaseCreate,
    user_id: CurrentUserId,
    session: DbSession,
) -> PurchaseResultOut:
    """AD-31: the one write that crosses the module boundary, named for what it does.

    Both halves happen in the request's single transaction, so a failed entry leaves the
    item unrestocked rather than half-done.
    """
    item, record = shopping.purchase(
        session,
        user_id,
        item_id,
        quantity=payload.quantity,
        amount=payload.amount,
        occurred_on=payload.occurred_on or dt.date.today(),
        category_id=payload.category_id,
        category_name=payload.category_name,
    )
    return PurchaseResultOut(
        item=ItemOut.model_validate(item), purchase=PurchaseOut.model_validate(record)
    )


@router.get("/items/{item_id}/purchases", response_model=Page[PurchaseOut])
def item_purchases(
    item_id: uuid.UUID, user_id: CurrentUserId, session: DbSession
) -> Page[PurchaseOut]:
    rows = shopping.purchases(session, user_id, item_id)
    return Page[PurchaseOut](items=[PurchaseOut.model_validate(r) for r in rows])


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
