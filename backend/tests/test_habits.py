"""Habits, schedules and check-ins through the API (Epics 23 and 26).

The calendar arithmetic itself is proven in ``test_schedule.py``, without a database and
with dates written by hand. This file proves the parts that need one: the schema's shape
constraint, the rules the schema cannot hold, the windows a request actually returns, and
that a check-in is one row with a time on it.

Dates here are relative to today, because the endpoints read the real clock. Anything that
needs a *fixed* calendar goes in ``test_schedule.py`` instead.
"""

import datetime as dt

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.errors import Invalid
from app.core.schedule import week_start
from app.services import habits as habits_service

TODAY = dt.date.today()


def iso(offset: int = 0) -> str:
    return (TODAY + dt.timedelta(days=offset)).isoformat()


def _make(client, user, **overrides):
    payload = {"name": "Run", "schedule_kind": "daily", "target_count": 1} | overrides
    response = client.post("/api/habits", json=payload, headers=user["headers"])
    assert response.status_code == 201, response.text
    return response.json()


def _check_in(client, user, habit_id: str, **body):
    return client.post(
        f"/api/habits/{habit_id}/checkins", json=body, headers=user["headers"]
    )


def _progress(client, user, habit_id: str) -> dict:
    rows = client.get("/api/habits/progress", headers=user["headers"]).json()["items"]
    return next(row for row in rows if row["habit_id"] == habit_id)


# ------------------------------------------------------------- the schedule


def test_a_habit_is_created_with_a_schedule_and_a_target(client, user_a):
    habit = _make(client, user_a, name="Read", schedule_kind="times_per_week", target_count=3)

    assert habit["schedule_kind"] == "times_per_week"
    assert habit["target_count"] == 3
    assert habit["remind"] is False, "a habit must opt in to being nagged about"
    assert habit["archived_at"] is None
    assert habit["started_on"] == TODAY.isoformat()
    assert habit["weekdays"] is None and habit["interval_days"] is None


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({"schedule_kind": "weekdays", "weekdays": 21}, {"weekdays": 21}),
        ({"schedule_kind": "every_n_days", "interval_days": 3}, {"interval_days": 3}),
        ({"schedule_kind": "day_of_month", "day_of_month": 15}, {"day_of_month": 15}),
        ({"schedule_kind": "nth_weekday", "nth": -1, "weekday": 4}, {"nth": -1, "weekday": 4}),
    ],
)
def test_every_schedule_kind_round_trips(client, user_a, payload, expected):
    habit = _make(client, user_a, **payload)
    for key, value in expected.items():
        assert habit[key] == value
    for column in ("weekdays", "interval_days", "day_of_month", "nth", "weekday"):
        if column not in expected:
            assert habit[column] is None, f"{column} should be null for this kind"


def test_a_schedule_without_the_column_it_needs_is_refused(client, user_a):
    refused = client.post(
        "/api/habits",
        json={"name": "Gym", "schedule_kind": "weekdays"},
        headers=user_a["headers"],
    )
    assert refused.status_code == 422
    assert "weekdays" in refused.json()["detail"]


def test_a_column_the_kind_does_not_use_is_cleared_rather_than_stored(client, user_a):
    """A stored value nothing will ever read is a trap: it survives an edit, and the day the
    kind changes back it silently becomes live again. Made to fail by passing the request
    through untouched — `interval_days` came back as 3 on a daily habit."""
    habit = _make(client, user_a, schedule_kind="daily", interval_days=3, weekdays=21)
    assert habit["interval_days"] is None
    assert habit["weekdays"] is None


def test_an_unsupported_schedule_is_refused(client, user_a):
    refused = client.post(
        "/api/habits",
        json={"name": "Meditate", "schedule_kind": "fortnightly"},
        headers=user_a["headers"],
    )
    assert refused.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"schedule_kind": "weekdays", "weekdays": 0},
        {"schedule_kind": "weekdays", "weekdays": 128},
        {"schedule_kind": "every_n_days", "interval_days": 1},
        {"schedule_kind": "day_of_month", "day_of_month": 31},
        {"schedule_kind": "nth_weekday", "nth": 5, "weekday": 1},
        {"schedule_kind": "nth_weekday", "nth": 1, "weekday": 7},
    ],
)
def test_a_schedule_parameter_out_of_range_is_refused(client, user_a, payload):
    refused = client.post(
        "/api/habits", json={"name": "X"} | payload, headers=user_a["headers"]
    )
    assert refused.status_code == 422, refused.text


