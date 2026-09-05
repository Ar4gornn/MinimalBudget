"""purchases: the one link between the inventory and the ledger

Epic 14. Ticking an item off the shopping list restocks it *and* records what it cost, in
one confirmed action. That is the only place the two modules touch, and AD-31 requires it
to be exactly this shape: one explicit endpoint, one transaction, never a side effect of an
ordinary create.

A purchase is a row of its own rather than an ``entry_id`` column on the item, because an
item is bought many times: a single pointer would be a "last purchase" that is stale after
the second shop. The entry is nullable — restocking something that cost nothing, or that
someone else paid for, is still a restock — and ``ON DELETE SET NULL`` on that column keeps
the purchase when the entry is deleted, as with recurring occurrences in 0010.

Revision ID: 0011
Revises: 0010
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect, unprotect

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.create_table(
        "inventory_purchases",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("item_id", uuid_type, nullable=False),
        # Null when the restock cost nothing, or was not recorded as an expense.
        sa.Column("entry_id", uuid_type, nullable=True),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("purchased_on", sa.Date, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("quantity > 0", name="inventory_purchases_quantity_positive"),
        # AD-18: composite, and the purchase goes with the item it is about.
        sa.ForeignKeyConstraint(
            ["user_id", "item_id"],
            ["inventory_items.user_id", "inventory_items.id"],
            name="inventory_purchases_item_fkey",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "inventory_purchases_user_item_idx", "inventory_purchases", ["user_id", "item_id"]
    )
    # The entry is a separate record: deleting it releases the link, it does not erase the
    # fact that the item was restocked.
    op.execute(
        "ALTER TABLE inventory_purchases ADD CONSTRAINT inventory_purchases_entry_fkey "
        "FOREIGN KEY (user_id, entry_id) REFERENCES entries (user_id, id) "
        "ON DELETE SET NULL (entry_id)"
    )
    protect("inventory_purchases")


def downgrade() -> None:
    unprotect("inventory_purchases")
    op.drop_table("inventory_purchases")
