"""CSV export (Epic 16).

Row-level security scopes every query here, exactly as it does everywhere else; these are
ordinary reads through the request's session (AD-4). Rows are yielded one at a time rather
than built into a list, so an export is bounded by the row size and not by the year.

The one thing a CSV writer has to get right beyond commas is **formula injection**. A
spreadsheet treats a cell beginning ``=``, ``+``, ``-``, ``@`` or a control character as a
formula, so a note reading ``=HYPERLINK("http://evil","click")`` becomes a live link when a
family member opens the file. Every field goes through :func:`safe_cell`.
"""

import csv
import datetime as dt
import io
import uuid
from collections.abc import Iterator

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.inventory import InventoryItem, Space
from app.models.ledger import Category, Entry
from app.models.savings import SavingsContribution, SavingsType

# The characters a spreadsheet reads as "this cell is a formula". The control characters are
# in the list because Excel strips leading whitespace before deciding.
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r", "\n")


def safe_cell(value: object) -> str:
    """Render a value so a spreadsheet reads it as text, never as a formula.

    Prefixing with an apostrophe is the documented mitigation: the spreadsheet shows the
    original characters and evaluates nothing. It is applied only to values that would
    otherwise be interpreted, so ordinary text and every number are untouched — a negative
    amount is written by the ``kind`` column, never by a leading minus (AD-6), so no figure
    in these files starts with one.
    """
    if value is None:
        return ""
    text = str(value)
    return f"'{text}" if text.startswith(_FORMULA_START) else text


def _rows_to_csv(header: list[str], rows: Iterator[list[object]]) -> Iterator[str]:
    """Yield a CSV a chunk at a time, so nothing accumulates a year of records in memory."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")  # RFC 4180

    def flush() -> str:
        text = buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)
        return text

    writer.writerow(header)
    yield flush()
    for row in rows:
        writer.writerow([safe_cell(cell) for cell in row])
        yield flush()


def entries_csv(session: Session, user_id: uuid.UUID) -> Iterator[str]:
    query = (
        select(Entry, Category.name)
        .join(Category, Category.id == Entry.category_id)
        .where(Entry.user_id == user_id)
        .order_by(Entry.occurred_on, Entry.created_at, Entry.id)
    )

    def rows() -> Iterator[list[object]]:
        for entry, category in session.execute(query):
            yield [
                entry.occurred_on.isoformat(),
                entry.kind.value,
                category,
                # AD-5: written as the decimal string it is, never through a float.
                f"{entry.amount:.2f}",
                "" if entry.quantity is None else f"{entry.quantity:.3f}",
                entry.unit or "",
                "" if entry.unit_price is None else f"{entry.unit_price:.4f}",
                entry.note or "",
            ]

    return _rows_to_csv(
        ["date", "kind", "category", "amount", "quantity", "unit", "unit_price", "note"], rows()
    )


def savings_csv(session: Session, user_id: uuid.UUID) -> Iterator[str]:
    query = (
        select(SavingsContribution, SavingsType.name)
        .join(SavingsType, SavingsType.id == SavingsContribution.savings_type_id)
        .where(SavingsContribution.user_id == user_id)
        .order_by(
            SavingsContribution.occurred_on,
            SavingsContribution.created_at,
            SavingsContribution.id,
        )
    )

    def rows() -> Iterator[list[object]]:
        for contribution, name in session.execute(query):
            yield [
                contribution.occurred_on.isoformat(),
                name,
                f"{contribution.amount:.2f}",
                contribution.note or "",
            ]

    return _rows_to_csv(["date", "savings_type", "amount", "note"], rows())


def inventory_csv(session: Session, user_id: uuid.UUID) -> Iterator[str]:
    query = (
        select(InventoryItem, Space.name)
        .join(Space, Space.id == InventoryItem.space_id)
        .where(InventoryItem.user_id == user_id)
        .order_by(Space.name, InventoryItem.name, InventoryItem.id)
    )

    def rows() -> Iterator[list[object]]:
        for item, space in session.execute(query):
            yield [
                space,
                item.name,
                item.quantity,
                "" if item.restock_below is None else item.restock_below,
                "" if item.cost is None else f"{item.cost:.2f}",
                "yes" if item.needs_restock else "no",
                item.note or "",
            ]

    return _rows_to_csv(
        ["space", "item", "quantity", "restock_below", "cost", "needs_restock", "note"], rows()
    )


def filename(kind: str, today: dt.date | None = None) -> str:
    """Dated, so two exports do not overwrite each other in a downloads folder."""
    return f"minimalbudget-{kind}-{(today or dt.date.today()).isoformat()}.csv"
