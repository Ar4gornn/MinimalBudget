"""inventory: spaces, items, and the item quantity log

Epic 11. A new module beside the ledger, not inside it (AD-31): nothing here references
entries or categories, and nothing in the ledger references this.

Three tables, all through ``protect()`` and all composite-keyed per AD-18:

* ``spaces`` — Fridge, Garage, House stuff. Reference data, so ``RESTRICT`` from items.
* ``inventory_items`` — one row per thing kept. ``needs_restock`` has no column: it is the
  predicate ``restock_below IS NOT NULL AND quantity <= restock_below``, evaluated on read
  (AD-30), so a restocked item stops nagging the moment its quantity changes and nothing
  can be left set by mistake.
* ``inventory_item_changes`` — an append-only log of quantity changes, which is what the
  per-item chart draws. The runtime role holds ``SELECT, INSERT`` and nothing else on it:
  history cannot be edited from the API by construction. It cascades with its item, being
  an attribute of the item rather than a record in its own right (AD-21).

Revision ID: 0008
Revises: 0007
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect, unprotect

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)
    now = sa.func.now()

    op.create_table(
        "spaces",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
    )
    # AD-12: one space per user and name, compared case-insensitively.
    op.execute("CREATE UNIQUE INDEX spaces_user_name_key ON spaces (user_id, lower(name))")
    # AD-18 target for the items foreign key.
    op.create_unique_constraint("spaces_user_id_id_key", "spaces", ["user_id", "id"])
    op.create_index("spaces_user_id_idx", "spaces", ["user_id"])

    op.create_table(
        "inventory_items",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("space_id", uuid_type, nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("restock_below", sa.Integer, nullable=True),
        sa.Column("cost", sa.Numeric(14, 2), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        # Set whenever the quantity goes up. What the v2 "you buy milk every six days" and
        # date reminders will be computed from; cheaper to record now than to backfill.
        sa.Column("restocked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.CheckConstraint("quantity >= 0", name="inventory_items_quantity_non_negative"),
        sa.CheckConstraint(
            "restock_below IS NULL OR restock_below >= 0",
            name="inventory_items_restock_below_non_negative",
        ),
        sa.CheckConstraint("cost IS NULL OR cost >= 0", name="inventory_items_cost_non_negative"),
        # AD-18: carries user_id, so an item can never sit in another user's space.
        # AD-21: RESTRICT — a space is reference data; deleting one with items is a 409.
        sa.ForeignKeyConstraint(
            ["user_id", "space_id"],
            ["spaces.user_id", "spaces.id"],
            name="inventory_items_space_fkey",
            ondelete="RESTRICT",
        ),
    )
    op.create_unique_constraint(
        "inventory_items_user_id_id_key", "inventory_items", ["user_id", "id"]
    )
    op.create_index("inventory_items_user_space_idx", "inventory_items", ["user_id", "space_id"])

    op.create_table(
        "inventory_item_changes",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("item_id", uuid_type, nullable=False),
        sa.Column("quantity_before", sa.Integer, nullable=False),
        sa.Column("quantity_after", sa.Integer, nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.CheckConstraint(
            "quantity_before >= 0 AND quantity_after >= 0",
            name="inventory_item_changes_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "item_id"],
            ["inventory_items.user_id", "inventory_items.id"],
            name="inventory_item_changes_item_fkey",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "inventory_item_changes_user_item_changed_idx",
        "inventory_item_changes",
        ["user_id", "item_id", "changed_at"],
    )

    protect("spaces")
    protect("inventory_items")
    # Append-only from the API: no UPDATE, no DELETE. The cascade from a deleted item runs
    # under the owner's privileges, so it is unaffected.
    protect("inventory_item_changes", grants="SELECT, INSERT")


def downgrade() -> None:
    unprotect("inventory_item_changes")
    unprotect("inventory_items")
    unprotect("spaces")
    op.drop_table("inventory_item_changes")
    op.drop_table("inventory_items")
    op.drop_table("spaces")
