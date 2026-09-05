"""Categories and entries.

Nothing here commits (AD-4). Every query is additionally filtered by ``user_id`` as
defence in depth — row-level security is the authority, and these filters are the belt to
its braces.
"""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import Select, delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import search
from app.core.errors import Conflict, Invalid, NotFound
from app.core.months import month_range
from app.models.ledger import Category, Entry, EntryKind, Vendor

# ---------------------------------------------------------------- categories


def list_categories(
    session: Session, user_id: uuid.UUID, *, kind: EntryKind | None = None
) -> list[Category]:
    query = select(Category).where(Category.user_id == user_id)
    if kind is not None:
        query = query.where(Category.kind == kind)
    # AD-20: a total order, so identical requests come back in identical order.
    query = query.order_by(func.lower(Category.name), Category.id)
    return list(session.execute(query).scalars())


def get_or_create_category(
    session: Session, user_id: uuid.UUID, *, kind: EntryKind, name: str
) -> Category:
    """AD-12: idempotent by (user, kind, lower(name)).

    ``ON CONFLICT DO NOTHING`` rather than "look, then insert": two concurrent requests for
    the same new name must produce one category, and a check-then-act would produce two.
    """
    inserted = session.execute(
        text(
            """
            INSERT INTO categories (user_id, kind, name)
            VALUES (:uid, CAST(:kind AS entry_kind), :name)
            ON CONFLICT (user_id, kind, lower(name)) DO NOTHING
            RETURNING id
            """
        ),
        {"uid": str(user_id), "kind": kind.value, "name": name},
    ).scalar_one_or_none()

    if inserted is None:
        # Someone else won the race, or it already existed. Either way, return theirs.
        existing = session.execute(
            select(Category).where(
                Category.user_id == user_id,
                Category.kind == kind,
                func.lower(Category.name) == name.lower(),
            )
        ).scalar_one_or_none()
        if existing is None:  # pragma: no cover — would mean the unique index disagrees
            raise Conflict("category could not be created or found")
        return existing

    session.expire_all()
    category = session.get(Category, inserted)
    if category is None:  # pragma: no cover
        raise Conflict("category was inserted but is not readable")
    return category


def resolve_category(
    session: Session, user_id: uuid.UUID, *, category_id: uuid.UUID, kind: EntryKind
) -> Category:
    """AD-8: prove the category is the caller's, and of the right kind, before writing."""
    category = session.execute(
        select(Category).where(
            Category.user_id == user_id, Category.id == category_id, Category.kind == kind
        )
    ).scalar_one_or_none()
    if category is None:
        # Deliberately indistinguishable from "belongs to someone else".
        raise NotFound(f"No {kind.value} category with that id")
    return category


def delete_category(session: Session, user_id: uuid.UUID, category_id: uuid.UUID) -> None:
    try:
        result = session.execute(
            delete(Category).where(Category.user_id == user_id, Category.id == category_id)
        )
    except IntegrityError as exc:
        # AD-21: the entries foreign key is RESTRICT, so this is the database refusing to
        # destroy a year of records because someone tidied a label. The violation surfaces
        # on the statement itself, not at flush — a Core DELETE is not deferred.
        session.rollback()
        raise Conflict("That category still has entries") from exc
    if result.rowcount == 0:
        raise NotFound("No category with that id")


# ------------------------------------------------------------------- vendors


def list_vendors(session: Session, user_id: uuid.UUID) -> list[Vendor]:
    query = (
        select(Vendor).where(Vendor.user_id == user_id).order_by(func.lower(Vendor.name), Vendor.id)
    )
    return list(session.execute(query).scalars())


def get_or_create_vendor(session: Session, user_id: uuid.UUID, *, name: str) -> Vendor:
    """AD-12, the same idempotent shape as categories: insert-or-return, never check-then-act."""
    inserted = session.execute(
        text(
            """
            INSERT INTO vendors (user_id, name)
            VALUES (:uid, :name)
            ON CONFLICT (user_id, lower(name)) DO NOTHING
            RETURNING id
            """
        ),
        {"uid": str(user_id), "name": name},
    ).scalar_one_or_none()

    if inserted is None:
        existing = session.execute(
            select(Vendor).where(Vendor.user_id == user_id, func.lower(Vendor.name) == name.lower())
        ).scalar_one_or_none()
        if existing is None:  # pragma: no cover — would mean the unique index disagrees
            raise Conflict("vendor could not be created or found")
        return existing

    session.expire_all()
    vendor = session.get(Vendor, inserted)
    if vendor is None:  # pragma: no cover
        raise Conflict("vendor was inserted but is not readable")
    return vendor


def resolve_vendor(session: Session, user_id: uuid.UUID, vendor_id: uuid.UUID) -> Vendor:
    vendor = session.execute(
        select(Vendor).where(Vendor.user_id == user_id, Vendor.id == vendor_id)
    ).scalar_one_or_none()
    if vendor is None:
        raise NotFound("No vendor with that id")
    return vendor


