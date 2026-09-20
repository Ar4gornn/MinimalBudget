"""The guided tour's two columns (Epic 30, story 30.1).

Whether the tour opens is decided by the client from two facts the account carries:
`tutorial_completed` and `tutorial_skipped_at`. Both are false/null on a new account —
that is who the tour is for — and the client marks the outcome through one endpoint.
The server keeps the time; the client only says which way it ended.
"""

from sqlalchemy import text

from tests.conftest import register_user


def _profile(client, user):
    return client.get("/api/auth/me", headers=user["headers"]).json()


def _end(client, user, outcome):
    return client.patch(
        "/api/auth/me/tutorial", json={"outcome": outcome}, headers=user["headers"]
    )


def test_a_new_account_has_not_seen_the_tour(client):
    """The acceptance criterion the whole epic hangs on: if this were true at sign-up,
    nobody would ever see it."""
    created = client.post(
        "/api/auth/register", json={"email": "new@example.com", "password": "correct-horse-battery"}
    )
    assert created.status_code == 201
    assert created.json()["tutorial_completed"] is False
    assert created.json()["tutorial_skipped_at"] is None


def test_completing_it_sticks_across_sign_ins(client):
    """On the account, not the device: signing in again — a different browser, as far as
    the server can tell — must not welcome the same person twice."""
    user = register_user(client, "done@example.com")
    ended = _end(client, user, "completed")
    assert ended.status_code == 200
    assert ended.json()["tutorial_completed"] is True
    assert ended.json()["tutorial_skipped_at"] is None

    again = client.post(
        "/api/auth/login", json={"email": "done@example.com", "password": user["password"]}
    ).json()
    profile = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {again['access_token']}"}
    ).json()
    assert profile["tutorial_completed"] is True


def test_skipping_stamps_the_time_and_leaves_the_flag(client, user_a):
    """Skipped is not completed. The flag stays false so a later replay that *does* finish
    is recorded as such, and the timestamp is the product's one fact about where people
    give up."""
    ended = _end(client, user_a, "skipped")
    assert ended.status_code == 200
    assert ended.json()["tutorial_completed"] is False
    assert ended.json()["tutorial_skipped_at"] is not None

    # Server time, not whatever the request carried: the payload has no timestamp field
    # at all, and sending one changes nothing.
    smuggled = client.patch(
        "/api/auth/me/tutorial",
        json={"outcome": "skipped", "tutorial_skipped_at": "1999-01-01T00:00:00Z"},
        headers=user_a["headers"],
    )
    assert smuggled.status_code == 200
    assert not smuggled.json()["tutorial_skipped_at"].startswith("1999")


def test_a_replay_can_finish_what_a_skip_left(client, user_a):
    """Settings offers the tour again. Skipping once must not make finishing impossible,
    and finishing must be idempotent — a second Done is a 200, not a 409."""
    _end(client, user_a, "skipped")
    assert _end(client, user_a, "completed").json()["tutorial_completed"] is True
    profile = _profile(client, user_a)
    assert profile["tutorial_completed"] is True
    assert profile["tutorial_skipped_at"] is not None
    assert _end(client, user_a, "completed").status_code == 200


def test_an_unknown_outcome_is_refused(client, user_a):
    assert _end(client, user_a, "later").status_code == 422
    assert client.patch(
        "/api/auth/me/tutorial", json={}, headers=user_a["headers"]
    ).status_code == 422


def test_it_needs_a_session(client):
    assert client.patch("/api/auth/me/tutorial", json={"outcome": "completed"}).status_code == 401


def test_one_accounts_tour_is_not_anothers(client, user_a, user_b):
    _end(client, user_a, "completed")
    assert _profile(client, user_b)["tutorial_completed"] is False


def test_the_runtime_role_can_read_and_write_the_columns(user_a, runtime_connection):
    """AD-19: users is read by named columns, so a column the migration forgot to GRANT
    would fail every profile read, not just this feature. Pinned here so the grant loop
    in 0022 cannot be trimmed without a red test."""
    conn = runtime_connection(user_a["id"])
    try:
        conn.execute(
            text("UPDATE users SET tutorial_completed = true WHERE id = :id"),
            {"id": user_a["id"]},
        )
        row = conn.execute(
            text("SELECT tutorial_completed, tutorial_skipped_at FROM users WHERE id = :id"),
            {"id": user_a["id"]},
        ).one()
        assert row == (True, None)
    finally:
        conn.rollback()
        conn.close()
