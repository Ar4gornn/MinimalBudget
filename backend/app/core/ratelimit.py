"""Login rate limiting and lockout (Story 7.2, AD-26).

Deliberately in-process and in-memory. That has a real consequence, stated here rather than
discovered later: **the counters reset when the API restarts, and each replica keeps its
own.** For a single-container family instance that is honest and sufficient. Anything more —
Redis, a database table — is a dependency this deployment does not otherwise need, and a
database-backed limiter would also hand an attacker a cheap write amplification.

Two keys are counted independently, because either alone is evadable:

* per email, so one account cannot be ground down;
* per source address, so an attacker cannot spread a spray across many emails.
"""

import threading
import time
from dataclasses import dataclass, field


@dataclass
class _Bucket:
    failures: int = 0
    locked_until: float = 0.0
    first_failure: float = field(default_factory=time.monotonic)


class LoginLimiter:
    def __init__(self, *, max_attempts: int, lockout_seconds: int) -> None:
        self._max = max_attempts
        self._lockout = lockout_seconds
        self._buckets: dict[str, _Bucket] = {}
        # Uvicorn runs sync endpoints in a thread pool, so two failed logins really can
        # land concurrently.
        self._lock = threading.Lock()

    # time.monotonic, never wall clock: a clock adjustment must not shorten a lockout.
    def _now(self) -> float:
        return time.monotonic()

    def retry_after(self, key: str) -> int | None:
        """Seconds remaining, or None if the key is free to try."""
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                return None
            remaining = bucket.locked_until - self._now()
            return int(remaining) + 1 if remaining > 0 else None

    def record_failure(self, key: str) -> None:
        with self._lock:
            now = self._now()
            bucket = self._buckets.get(key)
            if bucket is None or now - bucket.first_failure > self._lockout:
                # First failure, or the previous window has aged out.
                bucket = _Bucket(first_failure=now)
                self._buckets[key] = bucket
            bucket.failures += 1
            if bucket.failures >= self._max:
                bucket.locked_until = now + self._lockout

    def clear(self, key: str) -> None:
        """A successful login forgives that key's history."""
        with self._lock:
            self._buckets.pop(key, None)

    def reset(self) -> None:
        """Tests only."""
        with self._lock:
            self._buckets.clear()


def source_key(client_host: str | None) -> str:
    return f"ip:{client_host or 'unknown'}"


def email_key(email: str) -> str:
    return f"email:{email.strip().lower()}"
