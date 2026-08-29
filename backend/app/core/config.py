"""Settings, per AD-15: every value arrives from the environment, nothing has a working default."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PLACEHOLDER_SECRETS = frozenset(
    {"changeme", "change_me", "change-me", "secret", "placeholder", "password", "todo", "xxx"}
)

# app/core/config.py -> app -> backend -> repository root, where .env and docker-compose live.
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Anchored to the repository, so the API behaves the same whether it is started
        # from backend/, from the root, or from inside a container.
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # No default: a missing DATABASE_URL fails startup rather than pointing somewhere surprising.
    database_url: PostgresDsn
    secret_key: str = Field(min_length=32)
    access_token_ttl_minutes: int = Field(default=60, gt=0)
    cors_origins: str = ""

    # mode="before" matters. A field_validator defaults to running *after* the field's
    # constraints, and every literal below is shorter than 32 characters — so min_length
    # rejected them first and this check never ran at all. It looked like a guard and was
    # dead code.
    @field_validator("secret_key", mode="before")
    @classmethod
    def _reject_obvious_non_secrets(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        candidate = v.strip()
        if candidate.lower() in _PLACEHOLDER_SECRETS:
            raise ValueError(
                "SECRET_KEY is a placeholder. Generate one with: "
                "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        # The obvious way to satisfy a length rule without generating anything is to pad:
        # "0" * 32, or a placeholder word repeated. Those clear min_length and are not
        # secrets. A real token_urlsafe value has ~20+ distinct characters in its first 32.
        if len(candidate) >= 16 and len(set(candidate)) < 8:
            raise ValueError(
                "SECRET_KEY has too few distinct characters to be randomly generated. "
                "Generate one with: "
                "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sqlalchemy_url(self) -> str:
        return str(self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
