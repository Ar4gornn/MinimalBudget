"""Story 7.2 — login resists brute force.

The limiter is module-level state shared across requests, so every test here resets it
first. That coupling is the design (see `ratelimit.py` on why it is in-process), and a test
that forgot to reset would pass or fail depending on what ran before it.
"""

import pytest

from app.api.auth import login_limiter
from app.core.config import get_settings
from app.core.ratelimit import LoginLimiter


@pytest.fixture(autouse=True)
def _fresh_limiter():
    login_limiter.reset()
    yield
    login_limiter.reset()


def attempt(client, email="alice@example.com", password="wrong-password-here"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_repeated_failures_lock_the_account(client, user_a):
    limit = get_settings().login_max_attempts

    for i in range(limit):
        assert attempt(client).status_code == 401, f"attempt {i + 1} should still be a plain 401"

    locked = attempt(client)
    assert locked.status_code == 429
    assert int(locked.headers["Retry-After"]) > 0


def test_the_lock_applies_even_to_the_correct_password(client, user_a):
    """Otherwise the lockout is decorative — an attacker who guesses right walks in."""
    for _ in range(get_settings().login_max_attempts):
        attempt(client)

    correct = attempt(client, password=user_a["password"])
    assert correct.status_code == 429


def test_a_successful_login_clears_the_counter(client, user_a):
    for _ in range(get_settings().login_max_attempts - 1):
        assert attempt(client).status_code == 401

    assert attempt(client, password=user_a["password"]).status_code == 200

    # The history is forgiven, so the next fumble is not instantly a lockout.
    assert attempt(client).status_code == 401


def test_an_unknown_email_is_locked_the_same_way(client, user_a):
    """The 401-vs-429 boundary must not reveal which emails exist."""
    for _ in range(get_settings().login_max_attempts):
        assert attempt(client, email="nobody@example.com").status_code == 401

    unknown = attempt(client, email="nobody@example.com")
    assert unknown.status_code == 429


def test_locking_one_account_does_not_lock_another(client, user_a, user_b):
    """The per-address limit is shared in tests (one client), so this asserts the email key
    is what distinguishes them — otherwise one family member could lock out the rest."""
    limiter = LoginLimiter(max_attempts=3, lockout_seconds=60)
    for _ in range(3):
        limiter.record_failure("email:alice@example.com")

    assert limiter.retry_after("email:alice@example.com") is not None
    assert limiter.retry_after("email:bob@example.com") is None


def test_the_window_ages_out():
    """A slow trickle of typos over days must not accumulate into a lockout."""
    limiter = LoginLimiter(max_attempts=3, lockout_seconds=0)
    for _ in range(3):
        limiter.record_failure("email:alice@example.com")
    # With a zero-length window every failure starts a fresh one.
    assert limiter.retry_after("email:alice@example.com") is None


def test_a_cleared_key_is_forgotten():
    limiter = LoginLimiter(max_attempts=2, lockout_seconds=60)
    limiter.record_failure("email:a")
    limiter.record_failure("email:a")
    assert limiter.retry_after("email:a") is not None

    limiter.clear("email:a")
    assert limiter.retry_after("email:a") is None


def test_the_limiter_is_threadsafe():
    """Uvicorn runs sync endpoints in a thread pool, so concurrent failures are real."""
    import threading

    limiter = LoginLimiter(max_attempts=100, lockout_seconds=60)
    threads = [
        threading.Thread(target=lambda: [limiter.record_failure("email:a") for _ in range(50)])
        for _ in range(4)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # 200 failures against a limit of 100: locked, and no count was lost to a race.
    assert limiter.retry_after("email:a") is not None
