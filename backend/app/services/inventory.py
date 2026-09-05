"""Spaces and items.

Nothing here commits (AD-4). Every query is additionally filtered by ``user_id`` as
defence in depth — row-level security is the authority. Nothing here imports the ledger
(AD-31).
"""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound
from app.core.months import add_months, format_month, parse_month
from app.models.inventory import InventoryItem, InventoryItemChange, Space

# ------------------------------------------------------------------- spaces


def list_spaces(session: Session, user_id: uuid.UUID) -> list[Space]:
    query = select(Space).where(Space.user_id == user_id).order_by(func.lower(Space.name), Space.id)
    return list(session.execute(query).scalars())


def get_or_create_space(session: Session, user_id: uuid.UUID, *, name: str) -> Space:
    """AD-12: idempotent by (user, lower(name)); ``ON CONFLICT`` so a race yields one row."""
    inserted = session.execute(
        text(
            """
            INSERT INTO spaces (user_id, name) VALUES (:uid, :name)
            ON CONFLICT (user_id, lower(name)) DO NOTHING
            RETURNING id
            """
        ),
        {"uid": str(user_id), "name": name},
    ).scalar_one_or_none()

    if inserted is None:
        existing = session.execute(
            select(Space).where(Space.user_id == user_id, func.lower(Space.name) == name.lower())
        ).scalar_one_or_none()
        if existing is None:  # pragma: no cover — would mean the unique index disagrees
            raise Conflict("space could not be created or found")
        return existing

    session.expire_all()
    space = session.get(Space, inserted)
    if space is None:  # pragma: no cover
        raise Conflict("space was inserted but is not readable")
    return space


def resolve_space(session: Session, user_id: uuid.UUID, space_id: uuid.UUID) -> Space:
    """AD-8: prove the space is the caller's before writing against it."""
    space = session.execute(
        select(Space).where(Space.user_id == user_id, Space.id == space_id)
    ).scalar_one_or_none()
    if space is None:
        raise NotFound("No space with that id")
    return space


def rename_space(session: Session, user_id: uuid.UUID, space_id: uuid.UUID, *, name: str) -> Space:
    space = resolve_space(session, user_id, space_id)
    space.name = name
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise Conflict("A space with that name already exists") from exc
    return space


def delete_space(session: Session, user_id: uuid.UUID, space_id: uuid.UUID) -> None:
    try:
        result = session.execute(
            delete(Space).where(Space.user_id == user_id, Space.id == space_id)
        )
    except IntegrityError as exc:
        # AD-21: RESTRICT. The items are the point; the space is only a label on them.
        session.rollback()
        raise Conflict("That space still has items") from exc
    if result.rowcount == 0:
        raise NotFound("No space with that id")


# -------------------------------------------------------------------- items


def _item_query(user_id: uuid.UUID):
    return select(InventoryItem).where(InventoryItem.user_id == user_id)


def list_items(
    session: Session,
    user_id: uuid.UUID,
    *,
    space_id: uuid.UUID | None = None,
    needs_restock: bool | None = None,
) -> list[InventoryItem]:
    query = _item_query(user_id)
    if space_id is not None:
        query = query.where(InventoryItem.space_id == space_id)
    if needs_restock is not None:
        # AD-30: the same expression the row carries, not a second one written here.
        query = query.where(InventoryItem.needs_restock.is_(needs_restock))
    query = query.order_by(func.lower(InventoryItem.name), InventoryItem.id)
    return list(session.execute(query).scalars())


def get_item(session: Session, user_id: uuid.UUID, item_id: uuid.UUID) -> InventoryItem:
    item = session.execute(
        _item_query(user_id).where(InventoryItem.id == item_id)
    ).scalar_one_or_none()
    if item is None:
        raise NotFound("No item with that id")
    return item


def _log_change(session: Session, item: InventoryItem, before: int, after: int) -> None:
    session.add(
        InventoryItemChange(
            user_id=item.user_id, item_id=item.id, quantity_before=before, quantity_after=after
        )
    )
    if after > before:
        item.restocked_at = func.now()


def create_item(
    session: Session,
    user_id: uuid.UUID,
    *,
    name: str,
    quantity: int,
    restock_below: int | None,
    cost: Decimal | None,
    note: str | None,
    space_id: uuid.UUID | None,
    space_name: str | None,
) -> InventoryItem:
    if space_name is not None:
        space = get_or_create_space(session, user_id, name=space_name)
    else:
        assert space_id is not None  # guaranteed by the schema's exactly-one rule
        space = resolve_space(session, user_id, space_id)

    item = InventoryItem(
        user_id=user_id,
        space_id=space.id,
        name=name,
        quantity=quantity,
        restock_below=restock_below,
        cost=cost,
        note=note,
    )
    session.add(item)
    session.flush()
    # The log starts at creation so the chart has a first point — as a level, not a change.
    # Logging it as 0 -> quantity would count every new item as a restock and stamp
    # restocked_at on a thing that was merely written down.
    _log_change(session, item, quantity, quantity)
    session.flush()
    session.refresh(item)
    return item


