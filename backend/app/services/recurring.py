"""Recurring templates: cadence arithmetic, materialisation, and the decisions (Epic 13).

Nothing here commits (AD-4). Materialisation is **pull-based**: it runs when the pending
list is read, advances each template's ``next_due`` up to today, and inserts one occurrence
per due date. The unique key on (template_id, due_on) makes it idempotent, so it can run on
every dashboard load without a scheduler and without ever proposing the same date twice
(AD-33). Only a template that opted in (``auto``) has its entries created without a person
confirming them.
"""

import calendar
import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from app.core.errors import Conflict, Invalid, NotFound
from app.models.ledger import Category, Entry, EntryKind
from app.models.recurring import Cadence, OccurrenceStatus, RecurringOccurrence, RecurringTemplate
from app.services import ledger

# A template that has not been looked at for a very long time still terminates.
_MAX_MATERIALISE = 400

# --------------------------------------------------------------- cadence


def _clamp_day(year: int, month: int, day: int) -> dt.date:
    """The 31st of a 30-day month is its 30th; Feb 29 in a common year is Feb 28."""
    return dt.date(year, month, min(day, calendar.monthrange(year, month)[1]))


def advance(cadence: str, anchor: dt.date, current: dt.date) -> dt.date:
    """The due date after ``current`` for a template anchored on ``anchor``.

    The anchor carries the intended day (and month, for yearly), so a monthly template
    started on the 31st keeps aiming at the 31st rather than drifting to the 28th forever
    after one February.
    """
    if cadence == Cadence.weekly:
        return current + dt.timedelta(days=7)
    if cadence == Cadence.monthly:
        # Zero-based month index, so December rolls into January of the next year without a
        # special case.
        index = current.year * 12 + (current.month - 1) + 1
        return _clamp_day(index // 12, index % 12 + 1, anchor.day)
    if cadence == Cadence.yearly:
        return _clamp_day(current.year + 1, anchor.month, anchor.day)
    raise Invalid(f"unknown cadence {cadence!r}")  # pragma: no cover — CHECK and enum forbid


# -------------------------------------------------------------- templates


def list_templates(session: Session, user_id: uuid.UUID) -> list[RecurringTemplate]:
    rows = session.execute(
        select(RecurringTemplate)
        .where(RecurringTemplate.user_id == user_id)
        .order_by(RecurringTemplate.next_due, RecurringTemplate.created_at, RecurringTemplate.id)
    ).scalars()
    return list(rows)


def get_template(session: Session, user_id: uuid.UUID, template_id: uuid.UUID) -> RecurringTemplate:
    row = session.execute(
        select(RecurringTemplate).where(
            RecurringTemplate.user_id == user_id, RecurringTemplate.id == template_id
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFound("No recurring template with that id")
    return row


def create_template(
    session: Session,
    user_id: uuid.UUID,
    *,
    kind: EntryKind,
    amount: Decimal,
    note: str | None,
    cadence: str,
    start_on: dt.date,
    end_on: dt.date | None,
    auto: bool,
    category_id: uuid.UUID | None,
    category_name: str | None,
) -> RecurringTemplate:
    if category_name is not None:
        category = ledger.get_or_create_category(session, user_id, kind=kind, name=category_name)
    else:
        assert category_id is not None
        category = ledger.resolve_category(session, user_id, category_id=category_id, kind=kind)
    if end_on is not None and end_on < start_on:
        raise Invalid("end_on must not be before start_on")

    template = RecurringTemplate(
        user_id=user_id,
        kind=kind,
        category_id=category.id,
        amount=amount,
        note=note,
        cadence=cadence,
        start_on=start_on,
        end_on=end_on,
        auto=auto,
        next_due=start_on,
    )
    session.add(template)
    session.flush()
    return template


def update_template(
    session: Session, user_id: uuid.UUID, template_id: uuid.UUID, fields: dict
) -> RecurringTemplate:
    template = get_template(session, user_id, template_id)
    if "category_id" in fields and fields["category_id"] is not None:
        ledger.resolve_category(
            session, user_id, category_id=fields["category_id"], kind=template.kind
        )
    for key in ("amount", "note", "auto", "paused", "end_on", "category_id"):
        if key in fields:
            setattr(template, key, fields[key])
    if template.end_on is not None and template.end_on < template.start_on:
        raise Invalid("end_on must not be before start_on")
    template.updated_at = func.now()
    session.flush()
    session.refresh(template)
    return template


def delete_template(session: Session, user_id: uuid.UUID, template_id: uuid.UUID) -> None:
    template = get_template(session, user_id, template_id)
    # Occurrences cascade; entries already created from them are independent records and stay.
    session.delete(template)
    session.flush()


# ---------------------------------------------------------- materialise


def _create_entry_for(
    session: Session,
    user_id: uuid.UUID,
    template: RecurringTemplate,
    due_on: dt.date,
    amount: Decimal,
) -> Entry:
    return ledger.create_entry(
        session,
        user_id,
        kind=template.kind,
        amount=amount,
        occurred_on=due_on,
        note=template.note,
        category_id=template.category_id,
        category_name=None,
    )


def materialise(session: Session, user_id: uuid.UUID, *, today: dt.date | None = None) -> int:
    """Advance every active template to today. Returns how many occurrences were added.

    Idempotent by construction: the (template_id, due_on) key refuses a duplicate, and
    ``next_due`` only ever moves forward.
    """
    today = today or dt.date.today()
    added = 0
    for template in list_templates(session, user_id):
        if template.paused:
            continue
        steps = 0
        while template.next_due <= today and steps < _MAX_MATERIALISE:
            steps += 1
            due = template.next_due
            if template.end_on is not None and due > template.end_on:
                break
            exists = session.execute(
                text(
                    "SELECT 1 FROM recurring_occurrences WHERE template_id = :tid AND due_on = :d"
                ),
                {"tid": str(template.id), "d": due},
            ).first()
            if exists is None:
                occurrence = RecurringOccurrence(
                    user_id=user_id, template_id=template.id, due_on=due
                )
                if template.auto:
                    entry = _create_entry_for(session, user_id, template, due, template.amount)
                    occurrence.status = OccurrenceStatus.created.value
                    occurrence.entry_id = entry.id
                    occurrence.decided_at = func.now()
                session.add(occurrence)
                added += 1
            template.next_due = advance(template.cadence, template.start_on, due)
        session.flush()
    return added


# ----------------------------------------------------------- occurrences


class PendingRow:
    def __init__(self, occurrence: RecurringOccurrence, template: RecurringTemplate, category: str):
        self.id = occurrence.id
        self.template_id = template.id
        self.due_on = occurrence.due_on
        self.kind = template.kind
        self.category_id = template.category_id
        self.category_name = category
        self.amount = template.amount
        self.note = template.note
        self.cadence = template.cadence


def list_pending(session: Session, user_id: uuid.UUID) -> list[PendingRow]:
    rows = session.execute(
        select(RecurringOccurrence, RecurringTemplate, Category.name)
        .join(RecurringTemplate, RecurringTemplate.id == RecurringOccurrence.template_id)
        .join(Category, Category.id == RecurringTemplate.category_id)
        .where(
            RecurringOccurrence.user_id == user_id,
            RecurringOccurrence.status == OccurrenceStatus.pending.value,
        )
        .order_by(RecurringOccurrence.due_on, func.lower(Category.name), RecurringOccurrence.id)
    ).all()
    return [PendingRow(o, t, name) for o, t, name in rows]


def _pending_occurrence(
    session: Session, user_id: uuid.UUID, occurrence_id: uuid.UUID
) -> tuple[RecurringOccurrence, RecurringTemplate]:
    row = session.execute(
        select(RecurringOccurrence, RecurringTemplate)
        .join(RecurringTemplate, RecurringTemplate.id == RecurringOccurrence.template_id)
        .where(RecurringOccurrence.user_id == user_id, RecurringOccurrence.id == occurrence_id)
    ).first()
    if row is None:
        raise NotFound("No proposed entry with that id")
    occurrence, template = row
    if occurrence.status != OccurrenceStatus.pending.value:
        raise Conflict("That proposal was already decided")
    return occurrence, template


def confirm(
    session: Session, user_id: uuid.UUID, occurrence_id: uuid.UUID, *, amount: Decimal | None
) -> Entry:
    """Turn a proposal into an entry, optionally with a corrected amount.

    The UPDATE is guarded on status so two confirmations of the same proposal cannot both
    create an entry.
    """
    occurrence, template = _pending_occurrence(session, user_id, occurrence_id)
    entry = _create_entry_for(
        session, user_id, template, occurrence.due_on, amount or template.amount
    )
    claimed = session.execute(
        update(RecurringOccurrence)
        .where(
            RecurringOccurrence.id == occurrence.id,
            RecurringOccurrence.status == OccurrenceStatus.pending.value,
        )
        .values(status=OccurrenceStatus.created.value, entry_id=entry.id, decided_at=func.now())
    ).rowcount
    if claimed != 1:  # pragma: no cover — the read above holds the row in this transaction
        raise Conflict("That proposal was already decided")
    session.flush()
    return entry


def skip(session: Session, user_id: uuid.UUID, occurrence_id: uuid.UUID) -> None:
    occurrence, _ = _pending_occurrence(session, user_id, occurrence_id)
    occurrence.status = OccurrenceStatus.skipped.value
    occurrence.decided_at = func.now()
    session.flush()
