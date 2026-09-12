"""Domain errors, translated to status codes in one place (see ``app.main``).

AD-8: anything that belongs to another user is :class:`NotFound`, never a 403. Services
raise these; routers never build status codes from database exceptions.

**Every error carries a code as well as a sentence (AD-44).** The sentence is English and
is a fallback; the code is what the client keys its own wording off, in whatever language
the reader has chosen. A status alone never carries the meaning — a 409 on a habit and a
409 on a category need different words — and translating the server's sentence would make
the API speak the web client's language, which AD-14 says it does not. So the API answers
with a fact, and the client owns every displayed word.

The codes are a wire contract: renaming one is a breaking change, and an unrecognised one
must leave the client showing ``detail`` rather than blank.
"""

from fastapi import HTTPException


class DomainError(Exception):
    """A refusal the domain understands: a sentence, and a stable code for it."""

    #: Used when a raise site has nothing more specific to say.
    default_code = "error"

    def __init__(self, detail: str, code: str | None = None) -> None:
        self.detail = detail
        self.code = code or self.default_code
        super().__init__(detail)


class NotFound(DomainError):
    """Either it does not exist or it is not yours — AD-8 refuses to say which."""

    default_code = "not_found"

    def __init__(self, detail: str = "Not found", code: str | None = None) -> None:
        super().__init__(detail, code)


class Conflict(DomainError):
    """A uniqueness clash, or a delete refused because something still references the row."""

    default_code = "conflict"


class Invalid(DomainError):
    """A request that is well-formed but asks for something the domain forbids."""

    default_code = "invalid"


def refused(status_code: int, code: str, detail: str, **kwargs) -> HTTPException:
    """An :class:`HTTPException` whose body carries a code beside its detail.

    FastAPI puts ``detail`` straight into the response body, so a dict here would nest as
    ``{"detail": {...}}``. The handler in ``app.main`` flattens exactly this shape instead,
    which keeps ``response.json()["detail"]`` a string for every existing caller while
    adding ``["code"]`` beside it.
    """
    return HTTPException(
        status_code=status_code, detail={"detail": detail, "code": code}, **kwargs
    )