def delete_vendor(session: Session, user_id: uuid.UUID, vendor_id: uuid.UUID) -> None:
    try:
        result = session.execute(
            delete(Vendor).where(Vendor.user_id == user_id, Vendor.id == vendor_id)
        )
    except IntegrityError as exc:
        # AD-21: RESTRICT. Deleting a vendor would erase which shop a year of entries
        # came from, so the database refuses while any still reference it.
        session.rollback()
        raise Conflict("That vendor is still used by some entries") from exc
    if result.rowcount == 0:
        raise NotFound("No vendor with that id")


def _resolve_vendor_field(
    session: Session,
    user_id: uuid.UUID,
    *,
    vendor_id: uuid.UUID | None,
    vendor_name: str | None,
) -> uuid.UUID | None:
    """At most one of the two; a name creates the vendor, as a category name does."""
    if vendor_name is not None:
        return get_or_create_vendor(session, user_id, name=vendor_name).id
    if vendor_id is not None:
        return resolve_vendor(session, user_id, vendor_id).id
    return None


# ------------------------------------------------------------------- entries


def _entry_query(user_id: uuid.UUID) -> Select:
    return select(Entry).where(Entry.user_id == user_id)


def list_entries(
    session: Session,
    user_id: uuid.UUID,
    *,
    kind: EntryKind | None = None,
    month: str | None = None,
    category_id: uuid.UUID | None = None,
    q: str | None = None,
) -> list[Entry]:
    query = _entry_query(user_id)
    if q:
        # Matches the note or the category's name, so "fuel" finds both the category and a
        # note that mentions it. Case-insensitive; the metacharacters are escaped.
        like = search.pattern(q)
        query = query.where(
            Entry.note.ilike(like, escape=search.ESCAPE)
            | Entry.category_id.in_(
                select(Category.id).where(
                    Category.user_id == user_id,
                    Category.name.ilike(like, escape=search.ESCAPE),
                )
            )
        )
    if kind is not None:
        query = query.where(Entry.kind == kind)
    if category_id is not None:
        query = query.where(Entry.category_id == category_id)
    if month is not None:
        # AD-10: half-open, never BETWEEN.
        start, end = month_range(month)
        query = query.where(Entry.occurred_on >= start, Entry.occurred_on < end)
    query = query.order_by(Entry.occurred_on.desc(), Entry.created_at.desc(), Entry.id)
    return list(session.execute(query).scalars())


def get_entry(session: Session, user_id: uuid.UUID, entry_id: uuid.UUID) -> Entry:
    entry = session.execute(_entry_query(user_id).where(Entry.id == entry_id)).scalar_one_or_none()
    if entry is None:
        raise NotFound("No entry with that id")
    return entry


def create_entry(
    session: Session,
    user_id: uuid.UUID,
    *,
    kind: EntryKind,
    amount: Decimal,
    occurred_on: dt.date,
    note: str | None,
    category_id: uuid.UUID | None,
    category_name: str | None,
    quantity: Decimal | None = None,
    unit: str | None = None,
    vendor_id: uuid.UUID | None = None,
    vendor_name: str | None = None,
) -> Entry:
    if category_name is not None:
        category = get_or_create_category(session, user_id, kind=kind, name=category_name)
    else:
        assert category_id is not None  # guaranteed by the schema's exactly-one rule
        category = resolve_category(session, user_id, category_id=category_id, kind=kind)

    entry = Entry(
        user_id=user_id,
        kind=kind,
        category_id=category.id,
        amount=amount,
        occurred_on=occurred_on,
        note=note,
        quantity=quantity,
        unit=unit,
        vendor_id=_resolve_vendor_field(
            session, user_id, vendor_id=vendor_id, vendor_name=vendor_name
        ),
    )
    session.add(entry)
    session.flush()
    return entry


def update_entry(
    session: Session,
    user_id: uuid.UUID,
    entry_id: uuid.UUID,
    *,
    amount: Decimal | None,
    occurred_on: dt.date | None,
    note: str | None,
    note_given: bool,
    category_id: uuid.UUID | None,
    quantity: Decimal | None = None,
    unit: str | None = None,
    quantity_given: bool = False,
    vendor_id: uuid.UUID | None = None,
    vendor_name: str | None = None,
    vendor_given: bool = False,
) -> Entry:
    entry = get_entry(session, user_id, entry_id)

    if category_id is not None:
        # The new category has to be the caller's and of the entry's kind (AD-7, AD-18).
        resolve_category(session, user_id, category_id=category_id, kind=entry.kind)
        entry.category_id = category_id
    if amount is not None:
        entry.amount = amount
    if occurred_on is not None:
        entry.occurred_on = occurred_on
    if note_given:
        entry.note = note
    if quantity_given:
        # The schema already refused a lone quantity or a lone unit. What it could not
        # know is the entry's kind (AD-29: only an expense carries a quantity).
        if quantity is not None and entry.kind is not EntryKind.expense:
            raise Invalid("only an expense can carry a quantity")
        entry.quantity = quantity
        entry.unit = unit
    if vendor_given:
        entry.vendor_id = _resolve_vendor_field(
            session, user_id, vendor_id=vendor_id, vendor_name=vendor_name
        )

    session.flush()
    return entry


def delete_entry(session: Session, user_id: uuid.UUID, entry_id: uuid.UUID) -> None:
    result = session.execute(delete(Entry).where(Entry.user_id == user_id, Entry.id == entry_id))
    if result.rowcount == 0:
        raise NotFound("No entry with that id")
