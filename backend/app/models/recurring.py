import datetime as dt
import decimal
import enum
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.ledger import EntryKind


class Cadence(enum.StrEnum):
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"


class OccurrenceStatus(enum.StrEnum):
    pending = "pending"
    created = "created"
    skipped = "skipped"


_kind = Enum(EntryKind, name="entry_kind", values_callable=lambda e: [m.value for m in e])


class RecurringTemplate(Base):
    __tablename__ = "recurring_templates"
    __table_args__ = (
        CheckConstraint("amount > 0", name="recurring_templates_amount_positive"),
        CheckConstraint(
            "cadence IN ('weekly', 'monthly', 'yearly')", name="recurring_templates_cadence"
        ),
        CheckConstraint("end_on IS NULL OR end_on >= start_on", name="recurring_templates_span"),
        ForeignKeyConstraint(
            ["user_id", "category_id", "kind"],
            ["categories.user_id", "categories.id", "categories.kind"],
            name="recurring_templates_category_fkey",
            ondelete="RESTRICT",
        ),
        UniqueConstraint("user_id", "id", name="recurring_templates_user_id_id_key"),
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
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cadence: Mapped[str] = mapped_column(String(8), nullable=False)
    start_on: Mapped[dt.date] = mapped_column(Date, nullable=False)
    end_on: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    auto: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    paused: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    next_due: Mapped[dt.date] = mapped_column(Date, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class RecurringOccurrence(Base):
    __tablename__ = "recurring_occurrences"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'created', 'skipped')", name="recurring_occurrences_status"
        ),
        CheckConstraint(
            "status = 'created' OR entry_id IS NULL",
            name="recurring_occurrences_entry_only_when_created",
        ),
        UniqueConstraint("template_id", "due_on", name="recurring_occurrences_template_due_key"),
        ForeignKeyConstraint(
            ["user_id", "template_id"],
            ["recurring_templates.user_id", "recurring_templates.id"],
            name="recurring_occurrences_template_fkey",
            ondelete="CASCADE",
        ),
        # The entry FK uses ON DELETE SET NULL (entry_id), which SQLAlchemy cannot express;
        # it is declared in the migration only.
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    template_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    due_on: Mapped[dt.date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(8), nullable=False, server_default="pending")
    entry_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    decided_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