def update_item(
    session: Session,
    user_id: uuid.UUID,
    item_id: uuid.UUID,
    *,
    fields: dict,
) -> InventoryItem:
    """``fields`` holds only what the caller sent; a key present with None clears it."""
    item = get_item(session, user_id, item_id)

    if "space_id" in fields and fields["space_id"] is not None:
        resolve_space(session, user_id, fields["space_id"])
        item.space_id = fields["space_id"]
    if "name" in fields and fields["name"] is not None:
        item.name = fields["name"]
    if "restock_below" in fields:
        item.restock_below = fields["restock_below"]
    if "cost" in fields:
        item.cost = fields["cost"]
    if "note" in fields:
        item.note = fields["note"]
    if "quantity" in fields and fields["quantity"] is not None:
        before, after = item.quantity, fields["quantity"]
        if after != before:
            item.quantity = after
            _log_change(session, item, before, after)
    item.updated_at = func.now()

    session.flush()
    # needs_restock is a column_property: reload so the response reflects the new state.
    session.refresh(item)
    return item


def delete_item(session: Session, user_id: uuid.UUID, item_id: uuid.UUID) -> None:
    result = session.execute(
        delete(InventoryItem).where(InventoryItem.user_id == user_id, InventoryItem.id == item_id)
    )
    if result.rowcount == 0:
        raise NotFound("No item with that id")


def item_history(
    session: Session, user_id: uuid.UUID, item_id: uuid.UUID, *, days: int
) -> list[InventoryItemChange]:
    get_item(session, user_id, item_id)  # AD-8: 404 before anything else
    since = dt.datetime.now(dt.UTC) - dt.timedelta(days=days)
    query = (
        select(InventoryItemChange)
        .where(
            InventoryItemChange.user_id == user_id,
            InventoryItemChange.item_id == item_id,
            InventoryItemChange.changed_at >= since,
        )
        .order_by(InventoryItemChange.changed_at, InventoryItemChange.id)
    )
    return list(session.execute(query).scalars())


# AD-9: restocks per space per month, driven from the spaces so one with no restocks still
# appears at zero, over a generate_series so no month is missing.
#
# changed_at is a timestamptz, and which month it falls in depends on a time zone. AD-10's
# DATE columns carry a calendar day the user chose; a log stamp does not, so the day is
# fixed here to UTC explicitly rather than left to whatever TimeZone the session happens
# to have. Stated limitation: a restock at 00:30 local east of UTC lands in the previous
# UTC day. A per-user time zone is the fix, if it is ever wanted, and it is one expression.
_RESTOCKS = text(
    """
    WITH months AS (
        SELECT CAST(
            generate_series(CAST(:start AS date), CAST(:last AS date), interval '1 month')
            AS date
        ) AS m
    ),
    restocks AS (
        SELECT i.space_id,
               CAST(date_trunc('month', c.changed_at AT TIME ZONE 'UTC') AS date) AS m,
               count(*) AS n
        FROM inventory_item_changes c
        JOIN inventory_items i ON i.user_id = c.user_id AND i.id = c.item_id
        WHERE c.user_id = :uid AND c.quantity_after > c.quantity_before
          AND (c.changed_at AT TIME ZONE 'UTC') >= CAST(:start AS timestamp)
          AND (c.changed_at AT TIME ZONE 'UTC') < CAST(:end AS timestamp)
        GROUP BY 1, 2
    )
    SELECT s.id AS space_id,
           s.name AS space_name,
           to_char(months.m, 'YYYY-MM') AS month,
           COALESCE(restocks.n, 0) AS n
    FROM spaces s
    CROSS JOIN months
    LEFT JOIN restocks ON restocks.space_id = s.id AND restocks.m = months.m
    WHERE s.user_id = :uid
    ORDER BY lower(s.name), s.id, months.m
    """
)


def restocks(
    session: Session, user_id: uuid.UUID, *, months: int, ending: str | None = None
) -> dict:
    last_month = parse_month(ending) if ending else dt.date.today().replace(day=1)
    first = add_months(last_month, -(months - 1))
    window = {
        "uid": str(user_id),
        "start": first,
        "last": last_month,
        "end": add_months(last_month, 1),
    }
    labels = [format_month(add_months(first, i)) for i in range(months)]
    by_space: dict[uuid.UUID, dict] = {}
    for row in session.execute(_RESTOCKS, window):
        series = by_space.setdefault(
            row.space_id, {"space_id": row.space_id, "space_name": row.space_name, "values": []}
        )
        series["values"].append(row.n)
    return {"months": labels, "series": list(by_space.values())}
