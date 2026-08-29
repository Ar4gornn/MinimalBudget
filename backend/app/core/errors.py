"""Domain errors, translated to status codes in one place (see ``app.main``).

AD-8: anything that belongs to another user is :class:`NotFound`, never a 403. Services
raise these; routers never build status codes from database exceptions.
"""


class NotFound(Exception):
    def __init__(self, detail: str = "Not found") -> None:
        self.detail = detail
        super().__init__(detail)


class Conflict(Exception):
    """A uniqueness clash, or a delete refused because something still references the row."""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class Invalid(Exception):
    """A request that is well-formed but asks for something the domain forbids."""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)
