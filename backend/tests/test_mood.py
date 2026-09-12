"""Epic 24 — the day's two answers, and the counts over them.

Every figure asserted below is worked out by hand in a comment first, so a wrong window or a
wrong FILTER is caught by a number rather than by somebody reading the SQL in six months.

Mutations that were run to prove these are not decoration are recorded on the tests they
turned red.
"""

import datetime as dt

TODAY = dt.date.today()


def iso(offset: int = 0) -> str:
    return (TODAY + dt.timedelta(days=offset)).isoformat()


def put(client, user, day: str, **body) -> dict:
    response = client.put(f"/api/mood/days/{day}", json=body, headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()


# ------------------------------------------------------------------ one day


def test_a_day_takes_both_answers_and_a_note(client, user_a):
    body = put(client, user_a, iso(), mood=4, day_ok=True, note="long walk")
    assert body == {"on": iso(), "mood": 4, "day_ok": True, "note": "long walk"}

    read = client.get(f"/api/mood/days/{iso()}", headers=user_a["headers"])
    assert read.status_code == 200
    assert read.json() == body


def test_an_unanswered_day_is_200_with_nulls_not_404(client, user_a):
    """A day nobody answered is an answer to "what did they say", not a missing resource.

    404 stays reserved for another user's row or a route that is not there (AD-8), and
    there is no id here to enumerate — a date is not a secret.
    """
    response = client.get(f"/api/mood/days/{iso(-3)}", headers=user_a["headers"])
    assert response.status_code == 200
    assert response.json() == {"on": iso(-3), "mood": None, "day_ok": None, "note": None}


def test_the_two_answers_are_independent(client, user_a):
    """Q4's proof, as data: both off-diagonal evenings are storable.

    Tired but productive is (2, true); cheerful but wasted is (4, false). If the pair were
    two names for one thing, one of these two rows could not exist.
    """
    put(client, user_a, iso(-1), mood=2, day_ok=True)
    put(client, user_a, iso(), mood=4, day_ok=False)

    rows = client.get("/api/mood/days", headers=user_a["headers"]).json()["items"]
    assert [(row["mood"], row["day_ok"]) for row in rows] == [(2, True), (4, False)]


def test_either_answer_alone_is_a_row_and_the_other_stays_null(client, user_a):
    """Three states, not two — and the third is a null, not a false."""
    assert put(client, user_a, iso(), mood=3)["day_ok"] is None
    assert put(client, user_a, iso(-1), day_ok=False)["mood"] is None


def test_answering_again_replaces_the_day_rather_than_adding_a_point(client, user_a):
    """One row per day (AD-41). A second answer overwrites; it does not append.

    Made to fail on purpose by dropping the ``UNIQUE (user_id, on_day)`` and inserting
    unconditionally: the list below came back with two rows for one day, and the strip drew
    the same date twice.
    """
    put(client, user_a, iso(), mood=1, day_ok=False)
    put(client, user_a, iso(), mood=5, day_ok=True, note="it picked up")

    rows = client.get("/api/mood/days", headers=user_a["headers"]).json()["items"]
    assert len(rows) == 1
    assert rows[0] == {"on": iso(), "mood": 5, "day_ok": True, "note": "it picked up"}


def test_put_replaces_rather_than_merges(client, user_a):
    """Absent means "no answer to that question", so an omitted field is cleared.

    That is what makes this a PUT. Made to fail on purpose by writing only the fields the
    request carried: the verdict below survived, and there was then no way to take back a
    "yes" without a third state on the wire.
    """
    put(client, user_a, iso(), mood=4, day_ok=True, note="fine")
    after = put(client, user_a, iso(), mood=2)
    assert after == {"on": iso(), "mood": 2, "day_ok": None, "note": None}


def test_clearing_both_answers_deletes_the_row(client, user_a):
    """"No row" is the only way the data says *did not say* (AD-41).

    Made to fail on purpose by making the clear a no-op and returning the existing row: the
    day stayed in the list, and every count below then had a row that answered nothing.
    """
    put(client, user_a, iso(), mood=3, day_ok=True)
    cleared = put(client, user_a, iso())
    assert cleared == {"on": iso(), "mood": None, "day_ok": None, "note": None}
    assert client.get("/api/mood/days", headers=user_a["headers"]).json()["items"] == []


def test_a_note_alone_is_not_an_answer(client, user_a):
    """A row that annotates a day without answering either question would be a row the
    tally cannot count. The schema's CHECK refuses it; the service clears instead."""
    put(client, user_a, iso(), mood=3)
    assert put(client, user_a, iso(), note="just a thought")["note"] is None
    assert client.get("/api/mood/days", headers=user_a["headers"]).json()["items"] == []


# ----------------------------------------------------------------- the rules


def test_a_day_that_has_not_happened_is_refused(client, user_a):
    """There is no answer about tomorrow. Enforced in the service, because
    ``CHECK (on_day <= current_date)`` is refused by Postgres — ``current_date`` is not
    IMMUTABLE, the same wall ``habit_checkins.done_on`` hit.

    Made to fail on purpose by relaxing ``>`` to ``>=``: this test stayed green while
    ``test_today_is_allowed`` and seven others turned red, which is the pair that pins
    the boundary — one test alone could be satisfied by refusing every day.
    """
    response = client.put(
        f"/api/mood/days/{iso(1)}", json={"mood": 3}, headers=user_a["headers"]
    )
    assert response.status_code == 422
    assert "has not happened" in response.json()["detail"]


def test_today_is_allowed(client, user_a):
    assert put(client, user_a, iso(), mood=3)["mood"] == 3


def test_a_past_day_is_a_backfill_not_an_error(client, user_a):
    """Unlike a habit check-in there is no ``started_on`` to bound the past: a mood has no
    plan behind it, so writing down how a day last month felt is legitimate."""
    assert put(client, user_a, iso(-40), mood=2)["on"] == iso(-40)


def test_a_day_before_the_sanity_floor_is_422_not_500(client, user_a):
    """The schema's floor guarded in the service too, so a hand-typed year answers with a
    sentence instead of an IntegrityError."""
    response = client.put(
        "/api/mood/days/1999-12-31", json={"mood": 3}, headers=user_a["headers"]
    )
    assert response.status_code == 422


def test_a_point_off_the_scale_is_refused(client, user_a):
    for point in (0, 6, -1):
        response = client.put(
            f"/api/mood/days/{iso()}", json={"mood": point}, headers=user_a["headers"]
        )
        assert response.status_code == 422, point


# --------------------------------------------------------------- the history


def test_history_counts_days_and_zero_fills_every_point(client, user_a):
    """Hand-computed. Five answered days in the last week:

        today-4: mood 5      today-3: mood 5      today-2: mood 2
        today-1: mood 2      today:   mood 3

    so the tally over points 1..5 is [0, 2, 1, 0, 2] — points 1 and 4 must appear at zero
    rather than vanish, which is the LEFT JOIN direction of AD-22.

    Made to fail on purpose by counting with ``GROUP BY mood`` over the rows instead of
    joining from the points side: the response came back with three entries and the client
    had to guess which two were missing.
    """
    for offset, point in ((-4, 5), (-3, 5), (-2, 2), (-1, 2), (0, 3)):
        put(client, user_a, iso(offset), mood=point)

    body = client.get("/api/mood/history?days=7", headers=user_a["headers"]).json()
    assert [row["days"] for row in body["counts"]] == [0, 2, 1, 0, 2]
    assert [row["point"] for row in body["counts"]] == [1, 2, 3, 4, 5]
    assert body["days_with_mood"] == 5
    assert body["days_answered"] == 5


def test_history_window_is_the_last_n_days_ending_today(client, user_a):
    """Half-open ``[start_on, end_on)``, so ``end_on`` is tomorrow and today is inside it.

    With ``days=7`` the window is today-6 .. today inclusive, which is 7 days. A day at
    today-7 is outside it. Hand-computed: two answers, one in, one out.
    """
    put(client, user_a, iso(-6), mood=1)
    put(client, user_a, iso(-7), mood=5)

    body = client.get("/api/mood/history?days=7", headers=user_a["headers"]).json()
    assert body["start_on"] == iso(-6)
    assert body["end_on"] == iso(1)
    assert [row["on"] for row in body["days"]] == [iso(-6)]
    assert body["days_answered"] == 1


def test_history_does_not_count_a_missing_verdict_as_no(client, user_a):
    """The three states of a nullable boolean, kept apart.

    Hand-computed over three answered days: one said yes, one said no, one answered only
    the mood. So days_ok = 1, days_not_ok = 1, days_answered = 3 — and 1 + 1 != 3 on
    purpose, because the third day did not say.

    Made to fail on purpose by writing the filter as ``day_ok IS NOT TRUE``: days_not_ok
    came back 2, and the tally then reported a day as a bad one because nobody answered it.
    """
    put(client, user_a, iso(-2), mood=4, day_ok=True)
    put(client, user_a, iso(-1), mood=2, day_ok=False)
    put(client, user_a, iso(), mood=3)

    body = client.get("/api/mood/history?days=30", headers=user_a["headers"]).json()
    assert (body["days_ok"], body["days_not_ok"], body["days_answered"]) == (1, 1, 3)


def test_history_is_empty_rather_than_zero_filled_by_day(client, user_a):
    """A day with no row is not a zero: the strip must be able to draw a gap."""
    body = client.get("/api/mood/history", headers=user_a["headers"]).json()
    assert body["days"] == []
    assert body["days_answered"] == 0
    assert [row["days"] for row in body["counts"]] == [0, 0, 0, 0, 0]


def test_history_window_is_bounded(client, user_a):
    headers = user_a["headers"]
    assert client.get("/api/mood/history?days=0", headers=headers).status_code == 422
    assert client.get("/api/mood/history?days=366", headers=headers).status_code == 422
    assert client.get("/api/mood/history?days=365", headers=headers).status_code == 200


# ------------------------------------------------- the calendar's month read


def test_the_month_read_uses_the_accounts_budget_month(client, user_a):
    """AD-10. With a start day of 26, "2026-08" is 26 July to 25 August, so the calendar
    grid and this list cover exactly the same days.

    Hand-computed: 2026-07-25 is the day before the period opens and must be excluded;
    2026-07-26 is its first day and 2026-08-25 its last, so both are in. A period wholly in
    the past, because an answer about a day that has not happened is refused.
    """
    headers = user_a["headers"]
    assert (
        client.patch(
            "/api/auth/me/budget-start-day", json={"budget_start_day": 26}, headers=headers
        ).status_code
        == 200
    )
    for day in ("2026-07-25", "2026-07-26", "2026-08-25"):
        put(client, user_a, day, mood=3)

    rows = client.get("/api/mood/days?month=2026-08", headers=headers).json()["items"]
    assert [row["on"] for row in rows] == ["2026-07-26", "2026-08-25"]


def test_a_malformed_month_is_422(client, user_a):
    response = client.get("/api/mood/days?month=september", headers=user_a["headers"])
    assert response.status_code == 422


# -------------------------------------------------------------------- export


def test_mood_exports_as_csv_with_the_scale_named_in_the_header(client, user_a):
    """The most personal file in the system leaves like every other one. The words for the
    faces are not repeated here — the header names the scale instead (AD-42)."""
    put(client, user_a, iso(-1), mood=5, day_ok=True, note="good one")
    put(client, user_a, iso(), mood=2)

    response = client.get("/api/export/mood.csv", headers=user_a["headers"])
    assert response.status_code == 200
    lines = response.text.strip().splitlines()
    assert lines[0] == "date,mood_1_to_5,day_was_good,note"
    assert lines[1] == f"{iso(-1)},5,yes,good one"
    # An unanswered verdict is an empty cell, never "no".
    assert lines[2] == f"{iso()},2,,"


def test_a_note_cannot_become_a_spreadsheet_formula(client, user_a):
    """Epic 16's rule, unchanged by a new file."""
    put(client, user_a, iso(), mood=3, note='=HYPERLINK("http://evil","click")')
    body = client.get("/api/export/mood.csv", headers=user_a["headers"]).text
    assert "\"'=HYPERLINK" in body
