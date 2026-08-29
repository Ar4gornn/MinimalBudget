import datetime as dt
import decimal
import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Date,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Numeric,
    String,
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
