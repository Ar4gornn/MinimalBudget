r"""Turning a typed phrase into a safe ``LIKE`` pattern.

In ``core`` rather than in either service, because both the ledger and the inventory search
and AD-31 forbids one module importing the other. Nothing here knows what is being searched.
"""

# The escape character named in every ``ilike(..., escape=...)`` call that uses these
# patterns. A backslash, so a literal backslash in the phrase has to be doubled first.
ESCAPE = "\\"


def pattern(phrase: str) -> str:
    """A contains-match pattern with the wildcards escaped.

    Without this, searching for ``50%`` matches every row: ``%`` is the wildcard, and so is
    ``_`` for a single character. Someone looking for a note that says "50% off" should get
    the note, not the ledger.
    """
    escaped = phrase.strip().replace(ESCAPE, ESCAPE * 2).replace("%", ESCAPE + "%")
    escaped = escaped.replace("_", ESCAPE + "_")
    return f"%{escaped}%"
