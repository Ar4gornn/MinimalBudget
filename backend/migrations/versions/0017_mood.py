"""the day's two answers — how it felt, and whether it was any good

Epic 24. The first *subjective* record in this system: every other table holds something
with a referent outside the row — a receipt, a quantity on a shelf, a set that was lifted.
This one holds what a person said about a day.

Four shape decisions are worth the paragraphs, because each had a plausible alternative.

**One ordered five-point scale, stored as its point.** `mood SMALLINT` from 1 (worst) to 5
(best), on one axis: how good you feel. The rejected alternative is a set of named emotions
— happy, sad, angry, tired — which is *unordered*, and unordered is the honest shape for
"angry versus sad" because neither is more than the other. It was rejected because the only
summary an unordered set admits is a count per name, the names would change the first time
anybody restyled them, and a household produces a few dozen points a month, which is not
enough for a per-name tally to say anything. One ordered axis answers "is it better or worse
than last week" and refuses to answer anything else. Five and not four: the middle point is
the most common truthful answer a person has, and forcing a side is a survey device for
extracting signal from people who do not care — the opposite of the reader here.

**The emoji is presentation; the column is the point.** Nothing here stores a codepoint or a
face, so restyling the drawings rewrites no row. The faces are inline SVG drawn in this
repository rather than emoji, because the same codepoint is a different drawing on iOS,
Android and Windows and this family shares neither device nor OS (AD-42).

**A verdict on the day is a second question, not a second copy of the first.** `day_ok
BOOLEAN` is orthogonal to `mood`, and the proof is that both off-diagonal evenings are real:
tired but productive is (2, true), cheerful but wasted is (4, false). It is a boolean and
not a second five-point scale deliberately — two identical scales in one prompt invite
people to read the pair as one two-dimensional score and average it, and one of the two
questions genuinely does have a yes/no answer.

**One row per day, re-answerable, and never zero-valued.** Both columns are nullable and a
CHECK requires at least one of them, so a row always says something; clearing the last
answer deletes the row, which makes "no row" the only way the data says *did not say* — the
same rule Epic 23 settled for a check-in at zero. A nullable boolean therefore has three
states and the interface must not flatten them: yes, no, and not asked. And answering again
overwrites the day rather than appending: a mood has no external referent, so a later answer
is not a correction toward a truth outside the row, it is a second answer from a person who
now remembers the day differently. The system keeps the latest and cannot tell the two
apart; `created_at` and `updated_at` are the only trace that an answer was revised or
backfilled, which is as much as anything here needs. See AD-41.

**What the database cannot enforce, and why.** An answer must not be about the future.
`CHECK (on_day <= current_date)` is refused by Postgres — `current_date` is not IMMUTABLE —
exactly as it was for `habit_checkins.done_on`. It lives in `services/mood.py`, with tests,
beside the sanity floor below, which is what the schema can honestly say.

Revision ID: 0017
Revises: 0016
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect, unprotect

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.create_table(
        "mood_days",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        # A DATE the person chose, placed unconverted (AD-38). Nothing here derives a
        # calendar day from an instant, so the UTC-placement half of AD-38 never applies:
        # created_at is an audit stamp and no figure is bucketed by it.
        sa.Column("on_day", sa.Date, nullable=False),
        # 1..5, worst to best. SMALLINT rather than an enum type: the scale is a number on
        # one axis, and a widening to seven points later is one ALTER of the CHECK.
        sa.Column("mood", sa.SmallInteger, nullable=True),
        # "Was the day any good." Three states, and the UI must not flatten them: true,
        # false, and no answer at all.
        sa.Column("day_ok", sa.Boolean, nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("mood >= 1 AND mood <= 5", name="mood_days_point_in_range"),
        # A row that answers nothing would be indistinguishable from a row that answers
        # "neutral", and every count below would have to know the difference.
        sa.CheckConstraint(
            "mood IS NOT NULL OR day_ok IS NOT NULL", name="mood_days_says_something"
        ),
        # A sanity floor, not a business rule — the same one habits carries. There is
        # deliberately no *upper* bound here and no lower bound at the account's creation
        # date: writing down how a day in March felt is a legitimate backfill.
        sa.CheckConstraint("on_day >= DATE '2000-01-01'", name="mood_days_on_day_sane"),
        # One row per day. This is what makes answering again an UPDATE rather than a
        # second point that some chart would then have to average.
        sa.UniqueConstraint("user_id", "on_day", name="mood_days_day_key"),
    )
    # The unique key above already orders (user_id, on_day), so every window read below is
    # an index range scan and no second index earns its write cost.
    protect("mood_days")


def downgrade() -> None:
    unprotect("mood_days")
    op.drop_table("mood_days")
