"""Epic 19 — exercises, routines and the workout log.

The properties worth pinning: a routine is a plan and a workout is a record, so neither
deletes the other; a set is the level at which "am I getting stronger?" has an answer; and a
video link is user-supplied text that ends up in an anchor, so its scheme is not negotiable.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.errors import Invalid
from app.services.gym import clean_video_url


def _exercise(client, user, name="Bench press", **extra):
    return client.post(
        "/api/gym/exercises", json={"name": name, **extra}, headers=user["headers"]
    ).json()


def _routine(client, user, name="Push day"):
    return client.post("/api/gym/routines", json={"name": name}, headers=user["headers"]).json()


def _line(client, user, routine_id, **body):
    return client.post(
        f"/api/gym/routines/{routine_id}/exercises", json=body, headers=user["headers"]
    )


def _workout(client, user, **body):
    return client.post("/api/gym/workouts", json=body, headers=user["headers"]).json()


def _set(client, user, workout_id, **body):
    return client.post(f"/api/gym/workouts/{workout_id}/sets", json=body, headers=user["headers"])


# ---------------------------------------------------------------- exercises


def test_an_exercise_is_created_by_name_and_reused_case_insensitively(client, user_a):
    first = _exercise(client, user_a, name="Bench press")
    second = _exercise(client, user_a, name="bench PRESS")
    assert first["id"] == second["id"]
    items = client.get("/api/gym/exercises", headers=user_a["headers"]).json()["items"]
    assert [e["name"] for e in items] == ["Bench press"]


@pytest.mark.parametrize(
    "bad",
    [
        "javascript:alert(1)",
        "http://example.com/v",
        "data:text/html,<script>alert(1)</script>",
        "https://user:pass@example.com/v",
        "not a url at all",
    ],
)
def test_a_video_link_that_is_not_plain_https_is_refused(bad):
    """It ends up in an anchor someone taps. `javascript:` must never get that far."""
    with pytest.raises(Invalid):
        clean_video_url(bad)


def test_a_good_video_link_is_kept_and_a_blank_one_clears(client, user_a):
    exercise = _exercise(client, user_a, video_url="https://www.youtube.com/watch?v=abc123")
    assert exercise["video_url"] == "https://www.youtube.com/watch?v=abc123"

    url = f"/api/gym/exercises/{exercise['id']}"
    cleared = client.patch(url, json={"video_url": None}, headers=user_a["headers"])
    assert cleared.json()["video_url"] is None

    refused = client.patch(
        url, json={"video_url": "javascript:alert(1)"}, headers=user_a["headers"]
    )
    assert refused.status_code == 422


def test_the_database_refuses_a_non_https_link_too(client, user_a, runtime_connection):
    exercise = _exercise(client, user_a)
    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text("UPDATE exercises SET video_url = 'http://evil' WHERE id = :id"),
                {"id": exercise["id"]},
            )
    finally:
        conn.close()


def test_an_exercise_in_use_cannot_be_deleted(client, user_a):
    exercise = _exercise(client, user_a)
    routine = _routine(client, user_a)
    _line(client, user_a, routine["id"], exercise_id=exercise["id"])

    url = f"/api/gym/exercises/{exercise['id']}"
    assert client.delete(url, headers=user_a["headers"]).status_code == 409

    lines = client.get(f"/api/gym/routines/{routine['id']}", headers=user_a["headers"]).json()
    client.delete(f"/api/gym/routines/lines/{lines['lines'][0]['id']}", headers=user_a["headers"])
    assert client.delete(url, headers=user_a["headers"]).status_code == 204


# ----------------------------------------------------------------- routines


def test_a_routine_holds_exercises_in_order_with_targets(client, user_a):
    routine = _routine(client, user_a)
    _line(client, user_a, routine["id"], exercise_name="Bench press", target_sets=4, target_reps=8)
    _line(client, user_a, routine["id"], exercise_name="Overhead press", target_sets=3)

    detail = client.get(f"/api/gym/routines/{routine['id']}", headers=user_a["headers"]).json()
    assert [line["exercise_name"] for line in detail["lines"]] == [
        "Bench press",
        "Overhead press",
    ]
    assert [line["position"] for line in detail["lines"]] == [0, 1]
    assert detail["lines"][0]["target_sets"] == 4
    assert detail["lines"][0]["target_reps"] == 8
    assert detail["lines"][1]["target_reps"] is None


def test_the_same_exercise_twice_in_one_routine_is_refused(client, user_a):
    routine = _routine(client, user_a)
    assert _line(client, user_a, routine["id"], exercise_name="Bench press").status_code == 201
    # "Bench, then bench again" is sets, not two lines.
    assert _line(client, user_a, routine["id"], exercise_name="Bench press").status_code == 409


def test_both_or_neither_exercise_field_is_rejected(client, user_a):
    routine = _routine(client, user_a)
    exercise = _exercise(client, user_a)
    assert (
        _line(
            client, user_a, routine["id"], exercise_id=exercise["id"], exercise_name="Bench press"
        ).status_code
        == 422
    )
    assert _line(client, user_a, routine["id"]).status_code == 422


def test_a_duplicate_routine_name_is_refused(client, user_a):
    _routine(client, user_a, name="Push day")
    again = client.post("/api/gym/routines", json={"name": "Push day"}, headers=user_a["headers"])
    assert again.status_code == 409


# ----------------------------------------------------------------- workouts


def test_a_workout_logs_sets_in_order_and_reports_them(client, user_a):
    workout = _workout(client, user_a, performed_on="2026-09-05")
    _set(client, user_a, workout["id"], exercise_name="Bench press", reps=8, weight="80")
    _set(client, user_a, workout["id"], exercise_name="Bench press", reps=8, weight="82.5")
    # A bodyweight set carries no weight at all — not zero, which would be a weight.
    _set(client, user_a, workout["id"], exercise_name="Pull-up", reps=10)

    detail = client.get(f"/api/gym/workouts/{workout['id']}", headers=user_a["headers"]).json()
    assert [s["position"] for s in detail["sets"]] == [0, 1, 2]
    assert [s["weight"] for s in detail["sets"]] == ["80.00", "82.50", None]
    assert detail["sets"][2]["exercise_name"] == "Pull-up"


def test_starting_from_a_routine_copies_nothing(client, user_a):
    """A target is not a record. The routine prefills the form; a set exists once it was done."""
    routine = _routine(client, user_a)
    _line(client, user_a, routine["id"], exercise_name="Bench press", target_sets=4, target_reps=8)

    workout = _workout(client, user_a, routine_id=routine["id"])
    detail = client.get(f"/api/gym/workouts/{workout['id']}", headers=user_a["headers"]).json()
    assert detail["routine_id"] == routine["id"]
    assert detail["sets"] == []


def test_deleting_a_routine_keeps_the_workouts_done_from_it(client, user_a):
    routine = _routine(client, user_a)
    workout = _workout(client, user_a, routine_id=routine["id"])
    _set(client, user_a, workout["id"], exercise_name="Bench press", reps=5, weight="100")

    assert (
        client.delete(f"/api/gym/routines/{routine['id']}", headers=user_a["headers"]).status_code
        == 204
    )

    detail = client.get(f"/api/gym/workouts/{workout['id']}", headers=user_a["headers"]).json()
    assert detail["routine_id"] is None, "the plan is gone, the record is not"
    assert len(detail["sets"]) == 1


def test_deleting_a_workout_takes_its_sets(client, user_a):
    workout = _workout(client, user_a)
    _set(client, user_a, workout["id"], exercise_name="Bench press", reps=5, weight="100")
    assert (
        client.delete(f"/api/gym/workouts/{workout['id']}", headers=user_a["headers"]).status_code
        == 204
    )
    assert (
        client.get(f"/api/gym/workouts/{workout['id']}", headers=user_a["headers"]).status_code
        == 404
    )


def test_a_weight_must_be_a_decimal_string_not_a_float(client, user_a):
    workout = _workout(client, user_a)
    response = client.post(
        f"/api/gym/workouts/{workout['id']}/sets",
        json={"exercise_name": "Bench press", "reps": 5, "weight": 0.1 + 0.2},
        headers=user_a["headers"],
    )
    assert response.status_code == 422


def test_zero_reps_is_refused_by_validation_and_by_the_database(client, user_a, runtime_connection):
    workout = _workout(client, user_a)
    assert _set(client, user_a, workout["id"], exercise_name="Bench", reps=0).status_code == 422

    exercise = _exercise(client, user_a)
    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO workout_sets (user_id, workout_id, exercise_id, position, reps) "
                    "VALUES (:uid, :wid, :eid, 0, 0)"
                ),
                {"uid": str(user_a["id"]), "wid": workout["id"], "eid": exercise["id"]},
            )
    finally:
        conn.close()


def test_workouts_are_listed_newest_first_and_filterable_by_month(client, user_a):
    _workout(client, user_a, performed_on="2026-08-30")
    _workout(client, user_a, performed_on="2026-09-02")
    _workout(client, user_a, performed_on="2026-09-05")

    listed = client.get("/api/gym/workouts", headers=user_a["headers"]).json()["items"]
    assert [w["performed_on"] for w in listed] == ["2026-09-05", "2026-09-02", "2026-08-30"]

    september = client.get("/api/gym/workouts?month=2026-09", headers=user_a["headers"]).json()
    assert [w["performed_on"] for w in september["items"]] == ["2026-09-05", "2026-09-02"]


# -------------------------------------------------------------- progression


def test_the_history_answers_whether_the_lift_is_going_up(client, user_a):
    """Worked out by hand: two sessions, the second heavier and with more volume."""
    exercise = _exercise(client, user_a, name="Squat")

    first = _workout(client, user_a, performed_on="2026-08-01")
    _set(client, user_a, first["id"], exercise_id=exercise["id"], reps=5, weight="100")
    _set(client, user_a, first["id"], exercise_id=exercise["id"], reps=5, weight="100")

    second = _workout(client, user_a, performed_on="2026-08-08")
    _set(client, user_a, second["id"], exercise_id=exercise["id"], reps=5, weight="105")
    _set(client, user_a, second["id"], exercise_id=exercise["id"], reps=3, weight="110")

    history = client.get(
        f"/api/gym/exercises/{exercise['id']}/history", headers=user_a["headers"]
    ).json()
    assert history["exercise_name"] == "Squat"
    assert [p["performed_on"] for p in history["points"]] == ["2026-08-01", "2026-08-08"]
    assert [p["top_weight"] for p in history["points"]] == ["100.00", "110.00"]
    assert [p["reps"] for p in history["points"]] == [10, 8]
    assert [p["sets"] for p in history["points"]] == [2, 2]
    # 5×100 + 5×100 = 1000; 5×105 + 3×110 = 855.
    assert [p["volume"] for p in history["points"]] == ["1000.00", "855.00"]


def test_a_bodyweight_session_has_no_volume_rather_than_zero(client, user_a):
    exercise = _exercise(client, user_a, name="Pull-up")
    workout = _workout(client, user_a, performed_on="2026-08-01")
    _set(client, user_a, workout["id"], exercise_id=exercise["id"], reps=10)

    history = client.get(
        f"/api/gym/exercises/{exercise['id']}/history", headers=user_a["headers"]
    ).json()
    point = history["points"][0]
    assert point["reps"] == 10
    assert point["volume"] is None, "0.00 would read as having done nothing"
    assert point["top_weight"] is None


# ------------------------------------------------------------ weight unit


def test_the_weight_unit_defaults_to_kg_and_locks_once_anything_is_logged(client, user_a):
    me = client.get("/api/auth/me", headers=user_a["headers"]).json()
    assert me["weight_unit"] == "kg"

    changed = client.patch(
        "/api/auth/me/weight-unit", json={"weight_unit": "lb"}, headers=user_a["headers"]
    )
    assert changed.status_code == 200
    assert changed.json()["weight_unit"] == "lb"

    workout = _workout(client, user_a)
    _set(client, user_a, workout["id"], exercise_name="Bench press", reps=5, weight="100")

    # Same rule as the currency: changing it relabels rather than converts.
    locked = client.patch(
        "/api/auth/me/weight-unit", json={"weight_unit": "kg"}, headers=user_a["headers"]
    )
    assert locked.status_code == 409
    # Setting it to what it already is stays fine.
    assert (
        client.patch(
            "/api/auth/me/weight-unit", json={"weight_unit": "lb"}, headers=user_a["headers"]
        ).status_code
        == 200
    )


def test_an_unsupported_weight_unit_is_refused(client, user_a):
    response = client.patch(
        "/api/auth/me/weight-unit", json={"weight_unit": "stone"}, headers=user_a["headers"]
    )
    assert response.status_code == 422


# ------------------------------------------------------------- isolation


def test_b_sees_none_of_as_training(client, user_a, user_b, runtime_connection):
    exercise = _exercise(client, user_a, name="Squat")
    routine = _routine(client, user_a)
    _line(client, user_a, routine["id"], exercise_id=exercise["id"])
    workout = _workout(client, user_a)
    _set(client, user_a, workout["id"], exercise_id=exercise["id"], reps=5, weight="100")

    assert client.get("/api/gym/exercises", headers=user_b["headers"]).json()["items"] == []
    assert client.get("/api/gym/routines", headers=user_b["headers"]).json()["items"] == []
    assert client.get("/api/gym/workouts", headers=user_b["headers"]).json()["items"] == []
    for url in (
        f"/api/gym/routines/{routine['id']}",
        f"/api/gym/workouts/{workout['id']}",
        f"/api/gym/exercises/{exercise['id']}/history",
    ):
        assert client.get(url, headers=user_b["headers"]).status_code == 404

    conn = runtime_connection(user_b["id"])
    try:
        for table in ("exercises", "routines", "routine_exercises", "workouts", "workout_sets"):
            assert conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one() == 0
    finally:
        conn.close()


def test_b_cannot_log_a_set_against_as_workout_or_exercise(client, user_a, user_b):
    exercise = _exercise(client, user_a)
    workout = _workout(client, user_a)

    assert _set(client, user_b, workout["id"], exercise_name="Bench", reps=5).status_code == 404

    own = _workout(client, user_b)
    assert _set(client, user_b, own["id"], exercise_id=exercise["id"], reps=5).status_code == 404


def test_the_foreign_key_refuses_a_cross_user_set(client, user_a, user_b, runtime_connection):
    exercise = _exercise(client, user_a)
    workout = _workout(client, user_b)

    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO workout_sets (user_id, workout_id, exercise_id, position, reps) "
                    "VALUES (:uid, :wid, :eid, 0, 5)"
                ),
                {"uid": str(user_b["id"]), "wid": workout["id"], "eid": exercise["id"]},
            )
    finally:
        conn.close()
