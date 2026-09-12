"""habit schedules, and a check-in that knows what time it was

Epic 26. Two changes to Epic 23's model, both of which reverse a decision migration 0016
made deliberately. Reversing them needs the reason, not just the DDL.

**`period` + `target_count` becomes a schedule.** 0016 shipped the smallest model that
answers "did I do it enough this week": a `day`/`week` bucket and a count. It cannot say
"Monday, Wednesday and Friday", "every third day", "the 15th" or "the last Friday of the
month" — and it said so, promising that a later migration would add them "without rewriting
anything here". This is that migration, and it does rewrite: keeping `period` alongside a
schedule would leave two models of the same thing, and every read would have to ask which
one a row uses. That is the classic source of a wrong streak, so the old columns go.

The shape is **typed columns with CHECK constraints**, not JSONB and not an RRULE string.
It matches the idiom already used for `period` and `recurring_templates.cadence`; every
rule the database can validate, it does validate; and no column can hold a rule the UI
has no form for. What it costs is six columns of which most are NULL on any given row —
`habits_schedule_shape` below is what makes that honest, by refusing every combination
except the one its kind requires.

The six kinds, and what an *occasion* is for each:

| kind             | occasion                          | extra columns          |
|------------------|-----------------------------------|------------------------|
| `daily`          | every day                         | —                      |
| `weekdays`       | each named weekday                | `weekdays` (bitmask)   |
| `every_n_days`   | every Nth day from `started_on`   | `interval_days`        |
| `day_of_month`   | the Dth of each month             | `day_of_month`         |
| `nth_weekday`    | the Nth <weekday> of each month   | `nth`, `weekday`       |
| `times_per_week` | the whole Monday-week             | —                      |

`target_count` survives all six and means the same thing throughout: how many times within
one occasion. `daily` with a target of 3 is "three times a day"; `times_per_week` with a
target of 3 is the old `(week, 3)`. That is why the data migration below is two lines.

**One row per check-in, carrying the time.** 0016 stored one row per (habit, day) with a
`times` counter, and argued that a row per tap makes an accidental double-tap
indistinguishable from a genuine second session. That argument holds exactly as long as a
check-in carries no time. Once it does, 08:02 and 08:02 are visibly one mistake while 08:00
and 14:00 are visibly two doses — and "delete the 2pm one" becomes a row to delete rather
than a counter to decrement and a note to guess about. So the counter goes and the row
becomes the occurrence.

`done_at` is `time without time zone`, and nullable. Nullable because a day recorded after
the fact honestly has no time — NULL is "did it, did not say when", which is different from
midnight. Without a zone because it is paired with `done_on`, which AD-10 already defines as
the calendar day *the person says*, not an instant: storing an absolute instant beside a
chosen date would let the two disagree about which day it was.

**What the schema still cannot enforce, and where it moved to.** 0016 listed two rules that
CHECK cannot hold — a check-in must not be in the future, and must not predate its habit —
and put them in `services/habits.py`. This migration adds a third of the same kind: **at
most 100 check-ins for one habit on one day**, which used to be `CHECK (times <= 100)` and
is now a row count, which no CHECK can see. It lives beside the other two, with a test.

Revision ID: 0018
Revises: 0017
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Every kind, and exactly which of the five optional columns it requires. `ELSE false`
# rejects an unknown kind outright, so this constraint is also what stops a typo becoming
# a habit that no occasion generator recognises.
_SHAPE = """
CASE schedule_kind
    WHEN 'daily' THEN
        weekdays IS NULL AND interval_days IS NULL AND day_of_month IS NULL
        AND nth IS NULL AND weekday IS NULL
    WHEN 'times_per_week' THEN
        weekdays IS NULL AND interval_days IS NULL AND day_of_month IS NULL
        AND nth IS NULL AND weekday IS NULL
    WHEN 'weekdays' THEN
        weekdays IS NOT NULL AND interval_days IS NULL AND day_of_month IS NULL
        AND nth IS NULL AND weekday IS NULL
    WHEN 'every_n_days' THEN
        weekdays IS NULL AND interval_days IS NOT NULL AND day_of_month IS NULL
        AND nth IS NULL AND weekday IS NULL
    WHEN 'day_of_month' THEN
        weekdays IS NULL AND interval_days IS NULL AND day_of_month IS NOT NULL
        AND nth IS NULL AND weekday IS NULL
    WHEN 'nth_weekday' THEN
        weekdays IS NULL AND interval_days IS NULL AND day_of_month IS NULL
        AND nth IS NOT NULL AND weekday IS NOT NULL
    ELSE false
