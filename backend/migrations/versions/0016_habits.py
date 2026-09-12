"""habits and their check-ins

Epic 23. A habit is a plan — "run three times a week" — and a check-in is evidence that it
was done. The two are separate rows and neither rewrites the other (AD-35): editing the
target never touches a check-in, and a check-in never edits the habit.

Two shape decisions are worth the paragraph, because both had a plausible alternative.

**A period is `day` or `week` with a target count**, and nothing else. That is the smallest
model that answers "did I do it enough this week": daily is (day, 1), "three times a week"
is (week, 3), "twice a day" is (day, 2). `every N days` and `specific weekdays` were left
out deliberately, not forgotten — each needs a second column *and* a different definition of
"on track", and a later migration adds them without rewriting anything here.

**One row per (habit, day), carrying `times`**, rather than one row per tap. A row per tap
makes an accidental double-tap indistinguishable from a genuine second session, and makes
"undo" ambiguous about which row to remove. `times` is not a derived figure that could go
stale — it *is* the fact — so it does not offend AD-9. Everything actually derived (streak,
completion, "still to do today") stays computed, in SQL, and is stored nowhere.

**What the database cannot enforce here, and why.** A check-in must not be in the future and
must not predate its habit. Neither can be a CHECK constraint: `CHECK (done_on <=
current_date)` is refused by Postgres because the function is not IMMUTABLE, and the
`started_on` bound lives in another table. Both are enforced in `services/habits.py`, with
tests. A trigger would move them into the schema, but a trigger is a whole mechanism for two
rules and this project has none; the sanity floor below is what the schema can honestly say.

Revision ID: 0016
Revises: 0015
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect, unprotect

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.create_table(
        "habits",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(80), nullable=False),
        # 'day' or 'week'. A VARCHAR with a CHECK rather than an enum type, matching
        # recurring_templates.cadence: adding 'month' later is one ALTER of the constraint
        # instead of an ALTER TYPE that cannot run inside a transaction on older servers.
        sa.Column("period", sa.String(5), nullable=False),
        sa.Column("target_count", sa.Integer, nullable=False),
        # Anchors the streak: periods before the habit existed are not misses.
        sa.Column("started_on", sa.Date, nullable=False),
        # Archived rather than deleted is the safe path, because deleting takes the
        # check-ins with it. Nullable timestamp rather than a boolean, so "when did I stop"
        # is answerable without a second column.
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        # Opt **in** to the daily digest, per habit. Off by default deliberately: today the
        # digest fires only when something is exceptional, and a daily habit would make it
        # arrive every single day — which is the notification people switch off entirely,
        # taking the stock and recurring reminders with it (AD-34).
        sa.Column("remind", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("period IN ('day', 'week')", name="habits_period_supported"),
        sa.CheckConstraint(
            "target_count >= 1 AND target_count <= 100", name="habits_target_in_range"
        ),
        # A sanity floor, not a business rule: the streak query walks every period from
        # started_on to today, so a typo of 1900 would generate 45,000 rows per read.
        sa.CheckConstraint("started_on >= DATE '2000-01-01'", name="habits_started_on_sane"),
        # AD-18 needs this on the referenced side for the composite key below.
        sa.UniqueConstraint("user_id", "id", name="habits_user_id_id_key"),
    )
    op.execute("CREATE UNIQUE INDEX habits_user_name_key ON habits (user_id, lower(name))")
    protect("habits")

    op.create_table(
        "habit_checkins",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("habit_id", uuid_type, nullable=False),
        # AD-10: the calendar day the person says they did it, not the instant they tapped.
        sa.Column("done_on", sa.Date, nullable=False),
        # How many times on that day. Never zero: the row is deleted instead, so "no row"
        # and "zero" cannot both mean the same thing in a LEFT JOIN.
        sa.Column("times", sa.Integer, nullable=False, server_default=sa.text("1")),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("times >= 1 AND times <= 100", name="habit_checkins_times_in_range"),
        sa.CheckConstraint("done_on >= DATE '2000-01-01'", name="habit_checkins_done_on_sane"),
        # One row per habit per day. This is what makes checking in idempotent per day and
        # makes an increment an UPDATE rather than a second row.
        sa.UniqueConstraint("user_id", "habit_id", "done_on", name="habit_checkins_day_key"),
        # AD-18: composite, including user_id, because Postgres FK checks bypass RLS — a
        # bare habit_id would let user B record a check-in against user A's habit.
        #
        # CASCADE, unlike the RESTRICT this project uses for reference data: a check-in has
        # no meaning without its habit. "I did it fourteen times" is not a sentence on its
        # own, so keeping the rows would preserve nothing anybody could read. Archiving is
        # the non-destructive path, and it is what the client offers first (AD-21).
        sa.ForeignKeyConstraint(
            ["user_id", "habit_id"],
            ["habits.user_id", "habits.id"],
            name="habit_checkins_habit_fkey",
            ondelete="CASCADE",
        ),
    )
    op.create_index("habit_checkins_user_done_idx", "habit_checkins", ["user_id", "done_on"])
    protect("habit_checkins")


def downgrade() -> None:
    unprotect("habit_checkins")
    op.drop_table("habit_checkins")
    unprotect("habits")
    op.drop_table("habits")
