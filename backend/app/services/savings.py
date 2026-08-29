"""Savings types, contributions, budgets and targets.

Nothing here commits (AD-4). Budgets and targets are written with an upsert, because AD-11
makes their key the uniqueness rule: setting one twice must update, never duplicate.
"""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import delete, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound
from app.core.months import month_range
from app.models.ledger import Budget, Category, EntryKind
from app.models.savings import SavingsContribution, SavingsTarget, SavingsType

# -------------------------------------------------------------- savings types


def list_types(session: Session, user_id: uuid.UUID) -> list[SavingsType]:
    return list(
        session.execute(
            select(SavingsType)
            .where(SavingsType.user_id == user_id)
            .order_by(func.lower(SavingsType.name), SavingsType.id)
        ).scalars()
    )


def get_or_create_type(session: Session, user_id: uuid.UUID, *, name: str) -> SavingsType:
    inserted = session.execute(
        text(
            """
            INSERT INTO savings_types (user_id, name)
            VALUES (:uid, :name)
            ON CONFLICT (user_id, lower(name)) DO NOTHING
            RETURNING id
            """
        ),
        {"uid": str(user_id), "name": name},
    ).scalar_one_or_none()

    if inserted is None:
        existing = session.execute(
            select(SavingsType).where(
                SavingsType.user_id == user_id, func.lower(SavingsType.name) == name.lower()
            )
        ).scalar_one_or_none()
        if existing is None:  # pragma: no cover
            raise Conflict("savings type could not be created or found")
        return existing

    session.expire_all()
    created = session.get(SavingsType, inserted)
    if created is None:  # pragma: no cover
        raise Conflict("savings type was inserted but is not readable")
    return created


def require_type(session: Session, user_id: uuid.UUID, type_id: uuid.UUID) -> SavingsType:
    """AD-8: prove ownership before writing anything that references it."""
    found = session.execute(
        select(SavingsType).where(SavingsType.user_id == user_id, SavingsType.id == type_id)
    ).scalar_one_or_none()
    if found is None:
        raise NotFound("No savings type with that id")
    return found


def delete_type(session: Session, user_id: uuid.UUID, type_id: uuid.UUID) -> None:
    try:
        result = session.execute(
            delete(SavingsType).where(
                SavingsType.user_id == user_id, SavingsType.id == type_id
            )
        )
    except IntegrityError as exc:
        # AD-21: contributions are RESTRICT, the attached target is CASCADE.
        session.rollback()
        raise Conflict("That savings type still has contributions") from exc
    if result.rowcount == 0:
        raise NotFound("No savings type with that id")


# ------------------------------------------------------------- contributions


def list_contributions(
    session: Session,
    user_id: uuid.UUID,
    *,
    month: str | None = None,
    savings_type_id: uuid.UUID | None = None,
) -> list[SavingsContribution]:
    query = select(SavingsContribution).where(SavingsContribution.user_id == user_id)
    if savings_type_id is not None:
        query = query.where(SavingsContribution.savings_type_id == savings_type_id)
    if month is not None:
        start, end = month_range(month)
        query = query.where(
            SavingsContribution.occurred_on >= start, SavingsContribution.occurred_on < end
        )
    query = query.order_by(
        SavingsContribution.occurred_on.desc(),
        SavingsContribution.created_at.desc(),
        SavingsContribution.id,
    )
    return list(session.execute(query).scalars())


def create_contribution(
    session: Session,
    user_id: uuid.UUID,
    *,
    savings_type_id: uuid.UUID,
    amount: Decimal,
    occurred_on: dt.date,
    note: str | None,
) -> SavingsContribution:
    require_type(session, user_id, savings_type_id)
    contribution = SavingsContribution(
        user_id=user_id,
        savings_type_id=savings_type_id,
        amount=amount,
        occurred_on=occurred_on,
        note=note,
    )
    session.add(contribution)
    session.flush()
    return contribution