def test_the_database_refuses_a_mismatched_schedule_too(client, user_a, owner_engine):
    """AD-24: the shape rule is in the schema, not only in the service, so it is true of
    rows written by anything that is not this API.

    Made to fail by dropping `habits_schedule_shape`: the insert below succeeded and left a
    weekday habit with no weekdays, which every occasion generator reads as "never due"."""
    habit = _make(client, user_a)
    with pytest.raises(IntegrityError), owner_engine.begin() as conn:
        conn.execute(
            text("UPDATE habits SET schedule_kind = 'weekdays' WHERE id = :id"),
            {"id": habit["id"]},
        )


def test_a_target_outside_the_range_is_refused_by_the_database_too(client, user_a, owner_engine):
    habit = _make(client, user_a)
    with pytest.raises(IntegrityError), owner_engine.begin() as conn:
        conn.execute(
            text("UPDATE habits SET target_count = 0 WHERE id = :id"), {"id": habit["id"]}
        )


def test_a_duplicate_name_is_refused(client, user_a):
    _make(client, user_a, name="Run")
    clash = client.post("/api/habits", json={"name": "  run  "}, headers=user_a["headers"])
    assert clash.status_code == 409


def test_a_habit_cannot_start_in_the_future(client, user_a):
    refused = client.post(
        "/api/habits",
        json={"name": "Later", "started_on": iso(1)},
        headers=user_a["headers"],
    )
    assert refused.status_code == 422


def test_changing_the_kind_rewrites_the_whole_schedule(client, user_a):
    """Half an edit leaves a column the new kind does not use — the row the shape constraint
    exists to refuse. Made to fail by writing only the fields present in the request."""
    habit = _make(client, user_a, schedule_kind="every_n_days", interval_days=4)
    changed = client.patch(
        f"/api/habits/{habit['id']}",
        json={"schedule_kind": "weekdays", "weekdays": 21},
        headers=user_a["headers"],
    ).json()
    assert changed["weekdays"] == 21
    assert changed["interval_days"] is None


def test_adjusting_a_schedule_without_naming_the_kind_keeps_the_kind(client, user_a):
    habit = _make(client, user_a, schedule_kind="weekdays", weekdays=21)
    changed = client.patch(
        f"/api/habits/{habit['id']}", json={"weekdays": 9}, headers=user_a["headers"]
    ).json()
    assert changed["schedule_kind"] == "weekdays"
    assert changed["weekdays"] == 9


def test_changing_the_kind_without_its_column_is_refused(client, user_a):
    habit = _make(client, user_a)
    refused = client.patch(
        f"/api/habits/{habit['id']}",
        json={"schedule_kind": "day_of_month"},
        headers=user_a["headers"],
    )
    assert refused.status_code == 422


# ------------------------------------------------------- archiving, deleting


def test_archiving_hides_a_habit_without_touching_its_check_ins(client, user_a):
    habit = _make(client, user_a)
    _check_in(client, user_a, habit["id"])

    client.patch(f"/api/habits/{habit['id']}", json={"archived": True}, headers=user_a["headers"])

    assert client.get("/api/habits", headers=user_a["headers"]).json()["items"] == []
    listed = client.get("/api/habits?archived=true", headers=user_a["headers"]).json()["items"]
    assert len(listed) == 1 and listed[0]["archived_at"] is not None
    # The record survives: the calendar must not lose days because a habit was put away.
    kept = client.get(
        f"/api/habits/checkins?habit_id={habit['id']}", headers=user_a["headers"]
    ).json()["items"]
    assert len(kept) == 1
    assert client.get("/api/habits/progress", headers=user_a["headers"]).json()["items"] == []


def test_deleting_a_habit_takes_its_check_ins(client, user_a):
    habit = _make(client, user_a)
    _check_in(client, user_a, habit["id"])
    assert client.delete(f"/api/habits/{habit['id']}", headers=user_a["headers"]).status_code == 204
    assert client.get("/api/habits/checkins", headers=user_a["headers"]).json()["items"] == []


# ---------------------------------------------------------------- check-ins


