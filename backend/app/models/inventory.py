"""Inventory: spaces, items, and the quantity log.

AD-31: nothing in this module imports the ledger, and the ledger imports nothing from it.
The two share ``users`` and the tenancy machinery, and that is all.
"""

import datetime as dt
import decimal
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    and_,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, column_property, mapped_column

from app.models.base import Base, TimestampedMixin


class Space(TimestampedMixin, Base):
    __tablename__ = "spaces"
    __table_args__ = (UniqueConstraint("user_id", "id", name="spaces_user_id_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="inventory_items_user_id_id_key"),
        CheckConstraint("quantity >= 0", name="inventory_items_quantity_non_negative"),
        CheckConstraint(
            "restock_below IS NULL OR restock_below >= 0",
            name="inventory_items_restock_below_non_negative",
        ),
        CheckConstraint("cost IS NULL OR cost >= 0", name="inventory_items_cost_non_negative"),
        ForeignKeyConstraint(
            ["user_id", "space_id"],
            ["spaces.user_id", "spaces.id"],
            name="inventory_items_space_fkey",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    space_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    restock_below: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost: Mapped[decimal.Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    restocked_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # AD-30: the one definition of "needs restocking". A SQL expression loaded with the row
    # and usable in a WHERE clause, so the list filter and every count are the same test.
    # No column stores it, so it cannot be stale.
    needs_restock: Mapped[bool] = column_property(
        and_(restock_below.isnot(None), quantity <= restock_below)
    )


class InventoryItemChange(Base):
    """Append-only. The runtime role has no UPDATE or DELETE on this table."""

    __tablename__ = "inventory_item_changes"
    __table_args__ = (
        CheckConstraint(
            "quantity_before >= 0 AND quantity_after >= 0",
            name="inventory_item_changes_non_negative",
        ),
        ForeignKeyConstraint(
            ["user_id", "item_id"],
            ["inventory_items.user_id", "inventory_items.id"],
            name="inventory_item_changes_item_fkey",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    quantity_before: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_after: Mapped[int] = mapped_column(Integer, nullable=False)
    changed_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
