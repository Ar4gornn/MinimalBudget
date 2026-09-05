"""Epic 12 — recovery codes, forgot-password, and change-password.

The properties that matter: a code works once; unknown email, wrong code and spent code are
refused identically; every session dies with the password; and the one function that can
write a hash refuses any tenant but its own (AD-32).
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError

from app.api.auth import recovery_limiter
from app.core.config import get_settings
from app.services.recovery import CODE_COUNT, hash_code, normalise

NEW_PASSWORD = "a-brand-new-password"


@pytest.fixture(autouse=True)
def _fresh_limiter():
    recovery_limiter.reset()
    yield
    recovery_limiter.reset()


def _codes(client, user, password=None):
    response = client.post(
        "/api/auth/me/recovery-codes",
        json={"password": password or user["password"]},
        headers=user["headers"],
    )
    assert response.status_code == 200, response.text
    return response.json()["codes"]


def _recover(client, email, code, new_password=NEW_PASSWORD):
    return client.post(
        "/api/auth/recover", json={"email": email, "code": code, "new_password": new_password}
    )


def _login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


# ------------------------------------------------------------- codes


def test_codes_are_generated_eight_at_a_time_and_stored_only_as_hashes(
    client, user_a, owner_engine
):
    codes = _codes(client, user_a)
    assert len(codes) == CODE_COUNT
    assert len(set(codes)) == CODE_COUNT
    for code in codes:
        assert len(normalise(code)) == 10
        assert not any(ch in "01ilo" for ch in normalise(code))
    with owner_engine.connect() as conn:
        stored = set(conn.execute(text("SELECT code_hash FROM recovery_codes")).scalars())
    assert stored == {hash_code(c) for c in codes}
    assert not stored & set(codes)


def test_generating_codes_needs_the_current_password(client, user_a):
    response = client.post(
        "/api/auth/me/recovery-codes",
        json={"password": "not-the-password"},
        headers=user_a["headers"],
    )
    assert response.status_code == 403
    status = client.get("/api/auth/me/recovery-codes", headers=user_a["headers"]).json()
    assert status == {"unused": 0, "total": 0}


def test_status_counts_unused_codes(client, user_a):
    codes = _codes(client, user_a)
    assert client.get("/api/auth/me/recovery-codes", headers=user_a["headers"]).json() == {
        "unused": CODE_COUNT,
        "total": CODE_COUNT,
    }
    assert _recover(client, user_a["email"], codes[0]).status_code == 204
    # The reset revoked every session, so the status read needs a fresh sign-in.
    access = _login(client, user_a["email"], NEW_PASSWORD).json()["access_token"]
    headers = {"Authorization": f"Bearer {access}"}
    assert client.get("/api/auth/me/recovery-codes", headers=headers).json() == {
        "unused": CODE_COUNT - 1,
        "total": CODE_COUNT,
    }


def test_regenerating_replaces_the_old_set(client, user_a):
    old = _codes(client, user_a)
    new = _codes(client, user_a)
    assert not set(old) & set(new)
    assert _recover(client, user_a["email"], old[0]).status_code == 401
    assert _recover(client, user_a["email"], new[0]).status_code == 204


# ------------------------------------------------------------- recovery


def test_a_code_resets_the_password_once_and_signs_every_session_out(client, user_a):
    codes = _codes(client, user_a)
    first = _login(client, user_a["email"], user_a["password"]).json()
    other_device = _login(client, user_a["email"], user_a["password"]).json()

    assert _recover(client, user_a["email"], codes[0]).status_code == 204

    # The new password works, the old one does not.
    assert _login(client, user_a["email"], NEW_PASSWORD).status_code == 200
    assert _login(client, user_a["email"], user_a["password"]).status_code == 401
    # Every earlier session is gone, whichever device held it.
    for body in (first, other_device):
        refresh = client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]})
        assert refresh.status_code == 401
    # A code is single-use.
    assert _recover(client, user_a["email"], codes[0], "yet-another-password").status_code == 401
    assert _login(client, user_a["email"], NEW_PASSWORD).status_code == 200


def test_codes_are_forgiving_about_case_spaces_and_the_dash(client, user_a):
    code = _codes(client, user_a)[0]
    mangled = "  " + code.upper().replace("-", " ") + " "
    assert _recover(client, user_a["email"], mangled).status_code == 204


def test_unknown_email_wrong_code_and_spent_code_are_indistinguishable(client, user_a):
    codes = _codes(client, user_a)
    _recover(client, user_a["email"], codes[1])
    responses = [
        _recover(client, "nobody@example.com", codes[0]),
        _recover(client, user_a["email"], "aaaaa-aaaaa"),
        _recover(client, user_a["email"], codes[1]),  # spent
    ]
    assert {r.status_code for r in responses} == {401}
    assert len({r.json()["detail"] for r in responses}) == 1


def test_the_new_password_is_validated(client, user_a):
    code = _codes(client, user_a)[0]
    assert _recover(client, user_a["email"], code, "short").status_code == 422
    # And the code was not spent by a request that failed validation.
    assert _recover(client, user_a["email"], code).status_code == 204


def test_repeated_failures_lock_recovery_for_that_email(client, user_a):
    _codes(client, user_a)
    for _ in range(get_settings().login_max_attempts):
        assert _recover(client, user_a["email"], "wrong-wrong").status_code == 401
    locked = _recover(client, user_a["email"], "wrong-wrong")
    assert locked.status_code == 429
    assert "Retry-After" in locked.headers
    # Recovery lockout does not lock login, and vice versa.
    assert _login(client, user_a["email"], user_a["password"]).status_code == 200


def test_a_user_cannot_redeem_another_users_code(client, user_a, user_b):
    code_of_a = _codes(client, user_a)[0]
    assert _recover(client, user_b["email"], code_of_a).status_code == 401
    assert _login(client, user_a["email"], user_a["password"]).status_code == 200


# ------------------------------------------------------- change password


def test_change_password_needs_the_current_one_and_signs_everything_out(client, user_a):
    other = _login(client, user_a["email"], user_a["password"]).json()
    wrong = client.post(
        "/api/auth/me/password",
        json={"current_password": "not-it-at-all", "new_password": NEW_PASSWORD},
        headers=user_a["headers"],
    )
    assert wrong.status_code == 403

    changed = client.post(
        "/api/auth/me/password",
        json={"current_password": user_a["password"], "new_password": NEW_PASSWORD},
        headers=user_a["headers"],
    )
    assert changed.status_code == 204, changed.text
    assert _login(client, user_a["email"], NEW_PASSWORD).status_code == 200
    assert _login(client, user_a["email"], user_a["password"]).status_code == 401
    assert (
        client.post("/api/auth/refresh", json={"refresh_token": other["refresh_token"]}).status_code
        == 401
    )


def test_change_password_requires_authentication(client):
    response = client.post(
        "/api/auth/me/password", json={"current_password": "x", "new_password": NEW_PASSWORD}
    )
    assert response.status_code == 401


# --------------------------------------------------------------- AD-32


def test_the_runtime_role_still_cannot_write_a_hash_directly(user_a, runtime_connection):
    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(ProgrammingError):
            conn.execute(
                text("UPDATE users SET password_hash = 'x' WHERE id = :id"),
                {"id": str(user_a["id"])},
            )
    finally:
        conn.close()


def test_the_password_function_refuses_any_tenant_but_its_own(user_a, user_b, runtime_connection):
    """The function runs as the owner, so this check is the only thing between a
    compromised API and everyone's password."""
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises(ProgrammingError) as exc:
            conn.execute(
                text("SELECT auth_set_password(CAST(:uid AS uuid), 'x')"),
                {"uid": str(user_a["id"])},
            )
        assert "not the current tenant" in str(exc.value)
    finally:
        conn.close()

    conn = runtime_connection(None)
    try:
        with pytest.raises(ProgrammingError):
            conn.execute(
                text("SELECT auth_set_password(CAST(:uid AS uuid), 'x')"),
                {"uid": str(user_a["id"])},
            )
    finally:
        conn.close()


def test_b_sees_none_of_as_codes(client, user_a, user_b, runtime_connection):
    _codes(client, user_a)
    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(text("SELECT count(*) FROM recovery_codes")).scalar_one() == 0
    finally:
        conn.close()
    assert client.get("/api/auth/me/recovery-codes", headers=user_b["headers"]).json() == {
        "unused": 0,
        "total": 0,
    }


def test_the_operator_can_issue_a_code_that_works_once(client, user_a, capsys):
    """The console fallback for someone who lost their codes too."""
    import recovery as operator_tool

    assert operator_tool.issue(user_a["email"]) == 0
    printed = capsys.readouterr().out
    code = next(
        line.split(":")[-1].strip() for line in printed.splitlines() if "Recovery code" in line
    )
    assert _recover(client, user_a["email"], code).status_code == 204
    assert _recover(client, user_a["email"], code, "yet-another-password").status_code == 401
    assert _login(client, user_a["email"], NEW_PASSWORD).status_code == 200


def test_the_operator_tool_refuses_an_unknown_account(capsys):
    import recovery as operator_tool

    assert operator_tool.issue("nobody@example.com") == 1
    assert "No account" in capsys.readouterr().err