def test_three_check_ins_in_a_day_are_three_rows_with_three_times(client, user_a):
    """The point of Epic 26. Under Epic 23 this was one row with `times = 3`, and "delete
    the 2pm one" had no answer."""
    habit = _make(client, user_a, name="Medication", target_count=3)
    for at in ("08:00", "14:00", "20:00"):
        assert _check_in(client, user_a, habit["id"], done_at=at).status_code == 201

    rows = client.get(
        f"/api/habits/checkins?habit_id={habit['id']}", headers=user_a["headers"]
    ).json()["items"]
    assert [row["done_at"] for row in rows] == ["08:00:00", "14:00:00", "20:00:00"]
    assert len({row["id"] for row in rows}) == 3


def test_a_check_in_without_a_time_is_null_and_sorts_last(client, user_a):
    """NULL is "did it, did not say when", which is a different claim from midnight. Made to
    fail by defaulting to 00:00: the untimed one then sorted first and read as a 12am dose."""
    habit = _make(client, user_a, target_count=3)
    _check_in(client, user_a, habit["id"])
    _check_in(client, user_a, habit["id"], done_at="09:00")

    rows = client.get(
        f"/api/habits/checkins?habit_id={habit['id']}", headers=user_a["headers"]
    ).json()["items"]
    assert [row["done_at"] for row in rows] == ["09:00:00", None]


def test_one_occurrence_is_deleted_by_its_own_id(client, user_a):
    habit = _make(client, user_a, target_count=3)
    first = _check_in(client, user_a, habit["id"], done_at="08:00").json()
    second = _check_in(client, user_a, habit["id"], done_at="14:00").json()

    gone = client.delete(
        f"/api/habits/{habit['id']}/checkins/{first['id']}", headers=user_a["headers"]
    )
    assert gone.status_code == 204
    rows = client.get(
        f"/api/habits/checkins?habit_id={habit['id']}", headers=user_a["headers"]
    ).json()["items"]
    assert [row["id"] for row in rows] == [second["id"]]

    assert client.delete(
        f"/api/habits/{habit['id']}/checkins/{first['id']}", headers=user_a["headers"]
    ).status_code == 404


def test_a_check_in_can_be_amended_and_its_time_cleared(client, user_a):
    habit = _make(client, user_a)
    row = _check_in(client, user_a, habit["id"], done_at="08:00").json()

    amended = client.patch(
        f"/api/habits/{habit['id']}/checkins/{row['id']}",
        json={"done_at": "08:30", "note": "after breakfast"},
        headers=user_a["headers"],
    ).json()
    assert amended["done_at"] == "08:30:00"
    assert amended["note"] == "after breakfast"

    # Explicit null clears it; the note is untouched because it was not sent.
    cleared = client.patch(
        f"/api/habits/{habit['id']}/checkins/{row['id']}",
        json={"done_at": None},
        headers=user_a["headers"],
    ).json()
    assert cleared["done_at"] is None
    assert cleared["note"] == "after breakfast"


def test_a_check_in_cannot_be_in_the_future(client, user_a):
    habit = _make(client, user_a)
    assert _check_in(client, user_a, habit["id"], done_on=iso(1)).status_code == 422


def test_a_check_in_cannot_predate_the_habit(client, user_a):
    habit = _make(client, user_a, started_on=iso(-2))
    assert _check_in(client, user_a, habit["id"], done_on=iso(-3)).status_code == 422
    assert _check_in(client, user_a, habit["id"], done_on=iso(-2)).status_code == 201


def test_a_hundred_in_one_day_is_the_ceiling(client, user_a):
    """Used to be `CHECK (times <= 100)`. A row count is not something a CHECK can see, so
    migration 0018 moved the rule into the service — here is the test that keeps it."""
    from app.core.db import tenant_session

    habit = _make(client, user_a, target_count=100)
    with tenant_session(user_a["id"]) as session:
        for _ in range(habits_service.MAX_PER_DAY):
            habits_service.check_in(
                session, user_a["id"], habit["id"], done_on=None, done_at=None, note=None
            )
        with pytest.raises(Invalid):
            habits_service.check_in(
                session, user_a["id"], habit["id"], done_on=None, done_at=None, note=None
            )


def test_a_check_in_on_an_unasked_day_is_kept_but_counts_for_nothing(client, user_a):
    """Evidence is evidence: a Monday-Wednesday-Friday runner who ran on Tuesday did run. It
    simply creates no occasion, so it moves neither the week's total nor the streak."""
    # A schedule that asks for no day this week at all, so "today" is never an occasion.
    tomorrow_only = 1 << ((TODAY.weekday() + 1) % 7)
    habit = _make(client, user_a, schedule_kind="weekdays", weekdays=tomorrow_only)
    assert _check_in(client, user_a, habit["id"]).status_code == 201

    row = _progress(client, user_a, habit["id"])
    assert row["due_today"] is False
    assert row["today_done"] == 1, "the check-in is still recorded"
    assert row["met"] is False
    assert row["window_done"] == 0, "it met no occasion"