def _get_contribution(
    session: Session, user_id: uuid.UUID, contribution_id: uuid.UUID
) -> SavingsContribution:
    found = session.execute(
        select(SavingsContribution).where(
            SavingsContribution.user_id == user_id, SavingsContribution.id == contribution_id
        )
    ).scalar_one_or_none()
    if found is None:
        raise NotFound("No contribution with that id")
    return found


def update_contribution(
    session: Session,
    user_id: uuid.UUID,
    contribution_id: uuid.UUID,
    *,
    savings_type_id: uuid.UUID | None,
    amount: Decimal | None,
    occurred_on: dt.date | None,
    note: str | None,
    note_given: bool,
) -> SavingsContribution:
    contribution = _get_contribution(session, user_id, contribution_id)
    if savings_type_id is not None:
        require_type(session, user_id, savings_type_id)
        contribution.savings_type_id = savings_type_id
    if amount is not None:
        contribution.amount = amount
    if occurred_on is not None:
        contribution.occurred_on = occurred_on
    if note_given:
        contribution.note = note
    session.flush()
    return contribution


def delete_contribution(
    session: Session, user_id: uuid.UUID, contribution_id: uuid.UUID
) -> None:
    result = session.execute(
        delete(SavingsContribution).where(
            SavingsContribution.user_id == user_id, SavingsContribution.id == contribution_id
        )
    )
    if result.rowcount == 0:
        raise NotFound("No contribution with that id")


# --------------------------------------------------------- targets and budgets


def list_targets(session: Session, user_id: uuid.UUID) -> list[SavingsTarget]:
    return list(
        session.execute(
            select(SavingsTarget)
            .where(SavingsTarget.user_id == user_id)
            .order_by(SavingsTarget.savings_type_id)
        ).scalars()
    )


def set_target(
    session: Session, user_id: uuid.UUID, type_id: uuid.UUID, *, monthly_amount: Decimal
) -> SavingsTarget:
    require_type(session, user_id, type_id)
    statement = (
        pg_insert(SavingsTarget)
        .values(user_id=user_id, savings_type_id=type_id, monthly_amount=monthly_amount)
        # AD-11: the key is the uniqueness rule, so the second PUT updates in place.
        .on_conflict_do_update(
            constraint="savings_targets_pkey",
            set_={"monthly_amount": monthly_amount, "updated_at": func.now()},
        )
        .returning(SavingsTarget)
    )
    session.execute(statement)
    session.expire_all()
    return session.execute(
        select(SavingsTarget).where(
            SavingsTarget.user_id == user_id, SavingsTarget.savings_type_id == type_id
        )
    ).scalar_one()


def list_budgets(session: Session, user_id: uuid.UUID) -> list[Budget]:
    return list(
        session.execute(
            select(Budget).where(Budget.user_id == user_id).order_by(Budget.category_id)
        ).scalars()
    )


def set_budget(
    session: Session, user_id: uuid.UUID, category_id: uuid.UUID, *, monthly_amount: Decimal
) -> Budget:
    # AD-8: the write path proves ownership itself rather than assuming success from the
    # absence of an error — and the kind filter is what refuses a budget on income.
    found = session.execute(
        select(Category).where(
            Category.user_id == user_id,
            Category.id == category_id,
            Category.kind == EntryKind.expense,
        )
    ).scalar_one_or_none()
    if found is None:
        raise NotFound("No expense category with that id")

    statement = (
        pg_insert(Budget)
        .values(
            user_id=user_id,
            category_id=category_id,
            kind=EntryKind.expense.value,
            monthly_amount=monthly_amount,
        )
        .on_conflict_do_update(
            constraint="budgets_pkey",
            set_={"monthly_amount": monthly_amount, "updated_at": func.now()},
        )
    )
    session.execute(statement)
    session.expire_all()
    return session.execute(
        select(Budget).where(Budget.user_id == user_id, Budget.category_id == category_id)
    ).scalar_one()
