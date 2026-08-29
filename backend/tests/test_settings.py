"""AD-15 — every value arrives from the environment; nothing has a working default.

``conftest.py`` already rewrites DATABASE_URL/MIGRATION_DATABASE_URL in ``os.environ`` before
the app is imported, and the repository's real ``.env`` sits right above ``backend/``. Both are
sources ``Settings`` would otherwise read. Every test below passes ``_env_file=None`` to skip
the dotenv file and ``monkeypatch.delenv``/``setenv`` to control the process environment, so a
"missing secret" assertion cannot pass by accident just because some other source filled it in.
"""

import pytest
from pydantic import ValidationError

from app.core.config import Settings

VALID_DATABASE_URL = "postgresql+psycopg://user:pass@localhost:5432/moneymap"
# A real token_urlsafe-shaped value. "x" * 32 would clear min_length and is deliberately
# rejected as too low-entropy to be generated, so it cannot serve as the valid fixture.
VALID_SECRET_KEY = "Xk3n9QwRt7ZbLmVp2ScFdEgHjKlNoPqR"

# Settings reads these case-insensitively (pydantic-settings default), same casing as .env.
_SETTINGS_ENV_VARS = ("SECRET_KEY", "DATABASE_URL", "CORS_ORIGINS", "ACCESS_TOKEN_TTL_MINUTES")


def _clear_settings_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in _SETTINGS_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


def test_settings_raises_without_a_secret_key(monkeypatch):
    _clear_settings_env(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", VALID_DATABASE_URL)

    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=None)
    assert "secret_key" in str(exc.value)


def test_settings_raises_without_a_database_url(monkeypatch):
    _clear_settings_env(monkeypatch)
    monkeypatch.setenv("SECRET_KEY", VALID_SECRET_KEY)

    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=None)
    assert "database_url" in str(exc.value)


@pytest.mark.parametrize("placeholder", ["changeme", "CHANGE_ME", "Secret", "PLACEHOLDER"])
def test_settings_rejects_a_known_placeholder_secret(monkeypatch, placeholder):
    # These are all under 32 characters, so min_length would reject them anyway. The
    # validator runs in mode="before" precisely so the caller gets "this is a placeholder"
    # rather than "too short", which is the difference between a fixable message and a
    # confusing one.
    _clear_settings_env(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", VALID_DATABASE_URL)
    monkeypatch.setenv("SECRET_KEY", placeholder)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_settings_rejects_a_secret_shorter_than_32_characters(monkeypatch):
    _clear_settings_env(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", VALID_DATABASE_URL)
    monkeypatch.setenv("SECRET_KEY", VALID_SECRET_KEY[:31])

    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=None)
    assert "secret_key" in str(exc.value)


def test_cors_origin_list_splits_and_trims_a_comma_separated_string():
    settings = Settings(
        _env_file=None,
        database_url=VALID_DATABASE_URL,
        secret_key=VALID_SECRET_KEY,
        cors_origins=" http://localhost:5173 ,http://example.com,,",
    )
    assert settings.cors_origin_list == ["http://localhost:5173", "http://example.com"]


def test_cors_origin_list_is_empty_for_an_empty_string():
    settings = Settings(
        _env_file=None,
        database_url=VALID_DATABASE_URL,
        secret_key=VALID_SECRET_KEY,
        cors_origins="",
    )
    assert settings.cors_origin_list == []


@pytest.mark.parametrize(
    "padded",
    ["0" * 32, "a" * 40, "changeme" * 4, "secret" * 6],
    ids=["repeated-zero", "repeated-letter", "repeated-changeme", "repeated-secret"],
)
def test_settings_rejects_a_secret_padded_to_satisfy_the_length_rule(monkeypatch, padded):
    """The obvious way to clear a length rule without generating anything is to repeat.

    Every value here is at least 32 characters, so min_length passes it. Each was accepted
    before the validator was moved to mode="before" and given the distinct-character check.
    """
    _clear_settings_env(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", VALID_DATABASE_URL)
    monkeypatch.setenv("SECRET_KEY", padded)

    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=None)
    assert "secret_key" in str(exc.value)


def test_a_generated_secret_is_accepted(monkeypatch):
    """Guards the guard: the rules above must not reject a real token_urlsafe value."""
    import secrets

    _clear_settings_env(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", VALID_DATABASE_URL)
    for _ in range(20):
        monkeypatch.setenv("SECRET_KEY", secrets.token_urlsafe(48))
        Settings(_env_file=None)
