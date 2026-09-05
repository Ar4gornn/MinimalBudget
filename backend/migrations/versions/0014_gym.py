"""exercises, routines and workout logs

Epic 19. A routine is a named list of exercises with targets — "Push day: bench 4x8" — and a
workout is what actually happened, one row per set. The routine is the thing edited rarely
and used often; the sets are the thing that answers "am I getting stronger?", which no
coarser record can.

`weight_unit` goes on the user for the same reason currency does (migration 0006): a log
holding both 100 kg and 100 lb makes every chart ambiguous, and converting on read needs a
choice this app should not make silently. Changing it relabels rather than converts, so it
locks once any set exists — exactly the rule Epic 9 settled.

Revision ID: 0014
Revises: 0013
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import APP_ROLE, protect, unprotect

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.add_column(
        "users", sa.Column("weight_unit", sa.String(2), nullable=False, server_default="kg")
    )
    op.create_check_constraint(
        "users_weight_unit_supported", "users", "weight_unit IN ('kg', 'lb')"
    )
    # AD-19: the runtime role reads users by named columns, so a new column is invisible to
    # it until granted explicitly — without this every profile read would fail.
    for privilege in ("SELECT", "INSERT", "UPDATE"):
        op.execute(f'GRANT {privilege} (weight_unit) ON users TO "{APP_ROLE}"')

    op.create_table(
        "exercises",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(80), nullable=False),
        # A form-check video. Stored as a link and opened externally, never embedded: an
        # iframe would need frame-src added to the CSP and would load a third-party player
        # into a private family app. https only — see the service for why.
        sa.Column("video_url", sa.String(500), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "video_url IS NULL OR video_url LIKE 'https://%'", name="exercises_video_https_only"
        ),
        sa.UniqueConstraint("user_id", "id", name="exercises_user_id_id_key"),
    )
    op.execute("CREATE UNIQUE INDEX exercises_user_name_key ON exercises (user_id, lower(name))")
    protect("exercises")

    op.create_table(
        "routines",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("user_id", "id", name="routines_user_id_id_key"),
    )
    op.execute("CREATE UNIQUE INDEX routines_user_name_key ON routines (user_id, lower(name))")
    protect("routines")

    op.create_table(
        "routine_exercises",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("routine_id", uuid_type, nullable=False),
        sa.Column("exercise_id", uuid_type, nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("target_sets", sa.Integer, nullable=True),
        sa.Column("target_reps", sa.Integer, nullable=True),
        sa.CheckConstraint("position >= 0", name="routine_exercises_position_non_negative"),
        sa.CheckConstraint(
            "target_sets IS NULL OR target_sets > 0", name="routine_exercises_sets_positive"
        ),
        sa.CheckConstraint(
            "target_reps IS NULL OR target_reps > 0", name="routine_exercises_reps_positive"
        ),
        # One line per exercise in a routine: "bench, then bench again" is sets, not lines.
        sa.UniqueConstraint(
            "routine_id", "exercise_id", name="routine_exercises_routine_exercise_key"
        ),
        # AD-18 on both sides. The line belongs to its routine, so CASCADE; the exercise is
        # reference data, so RESTRICT — deleting it would silently empty routines.
        sa.ForeignKeyConstraint(
            ["user_id", "routine_id"],
            ["routines.user_id", "routines.id"],
            name="routine_exercises_routine_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "exercise_id"],
            ["exercises.user_id", "exercises.id"],
            name="routine_exercises_exercise_fkey",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "routine_exercises_user_routine_idx", "routine_exercises", ["user_id", "routine_id"]
    )
    protect("routine_exercises")

    op.create_table(
        "workouts",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        # Nullable: a session done without a routine is still a session.
        sa.Column("routine_id", uuid_type, nullable=True),
        # AD-10: a calendar day the person chose, not an instant.
        sa.Column("performed_on", sa.Date, nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        # The routine foreign key is added after the table, below: it needs the column-list
        # form of SET NULL, which SQLAlchemy cannot express.
        sa.UniqueConstraint("user_id", "id", name="workouts_user_id_id_key"),
    )
    op.create_index("workouts_user_performed_idx", "workouts", ["user_id", "performed_on"])
    # SET NULL, not CASCADE: deleting a routine must not delete the workouts done from it.
    # What happened is a record; the plan it came from is not.
    #
    # And SET NULL *(routine_id)*, naming the column — the plain form nulls every column of
    # the referencing key, including user_id, which is NOT NULL, so deleting a routine
    # failed outright. Same column-list form as 0010 and 0011 (Postgres 15+).
    op.execute(
        "ALTER TABLE workouts ADD CONSTRAINT workouts_routine_fkey "
        "FOREIGN KEY (user_id, routine_id) REFERENCES routines (user_id, id) "
        "ON DELETE SET NULL (routine_id)"
    )
    protect("workouts")

    op.create_table(
        "workout_sets",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("workout_id", uuid_type, nullable=False),
        sa.Column("exercise_id", uuid_type, nullable=False),
        # Order within the session, so supersets and any exercise order work without a
        # second concept. Sets are read in this order, never by insertion time.
        sa.Column("position", sa.Integer, nullable=False),
        # Nullable for a bodyweight set: "8 pull-ups" carries no weight, and 0 would be one.
        sa.Column("weight", sa.Numeric(7, 2), nullable=True),
        sa.Column("reps", sa.Integer, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("reps > 0", name="workout_sets_reps_positive"),
        sa.CheckConstraint(
            "weight IS NULL OR weight >= 0", name="workout_sets_weight_non_negative"
        ),
        sa.CheckConstraint("position >= 0", name="workout_sets_position_non_negative"),
        sa.ForeignKeyConstraint(
            ["user_id", "workout_id"],
            ["workouts.user_id", "workouts.id"],
            name="workout_sets_workout_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "exercise_id"],
            ["exercises.user_id", "exercises.id"],
            name="workout_sets_exercise_fkey",
            ondelete="RESTRICT",
        ),
    )
    op.create_index("workout_sets_user_workout_idx", "workout_sets", ["user_id", "workout_id"])
    op.create_index("workout_sets_user_exercise_idx", "workout_sets", ["user_id", "exercise_id"])
    protect("workout_sets")


def downgrade() -> None:
    unprotect("workout_sets")
    op.drop_table("workout_sets")
    unprotect("workouts")
    op.drop_table("workouts")
    unprotect("routine_exercises")
    op.drop_table("routine_exercises")
    unprotect("routines")
    op.drop_table("routines")
    unprotect("exercises")
    op.drop_table("exercises")
    op.drop_constraint("users_weight_unit_supported", "users", type_="check")
    op.drop_column("users", "weight_unit")
