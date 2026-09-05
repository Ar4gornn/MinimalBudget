"""vendors, and an optional vendor on an entry

Epic 17. The Epic 10 proposal deferred this with a condition: a vendor earns its keep only
once there is a comparison to make — "is Shell dearer than Total?" — which needs a reference
table per AD-12, not free text, or `Shell`, `shell ` and `SHELL` become three vendors and the
comparison is noise.

That comparison is what this migration is for. The vendor is nullable on every entry and
absent from every existing row; nothing about the ledger's arithmetic changes.

Revision ID: 0012
Revises: 0011
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect, unprotect

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.create_table(
        "vendors",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        # AD-18 target.
        sa.UniqueConstraint("user_id", "id", name="vendors_user_id_id_key"),
    )
    # AD-12: one vendor per user and name, compared case-insensitively, original casing kept.
    op.execute("CREATE UNIQUE INDEX vendors_user_name_key ON vendors (user_id, lower(name))")
    protect("vendors")

    op.add_column("entries", sa.Column("vendor_id", uuid_type, nullable=True))
    # AD-18: composite, so an entry can never reference another user's vendor. RESTRICT per
    # AD-21: a vendor with entries is reference data, and deleting it would erase which shop
    # a year of purchases came from.
    op.create_foreign_key(
        "entries_vendor_fkey",
        "entries",
        "vendors",
        ["user_id", "vendor_id"],
        ["user_id", "id"],
        ondelete="RESTRICT",
    )
    # The comparison groups quantified rows by category, vendor and unit inside a window.
    op.execute(
        "CREATE INDEX entries_user_vendor_idx ON entries (user_id, vendor_id, occurred_on) "
        "WHERE vendor_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS entries_user_vendor_idx")
    op.drop_constraint("entries_vendor_fkey", "entries", type_="foreignkey")
    op.drop_column("entries", "vendor_id")
    unprotect("vendors")
    op.drop_table("vendors")