def test_check_ins_are_windowed_by_the_accounts_month(client, user_a):
    """AD-10: the list and the calendar grid drawn over it cover exactly the same days."""
    client.patch(
        "/api/auth/me/budget-start-day", json={"budget_start_day": 26}, headers=user_a["headers"]
    )
    habit = _make(client, user_a, started_on="2026-01-01")
    # With a start day of 26, "August" runs 26 July to 25 August. Fixed dates in the past,
    # so the window is the thing under test rather than the clock.
    for day in ("2026-07-25", "2026-07-26", "2026-08-25", "2026-08-26"):
        assert _check_in(client, user_a, habit["id"], done_on=day).status_code == 201

    listed = client.get("/api/habits/checkins?month=2026-08", headers=user_a["headers"]).json()
    assert [row["done_on"] for row in listed["items"]] == ["2026-07-26", "2026-08-25"]


# ----------------------------------------------------------------- progress


def test_progress_reports_the_occasion_in_progress_and_its_bounds(client, user_a):
    habit = _make(client, user_a, schedule_kind="times_per_week", target_count=3)
    _check_in(client, user_a, habit["id"])

    row = _progress(client, user_a, habit["id"])
    monday = week_start(TODAY)
    assert row["due_today"] is True
    assert row["occasion_start"] == monday.isoformat()
    assert row["occasion_end"] == (monday + dt.timedelta(days=6)).isoformat()
    assert (row["done"], row["schedule"]["target_count"]) == (1, 3)
    assert row["met"] is False
    assert row["schedule"]["kind"] == "times_per_week"


def test_progress_carries_todays_times_so_the_card_can_show_them(client, user_a):
    habit = _make(client, user_a, target_count=3)
    _check_in(client, user_a, habit["id"], done_at="08:00")
    _check_in(client, user_a, habit["id"], done_at="14:00")

    row = _progress(client, user_a, habit["id"])
    assert row["today_done"] == 2
    assert [one["done_at"] for one in row["today_times"]] == ["08:00:00", "14:00:00"]
    # Enough to take one back without a second request.
    assert all(one["id"] for one in row["today_times"])


def test_the_week_rollup_counts_occasions_not_days(client, user_a):
    """The answer to "what does 3 mean when Tuesday is not a habit day": three is how many
    times the schedule asked this week, not how many days the week has."""
    monday = week_start(TODAY)
    habit = _make(
        client,
        user_a,
        schedule_kind="weekdays",
        weekdays=(1 << 0) | (1 << 2) | (1 << 4),  # Mon, Wed, Fri
        started_on=monday.isoformat(),
    )
    # Check in on every habit day of this week that has already happened.
    asked = [
        monday + dt.timedelta(days=n)
        for n in (0, 2, 4)
        if monday + dt.timedelta(days=n) <= TODAY
    ]
    for day in asked:
        assert _check_in(client, user_a, habit["id"], done_on=day.isoformat()).status_code == 201

    row = _progress(client, user_a, habit["id"])
    assert row["window_start"] == monday.isoformat()
    assert row["window_due"] == 3, "Mon, Wed and Fri, whatever day it is today"
    assert row["window_done"] == len(asked)


def test_a_monthly_habit_has_no_occasion_most_weeks_and_says_when_it_next_does(client, user_a):
    day = 15 if TODAY.day != 15 else 20
    habit = _make(client, user_a, schedule_kind="day_of_month", day_of_month=day)

    row = _progress(client, user_a, habit["id"])
    assert row["due_today"] is False
    assert row["occasion_start"] is None
    assert row["next_due"] is not None
    assert dt.date.fromisoformat(row["next_due"]).day == day
    assert dt.date.fromisoformat(row["next_due"]) > TODAY


