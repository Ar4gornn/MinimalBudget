"""Savings types, contributions, budgets and targets.

Nothing here commits (AD-4). Budgets and targets are written with an upsert, because AD-11
makes their key the uniqueness rule: setting one twice must update, never duplicate.

Epic 34 (AD-50) makes a savings type a pot: contributions are deposits or withdrawals, and
the pot's balance — deposits minus withdrawals, all time, whatever their dates — may never
go below zero. A CHECK cannot see a sum over rows, so every write that could lower a
balance locks the type rows it touches, writes, and then re-reads the sums; a negative one
raises, and the request's transaction rolls back with it. The lock is what makes two
concurrent withdrawals queue rather than both pass the same check.
"""

import datetime as dt
import uuid
from decimal import ROUND_UP, Decimal

from sqlalchemy import delete, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import Conflict, Invalid, NotFound
from app.core.months import DEFAULT_START_DAY, month_of, month_range, parse_month
from app.models.ledger import Budget, Category, EntryKind
from app.models.savings import (
    DEPOSIT,
    SavingsContribution,
    SavingsSkip,
    SavingsTarget,
    SavingsType,
)

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
            raise Conflict("savings type could not be created or found", "savings_type_unwritable")
        return existing

    session.expire_all()
    created = session.get(SavingsType, inserted)
    if created is None:  # pragma: no cover
        raise Conflict("savings type was inserted but is not readable", "savings_type_unreadable")
    return created


def require_type(session: Session, user_id: uuid.UUID, type_id: uuid.UUID) -> SavingsType:
    """AD-8: prove ownership before writing anything that references it."""
    found = session.execute(
        select(SavingsType).where(SavingsType.user_id == user_id, SavingsType.id == type_id)
    ).scalar_one_or_none()
    if found is None:
        raise NotFound("No savings type with that id")
    return found


def update_type(
    session: Session,
    user_id: uuid.UUID,
    type_id: uuid.UUID,
    *,
    fields: dict[str, object],
) -> SavingsType:
    """Rename, or set/clear the goal. ``fields`` holds only what the request carried."""
    found = require_type(session, user_id, type_id)
    for name, value in fields.items():
        setattr(found, name, value)
    if found.goal_date is not None and found.goal_amount is None:
        # The CHECK would refuse it too, as a 500; this says why, as a 422.
        raise Invalid("A goal date needs a goal amount", "savings_goal_date_needs_amount")
    try:
        with session.begin_nested():
            session.flush()
    except IntegrityError as exc:
        if getattr(exc.orig, "sqlstate", None) == "23505":
            raise Conflict(
                "Another savings type already has that name", "savings_type_name_taken"
            ) from exc
        raise
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
        raise Conflict("That savings type still has contributions", "savings_type_in_use") from exc
    if result.rowcount == 0:
        raise NotFound("No savings type with that id")


# ------------------------------------------------------------- contributions


def list_contributions(
    session: Session,
    user_id: uuid.UUID,
    *,
    month: str | None = None,
    savings_type_id: uuid.UUID | None = None,
    start_day: int = DEFAULT_START_DAY,
) -> list[SavingsContribution]:
    query = select(SavingsContribution).where(SavingsContribution.user_id == user_id)
    if savings_type_id is not None:
        query = query.where(SavingsContribution.savings_type_id == savings_type_id)
    if month is not None:
        start, end = month_range(month, start_day)
        query = query.where(
            SavingsContribution.occurred_on >= start, SavingsContribution.occurred_on < end
        )
    query = query.order_by(
        SavingsContribution.occurred_on.desc(),
        SavingsContribution.created_at.desc(),
        SavingsContribution.id,
    )
    return list(session.execute(query).scalars())


# Every sum over contributions below signs the amount by its kind (AD-50), written out
# literally in each query rather than interpolated, so no SQL is built from a string.


def _lock_types(session: Session, user_id: uuid.UUID, type_ids: set[uuid.UUID]) -> None:
    # Sorted, so two requests touching the same two pots take the locks in the same order
    # and cannot deadlock.
    session.execute(
        select(SavingsType.id)
        .where(SavingsType.user_id == user_id, SavingsType.id.in_(sorted(type_ids)))
        .order_by(SavingsType.id)
        .with_for_update()
    ).all()


def _refuse_negative(session: Session, user_id: uuid.UUID, type_ids: set[uuid.UUID]) -> None:
    overdrawn = session.execute(
        text(
            """
            SELECT c.savings_type_id
            FROM savings_contributions c
            WHERE c.user_id = :uid AND c.savings_type_id = ANY(:ids)
            GROUP BY c.savings_type_id
            HAVING SUM(CASE WHEN c.kind = 'withdrawal' THEN -c.amount ELSE c.amount END) < 0
            """
        ),
        {"uid": user_id, "ids": list(type_ids)},
    ).first()
    if overdrawn is not None:
        raise Conflict(
            "That would take more out of the pot than there is in it",
            "savings_balance_negative",
        )


