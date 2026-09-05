import datetime as dt
import uuid

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class InventoryPurchase(Base):
    """One restock that was paid for: the item, how many, and the entry it cost.

    A row rather than a column on the item, because an item is bought many times and a
    single pointer would be a "last purchase" that is stale after the second shop.
    """

    __tablename__ = "inventory_purchases"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="inventory_purchases_quantity_positive"),
        ForeignKeyConstraint(
            ["user_id", "item_id"],
            ["inventory_items.user_id", "inventory_items.id"],
            name="inventory_purchases_item_fkey",
            ondelete="CASCADE",
        ),
        # The entry foreign key uses ON DELETE SET NULL (entry_id), which SQLAlchemy cannot
        # express; it is declared in migration 0011 only.
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    entry_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    purchased_on: Mapped[dt.date] = mapped_column(Date, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
