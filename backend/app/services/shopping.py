"""The shopping list, and the one sanctioned write across the module boundary (Epic 14).

AD-31 keeps the ledger and the inventory independent: neither service imports the other's
models. This module is the declared seam. It imports the two *services*, never their
models, so the coupling lives in one named place instead of leaking into either module —
and it exists because the alternative, restocking as a side effect of recording a grocery
expense, would have to guess which items an "$80 groceries" entry covered.

Nothing here commits (AD-4). The restock and the entry happen in the one request
transaction, so a failure leaves neither.
"""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Invalid
from app.models.inventory import InventoryItem
from app.models.purchase import InventoryPurchase
from app.services import inventory as inventory_service
from app.services import ledger as ledger_service


class ShoppingRow:
    def __init__(self, item: InventoryItem, space_name: str) -> None:
        self.item_id = item.id
        self.name = item.name
        self.space_id = item.space_id
        self.space_name = space_name
        self.quantity = item.quantity
        self.restock_below = item.restock_below
        self.unit_cost = item.cost
        # How many to buy to clear the threshold with one to spare. A threshold of 2 at a
        # quantity of 0 suggests 3: buying exactly to the threshold leaves it still low.
        self.suggested = max(1, (item.restock_below or 0) + 1 - item.quantity)
        # None, not zero, when the cost is unknown: zero is a price (the AD-29 rule).
        self.estimate = None if item.cost is None else item.cost * self.suggested


class ShoppingList:
    def __init__(self, rows: list[ShoppingRow]) -> None:
        self.items = rows
        self.estimate = sum((row.estimate for row in rows if row.estimate is not None), Decimal(0))
        # Stated rather than hidden: the total covers only the rows that have a cost.
        self.without_cost = sum(1 for row in rows if row.estimate is None)


def shopping_list(session: Session, user_id: uuid.UUID) -> ShoppingList:
    """Everything below its threshold, with a suggested quantity and an honest estimate."""
    items = inventory_service.list_items(session, user_id, needs_restock=True)
    spaces = {space.id: space.name for space in inventory_service.list_spaces(session, user_id)}
    return ShoppingList([ShoppingRow(item, spaces.get(item.space_id, "")) for item in items])


def purchase(
    session: Session,
    user_id: uuid.UUID,
    item_id: uuid.UUID,
    *,
    quantity: int,
    amount: Decimal | None,
    occurred_on: dt.date,
    category_id: uuid.UUID | None,
    category_name: str | None,
) -> tuple[InventoryItem, InventoryPurchase]:
    """Restock an item and, when it cost something, record the expense — in one action.

    The entry is optional: restocking something that was free, or that someone else paid
    for, is still a restock. When there is an amount there must be a category, because an
    entry without one cannot exist (AD-7).
    """
    if quantity <= 0:
        raise Invalid("quantity must be greater than zero", "quantity_not_positive")
    if amount is not None and category_id is None and category_name is None:
        raise Invalid("an amount needs a category to file it under", "purchase_category_missing")
    if amount is None and (category_id is not None or category_name is not None):
        raise Invalid("a category without an amount records nothing", "purchase_amount_missing")

    item = inventory_service.get_item(session, user_id, item_id)

    # The entry first, so the common mistake — a category that is not an expense one — is
    # refused before anything is written. Correctness does not depend on this order: the
    # rollback is what guarantees the pair, and a test proves that with the order reversed.
    entry = None
    if amount is not None:
        entry = ledger_service.create_entry(
            session,
            user_id,
            kind=ledger_service.EntryKind.expense,
            amount=amount,
            occurred_on=occurred_on,
            note=f"{item.name} ×{quantity}",
            category_id=category_id,
            category_name=category_name,
        )

    updated = inventory_service.update_item(
        session, user_id, item_id, fields={"quantity": item.quantity + quantity}
    )
    record = InventoryPurchase(
        user_id=user_id,
        item_id=item_id,
        entry_id=entry.id if entry is not None else None,
        quantity=quantity,
        purchased_on=occurred_on,
    )
    session.add(record)
    session.flush()
    return updated, record


def purchases(session: Session, user_id: uuid.UUID, item_id: uuid.UUID) -> list[InventoryPurchase]:
    inventory_service.get_item(session, user_id, item_id)  # 404 before anything else
    rows = session.execute(
        select(InventoryPurchase)
        .where(InventoryPurchase.user_id == user_id, InventoryPurchase.item_id == item_id)
        .order_by(InventoryPurchase.purchased_on.desc(), InventoryPurchase.created_at.desc())
    ).scalars()
    return list(rows)