def create_contribution(
    session: Session,
    user_id: uuid.UUID,
    *,
    savings_type_id: uuid.UUID,
    amount: Decimal,
    occurred_on: dt.date,
    note: str | None,
    kind: str = DEPOSIT,
) -> SavingsContribution:
    require_type(session, user_id, savings_type_id)
    if kind != DEPOSIT:
        _lock_types(session, user_id, {savings_type_id})
    contribution = SavingsContribution(
        user_id=user_id,
        savings_type_id=savings_type_id,
        kind=kind,
        amount=amount,
        occurred_on=occurred_on,
        note=note,
    )
    session.add(contribution)
    session.flush()
    if kind != DEPOSIT:
        _refuse_negative(session, user_id, {savings_type_id})
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
    kind: str | None = None,
) -> SavingsContribution:
    contribution = _get_contribution(session, user_id, contribution_id)
    touched = {contribution.savings_type_id}
    if savings_type_id is not None:
        require_type(session, user_id, savings_type_id)
        touched.add(savings_type_id)
    # Any change can lower a balance: less deposited, a deposit turned withdrawal, or a
    # deposit moved to another pot. Lock every pot involved before writing.
    _lock_types(session, user_id, touched)
    if savings_type_id is not None:
        contribution.savings_type_id = savings_type_id
    if kind is not None:
        contribution.kind = kind
    if amount is not None:
        contribution.amount = amount
    if occurred_on is not None:
        contribution.occurred_on = occurred_on
    if note_given:
        contribution.note = note
    session.flush()
    _refuse_negative(session, user_id, touched)
    return contribution


def delete_contribution(
    session: Session, user_id: uuid.UUID, contribution_id: uuid.UUID
) -> None:
    # Deleting a deposit lowers the balance as surely as a withdrawal does.
    type_id = _get_contribution(session, user_id, contribution_id).savings_type_id
    _lock_types(session, user_id, {type_id})
    session.execute(
        delete(SavingsContribution).where(
            SavingsContribution.user_id == user_id, SavingsContribution.id == contribution_id
        )
    )
    _refuse_negative(session, user_id, {type_id})


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


# ---------------------------------------------------------- pots (Epic 34, AD-50)

_OVERVIEW = text(
    """
    SELECT s.id              AS savings_type_id,
           s.name            AS name,
           s.goal_amount     AS goal_amount,
           s.goal_date       AS goal_date,
           t.monthly_amount  AS target,
           COALESCE(SUM(CASE WHEN c.kind = 'withdrawal' THEN -c.amount ELSE c.amount END), 0)
               AS balance,
           COALESCE(SUM(CASE WHEN c.kind = 'withdrawal' THEN -c.amount ELSE c.amount END) FILTER (
               WHERE c.occurred_on >= :start AND c.occurred_on < :end
           ), 0) AS saved,
           EXISTS (
               SELECT 1 FROM savings_skips k
               WHERE k.user_id = s.user_id AND k.savings_type_id = s.id AND k.month = :month
           ) AS skipped
    FROM savings_types s
    LEFT JOIN savings_targets t
           ON t.user_id = s.user_id AND t.savings_type_id = s.id
    LEFT JOIN savings_contributions c
           ON c.user_id = s.user_id AND c.savings_type_id = s.id
    WHERE s.user_id = :uid
    GROUP BY s.id, s.name, s.goal_amount, s.goal_date, t.monthly_amount
    ORDER BY lower(s.name), s.id
    """
)

_CENT = Decimal("0.01")


def _months_between(first: str, last: str) -> int:
    """How many labelled months from ``first`` through ``last``, both included."""
    a, b = parse_month(first), parse_month(last)
    return (b.year * 12 + b.month) - (a.year * 12 + a.month) + 1


def due_amount(target: Decimal | None, saved: Decimal, skipped: bool) -> Decimal | None:
    """What is left of the month's target.

    A withdrawal in the month does not raise the amount due above the target: the proposal
    is "put this month's amount aside", not "repay what you took out" — the balance already
    shows that. So a negative month counts as nothing saved yet.
    """
    if target is None or target <= 0 or skipped:
        return None
    left = target - max(saved, Decimal(0))
    return left if left > 0 else None


def needed_per_month(
    goal_amount: Decimal | None,
    goal_date: dt.date | None,
    balance: Decimal,
    current_month: str,
    start_day: int,
) -> Decimal | None:
    """Per budget month, the current one included, to reach the goal by its date.

    Rounded **up** to the cent: rounding down would promise a goal the plan then misses by
    a cent. A goal date already behind the current month leaves one month — now.
    """
    if goal_amount is None or goal_date is None or balance >= goal_amount:
        return None
    months = max(1, _months_between(current_month, month_of(goal_date, start_day)))
    return ((goal_amount - balance) / months).quantize(_CENT, rounding=ROUND_UP)


def overview(
    session: Session,
    user_id: uuid.UUID,
    *,
    month: str | None,
    start_day: int = DEFAULT_START_DAY,
    today: dt.date | None = None,
) -> dict:
    current = month_of(today or dt.date.today(), start_day)
    label = month.strip() if month else current
    start, end = month_range(label, start_day)
    rows = session.execute(
        _OVERVIEW, {"uid": user_id, "start": start, "end": end, "month": label}
    ).mappings()
    pots = [
        {
            **row,
            "due": due_amount(row["target"], row["saved"], row["skipped"]),
            "needed_per_month": needed_per_month(
                row["goal_amount"], row["goal_date"], row["balance"], current, start_day
            ),
        }
        for row in rows
    ]
    return {"month": label, "start": start, "end": end, "current_month": current, "pots": pots}


def skip_month(session: Session, user_id: uuid.UUID, type_id: uuid.UUID, month: str) -> None:
    label = month.strip()
    parse_month(label)
    require_type(session, user_id, type_id)
    session.execute(
        pg_insert(SavingsSkip)
        .values(user_id=user_id, savings_type_id=type_id, month=label)
        .on_conflict_do_nothing(constraint="savings_skips_pkey")
    )


def unskip_month(session: Session, user_id: uuid.UUID, type_id: uuid.UUID, month: str) -> None:
    label = month.strip()
    parse_month(label)
    require_type(session, user_id, type_id)
    session.execute(
        delete(SavingsSkip).where(
            SavingsSkip.user_id == user_id,
            SavingsSkip.savings_type_id == type_id,
            SavingsSkip.month == label,
        )
    )
