"""Notes: text or a sketch, pinned or not (Epic 32).

One table. A note is ``text`` (a title and/or a body) or ``sketch`` (vector strokes in
``jsonb``), and a CHECK refuses a row carrying the other kind's content, so "which is it"
is always answered by ``kind`` alone (AD-48).

**What the schema holds.** The kind is known; a text note says something; a sketch has no
body. **What it does not.** The shape of the strokes — colour and width indexes, points on
the canvas, the ceilings on strokes and points — is the request schema's: a CHECK over the
inside of a ``jsonb`` document would need a function, and it would be a second copy of a
rule the API already refuses with a sentence.

The id is chosen by the client (AD-48), so a draft written offline and retried after a lost
response writes the same row twice rather than two rows. There is therefore no server
default doing any work on the write path; it stays for rows written by hand.

Revision ID: 0024
Revises: 0023
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.create_table(
        "notes",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("sketch", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("kind IN ('text', 'sketch')", name="notes_kind_known"),
        sa.CheckConstraint(
            "(kind = 'text' AND sketch IS NULL) OR (kind = 'sketch' AND body IS NULL "
            "AND sketch IS NOT NULL)",
            name="notes_one_kind_of_content",
        ),
        sa.CheckConstraint(
            "kind <> 'text' OR length(coalesce(title, '')) + length(coalesce(body, '')) > 0",
            name="notes_text_says_something",
        ),
    )
    # The list's order: pinned first, then the most recently changed.
    op.create_index(
        "notes_user_order_idx",
        "notes",
        ["user_id", sa.text("pinned DESC"), sa.text("updated_at DESC")],
    )
    protect("notes")


def downgrade() -> None:
    op.drop_table("notes")
