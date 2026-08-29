"""Shapes shared by every resource: the money representation and the list envelope."""

from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field, PlainSerializer


def _to_decimal(value: object) -> Decimal:
    """Accept a string or a number, reject anything that cannot be exact."""
    if isinstance(value, Decimal):
        return value
    if isinstance(value, float):
        # AD-5: a float has already lost the precision we care about by the time it gets
        # here. Refuse it rather than quietly rounding someone's money.
        raise ValueError("send money as a string, not a floating-point number")
    if isinstance(value, (int, str)):
        return Decimal(str(value).strip())
    raise ValueError("not a valid amount")


def _quantise(value: Decimal) -> Decimal:
    if value.as_tuple().exponent < -2:  # type: ignore[operator]
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


class Page[T](BaseModel):
    """AD-20: every collection is enveloped, so a cursor can be added without breaking callers."""

    items: list[T]
