"""recurring templates and their occurrences

Epic 13. A template says "rent, 1200, on the 1st of every month"; an occurrence is one due
date of one template and what was decided about it — proposed, created as an entry, or
skipped. Occurrences exist so that a skip is a fact the system remembers rather than a
proposal that comes back every day, and so that materialisation is idempotent: the unique
key on (template_id, due_on) means running it twice cannot create a duplicate.

Default is to *propose*: the entry is created only when the person confirms it. A template
may opt in to automatic creation for a genuinely fixed amount like rent. A wrong amount
created silently is worse than one not created at all (decided 2026-08-30).

`entries` gains UNIQUE (user_id, id) so that an occurrence can reference the entry it
became with a composite foreign key per AD-18. Epic 14 needs the same key for purchases.

Revision ID: 0010
Revises: 0009
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect, unprotect

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CADENCES = ("weekly", "monthly", "yearly")
STATUSES = ("pending", "created", "skipped")


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)
    kind = sa.dialects.postgresql.ENUM("income", "expense", name="entry_kind", create_type=False)

    # AD-18 target for anything that points at an entry.
    op.create_unique_constraint("entries_user_id_id_key", "entries", ["user_id", "id"])

    op.create_table(
        "recurring_templates",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("kind", kind, nullable=False),
        sa.Column("category_id", uuid_type, nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        # CHECK rather than enum, as with currency and units: extending it is one ALTER.
        sa.Column("cadence", sa.String(8), nullable=False),
        # The first due date. Its day-of-month / weekday / month are the anchor the cadence
        # repeats; a monthly template anchored on the 31st lands on the last day of shorter
        # months, never spills into the next.
        sa.Column("start_on", sa.Date, nullable=False),
        sa.Column("end_on", sa.Date, nullable=True),
        # Opt-in: the entry is created without asking.
        sa.Column("auto", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("paused", sa.Boolean, nullable=False, server_default=sa.text("false")),
        # Materialisation pointer: the next due date not yet turned into an occurrence.
        sa.Column("next_due", sa.Date, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("amount > 0", name="recurring_templates_amount_positive"),
        sa.CheckConstraint(
            "cadence IN ('weekly', 'monthly', 'yearly')", name="recurring_templates_cadence"
        ),
        sa.CheckConstraint("end_on IS NULL OR end_on >= start_on", name="recurring_templates_span"),
        # AD-18 + AD-7, same constraint as entries: own category, matching kind, RESTRICT.
        sa.ForeignKeyConstraint(
            ["user_id", "category_id", "kind"],
            ["categories.user_id", "categories.id", "categories.kind"],
            name="recurring_templates_category_fkey",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("user_id", "id", name="recurring_templates_user_id_id_key"),
    )
    op.create_index("recurring_templates_user_id_idx", "recurring_templates", ["user_id"])
    protect("recurring_templates")

    op.create_table(
        "recurring_occurrences",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("template_id", uuid_type, nullable=False),
        sa.Column("due_on", sa.Date, nullable=False),
        sa.Column("status", sa.String(8), nullable=False, server_default="pending"),
        sa.Column("entry_id", uuid_type, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'created', 'skipped')", name="recurring_occurrences_status"
        ),
        # Only a created occurrence may point at an entry — but it need not: the entry can
        # be deleted afterwards, and ON DELETE SET NULL below nulls the column while the
        # decision stands. "I decided this" is the durable fact; the entry is a separate
        # record that the person may remove.
        sa.CheckConstraint(
            "status = 'created' OR entry_id IS NULL",
            name="recurring_occurrences_entry_only_when_created",
        ),
        # Idempotent materialisation: one row per due date, however often it runs.
        sa.UniqueConstraint("template_id", "due_on", name="recurring_occurrences_template_due_key"),
        # Occurrences are the template's decision log; they go with it.
        sa.ForeignKeyConstraint(
            ["user_id", "template_id"],
            ["recurring_templates.user_id", "recurring_templates.id"],
            name="recurring_occurrences_template_fkey",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "recurring_occurrences_user_status_idx", "recurring_occurrences", ["user_id", "status"]
    )
    # Composite per AD-18, and SET NULL on the entry column only (Postgres 15+): deleting the
    # entry keeps the record that it once was created, without violating user_id NOT NULL.
    op.execute(
        "ALTER TABLE recurring_occurrences ADD CONSTRAINT recurring_occurrences_entry_fkey "
        "FOREIGN KEY (user_id, entry_id) REFERENCES entries (user_id, id) "
        "ON DELETE SET NULL (entry_id)"
    )
    protect("recurring_occurrences")


def downgrade() -> None:
    unprotect("recurring_occurrences")
    op.drop_table("recurring_occurrences")
    unprotect("recurring_templates")
    op.drop_table("recurring_templates")
    op.drop_constraint("entries_user_id_id_key", "entries", type_="unique")