END
"""


def upgrade() -> None:
    # ------------------------------------------------------------------ habits

    op.add_column("habits", sa.Column("schedule_kind", sa.String(14), nullable=True))
    # A bitmask, bit 0 = Monday … bit 6 = Sunday, so "Mon, Wed, Fri" is 1 + 4 + 16 = 21.
    # One SMALLINT rather than seven booleans or a `smallint[]`: the set is fixed at seven
    # members forever, `weekdays & (1 << n) <> 0` is the whole membership test, and an
    # array would need its own CHECK for duplicates and out-of-range members.
    op.add_column("habits", sa.Column("weekdays", sa.SmallInteger, nullable=True))
    op.add_column("habits", sa.Column("interval_days", sa.SmallInteger, nullable=True))
    op.add_column("habits", sa.Column("day_of_month", sa.SmallInteger, nullable=True))
    # 1..4, or -1 for "the last one in the month". -1 rather than a separate boolean
    # because "the last Friday" and "the second Friday" are the same rule with a different
    # index, and a boolean would let both be set at once.
    op.add_column("habits", sa.Column("nth", sa.SmallInteger, nullable=True))
    op.add_column("habits", sa.Column("weekday", sa.SmallInteger, nullable=True))

    # The whole data migration. `target_count` is untouched because it means the same
    # thing on both sides of this line: times within one occasion.
    op.execute(
        """
        UPDATE habits
        SET schedule_kind = CASE WHEN period = 'week' THEN 'times_per_week' ELSE 'daily' END
        """
    )
    op.alter_column("habits", "schedule_kind", nullable=False)

    op.drop_constraint("habits_period_supported", "habits", type_="check")
    op.drop_column("habits", "period")

    op.create_check_constraint(
        "habits_schedule_kind_supported",
        "habits",
        "schedule_kind IN ('daily', 'weekdays', 'every_n_days', 'day_of_month', "
        "'nth_weekday', 'times_per_week')",
    )
    # 1..127: at least one weekday, at most all seven. Zero would be a habit with no
    # occasion ever, which is not a plan.
    op.create_check_constraint(
        "habits_weekdays_in_range", "habits", "weekdays IS NULL OR weekdays BETWEEN 1 AND 127"
    )
    # From 2, because "every 1 days" is `daily` and two spellings of one rule is how the
    # streak query ends up with two answers. Capped at a year.
    op.create_check_constraint(
        "habits_interval_in_range",
        "habits",
        "interval_days IS NULL OR interval_days BETWEEN 2 AND 365",
    )
    # 28 for the same reason as `users.budget_start_day` (AD-10): it is the widest day that
    # exists in every month. "The 31st" would silently skip February, and a habit that
    # vanishes for one month a year is worse than one that cannot be expressed. "The last
    # day of the month" is `nth_weekday`'s neighbour and is deliberately not offered — see
    # the note in `services/habits.py`.
    op.create_check_constraint(
        "habits_day_of_month_in_range",
        "habits",
        "day_of_month IS NULL OR day_of_month BETWEEN 1 AND 28",
    )
    op.create_check_constraint(
        "habits_nth_in_range", "habits", "nth IS NULL OR nth IN (-1, 1, 2, 3, 4)"
    )
    op.create_check_constraint(
        "habits_weekday_in_range", "habits", "weekday IS NULL OR weekday BETWEEN 0 AND 6"
    )
    op.create_check_constraint("habits_schedule_shape", "habits", _SHAPE)

    # ---------------------------------------------------------- habit_checkins

    op.add_column("habit_checkins", sa.Column("done_at", sa.Time(timezone=False), nullable=True))

    # The unique key has to go before the expansion, or the expansion is the thing it
    # refuses. It is not replaced: two check-ins on one day is now the point.
    op.drop_constraint("habit_checkins_day_key", "habit_checkins", type_="unique")

    # `times = 3` becomes three rows. The note stays on the original row rather than being
    # copied onto all three: it was written once, about the day, and three identical notes
    # would read as three separate remarks.
    op.execute(
        """
        INSERT INTO habit_checkins (user_id, habit_id, done_on, times, note)
        SELECT c.user_id, c.habit_id, c.done_on, 1, NULL
        FROM habit_checkins c, generate_series(2, c.times)
        WHERE c.times > 1
        """
    )
    op.drop_constraint("habit_checkins_times_in_range", "habit_checkins", type_="check")
    op.drop_column("habit_checkins", "times")

    # Every read of a habit's history is (user_id, habit_id) over a date range — progress,
    # the streak walk and the heat-map all are. The existing (user_id, done_on) index
    # serves the calendar's cross-habit read and is kept.
    op.create_index(
        "habit_checkins_habit_day_idx", "habit_checkins", ["user_id", "habit_id", "done_on"]
    )


def downgrade() -> None:
    # Collapsing back loses what this migration was for: the times, and any schedule that
    # `period` cannot spell. A habit on named weekdays comes back as a plain daily one,
    # which is the closest honest thing `period` can say.
    op.drop_index("habit_checkins_habit_day_idx", table_name="habit_checkins")

    op.add_column(
        "habit_checkins",
        sa.Column("times", sa.Integer, nullable=False, server_default=sa.text("1")),
    )
    op.execute(
        """
        WITH kept AS (
            SELECT DISTINCT ON (user_id, habit_id, done_on) id
            FROM habit_checkins
            ORDER BY user_id, habit_id, done_on, done_at NULLS LAST, id
        ), counted AS (
            SELECT user_id, habit_id, done_on, count(*) AS n
            FROM habit_checkins GROUP BY 1, 2, 3
        )
        UPDATE habit_checkins c
        SET times = LEAST(counted.n, 100)
        FROM counted
        WHERE c.id IN (SELECT id FROM kept)
          AND counted.user_id = c.user_id
          AND counted.habit_id = c.habit_id
          AND counted.done_on = c.done_on
        """
    )
    op.execute(
        """
        DELETE FROM habit_checkins c
        WHERE c.id NOT IN (
            SELECT DISTINCT ON (user_id, habit_id, done_on) id
            FROM habit_checkins
            ORDER BY user_id, habit_id, done_on, done_at NULLS LAST, id
        )
        """
    )
    op.create_check_constraint(
        "habit_checkins_times_in_range", "habit_checkins", "times >= 1 AND times <= 100"
    )
    op.create_unique_constraint(
        "habit_checkins_day_key", "habit_checkins", ["user_id", "habit_id", "done_on"]
    )
    op.drop_column("habit_checkins", "done_at")

    op.add_column("habits", sa.Column("period", sa.String(5), nullable=True))
    op.execute(
        """
        UPDATE habits
        SET period = CASE WHEN schedule_kind = 'times_per_week' THEN 'week' ELSE 'day' END
        """
    )
    op.execute("UPDATE habits SET target_count = 1 WHERE schedule_kind NOT IN ('daily', "
               "'times_per_week')")
    op.alter_column("habits", "period", nullable=False)

    for name in (
        "habits_schedule_shape",
        "habits_weekday_in_range",
        "habits_nth_in_range",
        "habits_day_of_month_in_range",
        "habits_interval_in_range",
        "habits_weekdays_in_range",
        "habits_schedule_kind_supported",
    ):
        op.drop_constraint(name, "habits", type_="check")
    op.create_check_constraint("habits_period_supported", "habits", "period IN ('day', 'week')")

    for column in ("weekday", "nth", "day_of_month", "interval_days", "weekdays", "schedule_kind"):
        op.drop_column("habits", column)