def test_changing_the_schedule_re_judges_history_and_moves_no_stored_row(client, user_a):
    """AD-40. Every day recorded keeps its date and its time; only the verdict moves."""
    habit = _make(client, user_a, target_count=3)
    for at in ("08:00", "14:00"):
        _check_in(client, user_a, habit["id"], done_at=at)

    before = _progress(client, user_a, habit["id"])
    assert before["met"] is False, "two of three"

    client.patch(
        f"/api/habits/{habit['id']}", json={"target_count": 2}, headers=user_a["headers"]
    )
    after = _progress(client, user_a, habit["id"])
    assert after["met"] is True
    assert after["today_done"] == 2

    rows = client.get(
        f"/api/habits/checkins?habit_id={habit['id']}", headers=user_a["headers"]
    ).json()["items"]
    assert [row["done_at"] for row in rows] == ["08:00:00", "14:00:00"], "nothing was rewritten"


def test_python_and_sql_agree_about_where_a_week_starts(client, user_a, runtime_connection):
    """The Monday assumption, held by an assertion rather than by a comment. Made to fail by
    starting the Python week on Sunday: this went red before any streak test did."""
    conn = runtime_connection(user_a["id"])
    try:
        for offset in range(-8, 1):
            day = TODAY + dt.timedelta(days=offset)
            in_sql = conn.execute(
                text("SELECT CAST(date_trunc('week', CAST(:d AS date)) AS date)"), {"d": day}
            ).scalar_one()
            assert in_sql == week_start(day), day
    finally:
        conn.close()


# ------------------------------------------------------------------ heatmap


def test_the_heatmap_covers_whole_weeks_and_marks_the_days_that_were_due(client, user_a):
    """Every day in the window, not only the ones with check-ins — otherwise the grid cannot
    tell a missed Monday from a Tuesday that was never a habit day."""
    monday = week_start(TODAY)
    habit = _make(
        client,
        user_a,
        schedule_kind="weekdays",
        weekdays=(1 << 0) | (1 << 2),  # Monday and Wednesday
        started_on=(monday - dt.timedelta(weeks=1)).isoformat(),
    )
    _check_in(client, user_a, habit["id"], done_on=monday.isoformat())

    data = client.get(
        f"/api/habits/{habit['id']}/heatmap?weeks=2", headers=user_a["headers"]
    ).json()
    assert data["start_on"] == (monday - dt.timedelta(weeks=1)).isoformat()
    assert data["end_on"] == (monday + dt.timedelta(days=7)).isoformat()
    assert len(data["days"]) == 14, "every day of both weeks"

    by_day = {row["on"]: row for row in data["days"]}
    assert by_day[monday.isoformat()]["times"] == 1
    assert by_day[monday.isoformat()]["due"] is True
    tuesday = (monday + dt.timedelta(days=1)).isoformat()
    assert by_day[tuesday]["due"] is False, "never a habit day, so never a miss"
    # A day in the future is not yet due, however scheduled it is.
    assert all(
        row["due"] is False for row in data["days"] if dt.date.fromisoformat(row["on"]) > TODAY
    )


def test_an_absurd_heatmap_window_is_refused(client, user_a):
    habit = _make(client, user_a)
    assert client.get(
        f"/api/habits/{habit['id']}/heatmap?weeks=0", headers=user_a["headers"]
    ).status_code == 422
    assert client.get(
        f"/api/habits/{habit['id']}/heatmap?weeks=999", headers=user_a["headers"]
    ).status_code == 422


# ------------------------------------------------------------------- digest


def test_the_digest_only_names_habits_that_asked_to_be_reminded(client, user_a):
    from app.core.db import tenant_session

    _make(client, user_a, name="Quiet")
    _make(client, user_a, name="Loud", remind=True)

    with tenant_session(user_a["id"]) as session:
        assert habits_service.outstanding(session, user_a["id"]) == ["Loud"]


def test_the_digest_stays_quiet_on_a_day_the_schedule_does_not_ask_for(client, user_a):
    """Epic 26's other headline. A Monday-Wednesday-Friday habit no longer nags on a
    Tuesday. Made to fail by keeping Epic 23's predicate, which asked only whether the
    period was met: the name appeared every single evening."""
    from app.core.db import tenant_session

    tomorrow_only = 1 << ((TODAY.weekday() + 1) % 7)
    _make(client, user_a, name="Not today", schedule_kind="weekdays", weekdays=tomorrow_only,
          remind=True)
    _make(client, user_a, name="Today", schedule_kind="weekdays",
          weekdays=1 << TODAY.weekday(), remind=True)

    with tenant_session(user_a["id"]) as session:
        assert habits_service.outstanding(session, user_a["id"]) == ["Today"]
