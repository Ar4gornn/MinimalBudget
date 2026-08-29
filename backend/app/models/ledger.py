import datetime as dt
import decimal
import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Numeric,
    PrimaryKeyConstraint,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedMixin


class EntryKind(enum.StrEnum):
    income = "income"
    expense = "expense"


_kind = Enum(EntryKind, name="entry_kind", values_callable=lambda e: [m.value for m in e])


class Category(TimestampedMixin, Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[EntryKind] = mapped_column(_kind, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)


class Entry(TimestampedMixin, Base):
    __tablename__ = "entries"
    __table_args__ = (
        CheckConstraint("amount > 0", name="entries_amount_positive"),
        # AD-18 + AD-7: the reference carries user_id and kind, so it cannot cross a user
        # boundary or file an expense under an income category.
        ForeignKeyConstraint(
            ["user_id", "category_id", "kind"],
            ["categories.user_id", "categories.id", "categories.kind"],
            name="entries_category_fkey",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[EntryKind] = mapped_column(_kind, nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    amount: Mapped[decimal.Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    occurred_on: Mapped[dt.date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class Budget(Base):
    """AD-11: a standing monthly amount, keyed by the category it caps.

    The primary key *is* the uniqueness rule, so a second budget for the same category
    cannot exist and PUT can only ever update. The ``kind`` column exists so the composite
    foreign key can pin it to an expense category — a budget on income is meaningless, and
    this makes it impossible rather than merely validated.
    """

    __tablename__ = "budgets"
    __table_args__ = (
        PrimaryKeyConstraint("user_id", "category_id", name="budgets_pkey"),
        CheckConstraint("monthly_amount >= 0", name="budgets_amount_non_negative"),
        CheckConstraint("kind = 'expense'", name="budgets_expense_only"),
        ForeignKeyConstraint(
            ["user_id", "category_id", "kind"],
            ["categories.user_id", "categories.id", "categories.kind"],
            name="budgets_category_fkey",
            ondelete="CASCADE",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    kind: Mapped[EntryKind] = mapped_column(_kind, nullable=False, server_default="expense")
    monthly_amount: Mapped[decimal.Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
