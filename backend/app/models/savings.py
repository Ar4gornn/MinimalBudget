import datetime as dt
import decimal
import uuid

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
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


class SavingsType(TimestampedMixin, Base):
    __tablename__ = "savings_types"

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)


class SavingsContribution(TimestampedMixin, Base):
    __tablename__ = "savings_contributions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="savings_contributions_amount_positive"),
        ForeignKeyConstraint(
            ["user_id", "savings_type_id"],
            ["savings_types.user_id", "savings_types.id"],
            name="savings_contributions_type_fkey",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    savings_type_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    amount: Mapped[decimal.Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    occurred_on: Mapped[dt.date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class SavingsTarget(Base):
    """AD-11: a standing monthly amount, keyed by the thing it targets."""

    __tablename__ = "savings_targets"
    __table_args__ = (
        PrimaryKeyConstraint("user_id", "savings_type_id", name="savings_targets_pkey"),
        CheckConstraint("monthly_amount >= 0", name="savings_targets_amount_non_negative"),
        ForeignKeyConstraint(
            ["user_id", "savings_type_id"],
            ["savings_types.user_id", "savings_types.id"],
            name="savings_targets_type_fkey",
            ondelete="CASCADE",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    savings_type_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    monthly_amount: Mapped[decimal.Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# Seeded for every new account at registration (FR-3).
DEFAULT_SAVINGS_TYPES = ("startup", "vacation", "investment")
