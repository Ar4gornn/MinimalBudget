"""Shapes shared by every resource: the money representation and the list envelope."""

import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field, PlainSerializer

# What a money string is allowed to look like. Checked here rather than handed straight to
# Decimal, because Decimal is far more permissive than the wire format: it accepts "NaN",
# "Infinity", exponent notation, and PEP 515 underscores — so "1_0" would quietly become
# 10.00 instead of being refused.
_DECIMAL_TEXT = re.compile(r"^-?\d{1,15}(\.\d+)?$")

_NOT_A_NUMBER = 'amount must be a plain decimal number, for example "1250.00"'


def _to_decimal(value: object) -> Decimal:
    """Accept a string, an int, or a Decimal. Reject everything else.

    Every failure here must raise ``ValueError``. Pydantic turns a ``ValueError`` into a
    422; anything else escapes as a 500. ``Decimal("abc")`` raises
    ``decimal.InvalidOperation``, which is an ``ArithmeticError`` — so letting it through
    turned a malformed amount into a server error on every write endpoint.
    """
    if isinstance(value, Decimal):
        if not value.is_finite():
            raise ValueError(_NOT_A_NUMBER)
        return value
    # bool is a subclass of int, and True is not an amount.
    if isinstance(value, bool):
        raise ValueError(_NOT_A_NUMBER)
    if isinstance(value, float):
        # AD-5: a float has already lost the precision we care about by the time it gets
        # here. Refuse it rather than quietly rounding someone's money.
        raise ValueError("send money as a string, not a floating-point number")
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, str):
        text = value.strip()
        if not _DECIMAL_TEXT.match(text):
            raise ValueError(_NOT_A_NUMBER)
        try:
            return Decimal(text)
        except InvalidOperation as exc:  # pragma: no cover — the pattern excludes these
            raise ValueError(_NOT_A_NUMBER) from exc
    raise ValueError(_NOT_A_NUMBER)


def _quantise(value: Decimal) -> Decimal:
    exponent = value.as_tuple().exponent
    # A non-finite Decimal reports its exponent as a string ('n', 'N', 'F'), so comparing
    # it to an int raises TypeError — another 500. _to_decimal already rejects those; this
    # is the belt to that brace.
    if not isinstance(exponent, int):
        raise ValueError(_NOT_A_NUMBER)
    if exponent < -2:
        raise ValueError("amounts carry at most two decimal places")
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# AD-5: NUMERIC(14,2) in the database, Decimal in Python, a two-place string on the wire —
# so a JavaScript client cannot round-trip it through a float and lose cents.
Money = Annotated[
    Decimal,
    BeforeValidator(lambda v: _quantise(_to_decimal(v))),
    Field(gt=Decimal("0"), le=Decimal("999999999999.99")),
    PlainSerializer(lambda v: f"{v:.2f}", return_type=str),
]

# Budgets and targets may legitimately be zero — "I intend to spend nothing here".
NonNegativeMoney = Annotated[
    Decimal,
    BeforeValidator(lambda v: _quantise(_to_decimal(v))),
    Field(ge=Decimal("0"), le=Decimal("999999999999.99")),
    PlainSerializer(lambda v: f"{v:.2f}", return_type=str),
]


# Net income can legitimately be negative — that is the month you overspent.
SignedMoney = Annotated[
    Decimal,
    BeforeValidator(lambda v: _quantise(_to_decimal(v))),
    Field(ge=Decimal("-999999999999.99"), le=Decimal("999999999999.99")),
    PlainSerializer(lambda v: f"{v:.2f}", return_type=str),
]


class Page[T](BaseModel):
    """AD-20: every collection is enveloped, so a cursor can be added without breaking callers."""

    items: list[T]
