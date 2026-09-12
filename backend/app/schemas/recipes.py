"""Wire shapes for foods, recipes and meals (Epic 27).

**Two nutrition representations, and the difference is deliberate.** A *stored* figure —
what a food contains per one basis amount — is a **two-place** decimal string, because that
is exactly what the column holds and exactly what somebody copied off a packet; a client
that echoes back what it received round-trips unchanged. A *derived* figure — a recipe's
total, its per-serving figure, a meal's contribution — is a **four-place** decimal string
under AD-29's rate discipline, because it is the result of a multiplication and a division
and the extra places are real. Both are strings, never JSON numbers, and both are rounded
ROUND_HALF_UP before they are formatted, never by ``format``'s own half-even default.

**A derived nutrient may be null, and null is not zero.** Nutrient columns are nullable —
a food whose protein nobody typed still counts its calories — so a total is the sum of the
contributors that *had* a value, and ``unknown`` says how many did not. A total over
contributors that all lacked the nutrient is ``null``, the same choice AD-29 makes for a
period with no quantified rows: ``0.0000`` would be a claim that the meal is protein-free.
"""

import datetime as dt
import decimal
import uuid
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field, PlainSerializer, model_validator

from app.models.recipes import MAX_NUTRIENT, MAX_SERVINGS, FoodBasis, RecipeUnit
from app.schemas.common import quantise, quantise_rate, to_decimal

# Ceilings taken from the columns rather than invented: NUMERIC(10,3) and NUMERIC(6,3).
# Without them a value the column cannot hold becomes a numeric-overflow 500 instead of a
# 422 that names the field.
MAX_QUANTITY = decimal.Decimal("9999999.999")
MAX_MEAL_SERVINGS = decimal.Decimal("999.999")


def _stored_nutrient(value: object) -> decimal.Decimal | None:
    """A figure off a packet: two places, non-negative, or absent."""
    if value is None:
        return None
    amount = quantise(to_decimal(value), places=2)
    if amount < 0 or amount > MAX_NUTRIENT:
        raise ValueError(f"a nutrient is between 0 and {MAX_NUTRIENT}")
    return amount


def _positive(limit: decimal.Decimal, noun: str):
    def check(value: object) -> decimal.Decimal:
        amount = quantise(to_decimal(value), places=3)
        if amount <= 0:
            raise ValueError(f"a {noun} is more than zero")
        if amount > limit:
            raise ValueError(f"a {noun} is at most {limit}")
        return amount

    return check


def _derived(value: object) -> decimal.Decimal | None:
    """Quantised ROUND_HALF_UP here so the serialiser only ever formats (AD-29)."""
    if value is None:
        return None
    return quantise_rate(to_decimal(value))


#: What a food stores, in and out. Two places, nullable, and it round-trips exactly.
StoredNutrient = Annotated[
    decimal.Decimal | None,
    BeforeValidator(_stored_nutrient),
    PlainSerializer(lambda v: None if v is None else f"{v:.2f}", return_type=str | None),
]

#: What a total, a per-serving figure or a meal's contribution looks like. Four places.
DerivedNutrient = Annotated[
    decimal.Decimal | None,
    BeforeValidator(_derived),
    PlainSerializer(lambda v: None if v is None else f"{v:.4f}", return_type=str | None),
]

_quantity = _positive(MAX_QUANTITY, "quantity")
_meal_servings = _positive(MAX_MEAL_SERVINGS, "number of servings")


def _optional(check):
    """The nullable twin of a checker, written once.

    Spelling these as ``Annotated[Decimal, ...] | None`` would put the validator inside one
    arm of a union and leave which arm runs to pydantic's smart-union heuristics; a single
    nullable annotation has one code path and no heuristics in it.
    """

    def wrapped(value: object) -> decimal.Decimal | None:
        return None if value is None else check(value)

    return wrapped


IngredientQuantity = Annotated[
    decimal.Decimal,
    BeforeValidator(_quantity),
    PlainSerializer(lambda v: f"{v:.3f}", return_type=str),
]

OptionalQuantity = Annotated[
    decimal.Decimal | None,
    BeforeValidator(_optional(_quantity)),
    PlainSerializer(lambda v: None if v is None else f"{v:.3f}", return_type=str | None),
]

MealServings = Annotated[
    decimal.Decimal,
    BeforeValidator(_meal_servings),
    PlainSerializer(lambda v: f"{v:.3f}", return_type=str),
]

OptionalMealServings = Annotated[
    decimal.Decimal | None,
    BeforeValidator(_optional(_meal_servings)),
    PlainSerializer(lambda v: None if v is None else f"{v:.3f}", return_type=str | None),
]

Name = Annotated[str, Field(min_length=1, max_length=80)]


class UnknownCounts(BaseModel):
    """How many contributors carried no value for each nutrient.

    Sent even when every count is zero, so a client never has to decide whether an absent
    object means "all known" or "the server is older than this page".
    """

    kcal: int = 0
    protein: int = 0
    carbs: int = 0
    fat: int = 0


class NutritionOut(BaseModel):
    """A derived nutrition figure and how complete it is."""

    kcal: DerivedNutrient = None
    protein: DerivedNutrient = None
    carbs: DerivedNutrient = None
    fat: DerivedNutrient = None
    unknown: UnknownCounts = UnknownCounts()


# --- foods -----------------------------------------------------------------


class FoodCreate(BaseModel):
    name: Name
    basis: FoodBasis
    kcal: StoredNutrient = None
    protein: StoredNutrient = None
    carbs: StoredNutrient = None
    fat: StoredNutrient = None


class FoodUpdate(BaseModel):
    """PATCH: only the fields present are written (``model_fields_set``).

    A nutrient sent as ``null`` clears it back to *not known*, which is a real thing to
    want — a figure typed off the wrong packet should be removable, not merely editable.
    """

    name: Name | None = None
    basis: FoodBasis | None = None
    kcal: StoredNutrient = None
    protein: StoredNutrient = None
    carbs: StoredNutrient = None
    fat: StoredNutrient = None


class FoodOut(BaseModel):
    id: uuid.UUID
    name: str
    basis: FoodBasis
    #: The unit this basis obliges an ingredient to use. Derived from ``basis`` by a rule
    #: the server owns, so the client never re-implements the mapping and cannot drift
    #: from it when a fourth basis arrives.
    unit: RecipeUnit
    kcal: StoredNutrient = None
    protein: StoredNutrient = None
    carbs: StoredNutrient = None
    fat: StoredNutrient = None


# --- recipes ---------------------------------------------------------------


class RecipeCreate(BaseModel):
    name: Name
    servings: int = Field(default=1, ge=1, le=MAX_SERVINGS)
    note: str | None = Field(default=None, max_length=500)


class RecipeUpdate(BaseModel):
    name: Name | None = None
    servings: int | None = Field(default=None, ge=1, le=MAX_SERVINGS)
    note: str | None = Field(default=None, max_length=500)


class IngredientCreate(BaseModel):
    food_id: uuid.UUID
    quantity: IngredientQuantity
    #: Optional. Omitted, it is taken from the food's basis; sent, it must agree, and a
    #: disagreement is refused with ``unit_basis_mismatch`` rather than silently corrected.
    unit: RecipeUnit | None = None


class IngredientUpdate(BaseModel):
    quantity: OptionalQuantity = None
    unit: RecipeUnit | None = None
    position: int | None = Field(default=None, ge=0)


class IngredientOut(BaseModel):
    id: uuid.UUID
    food_id: uuid.UUID
    food_name: str
    basis: FoodBasis
    quantity: IngredientQuantity
    unit: RecipeUnit
    position: int
    #: What this line contributes to the recipe. Its own figure, so a reader can see which
    #: ingredient the calories came from rather than only the total.
    nutrition: NutritionOut


class StepCreate(BaseModel):
    """A new step always goes last.

    Deliberately no ``position``: inserting in the middle would have to shift every step
    after it, which is the reorder operation wearing a different name — and then there
    would be two ways to renumber, one of which is exercised far less often.
    """

    text: str = Field(min_length=1, max_length=1000)


class StepUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=1000)


class StepOrder(BaseModel):
    """A whole new order, as the recipe's step ids.

    The whole set rather than a move-one operation: a reorder is then a single statement
    against a deferred unique key, and a client cannot submit a partial permutation that
    leaves two steps at position 3.
    """

    ids: list[uuid.UUID] = Field(min_length=1)


class StepOut(BaseModel):
    id: uuid.UUID
    position: int
    text: str


class RecipeOut(BaseModel):
    id: uuid.UUID
    name: str
    servings: int
    note: str | None
    ingredient_count: int
    step_count: int
    total: NutritionOut
    per_serving: NutritionOut


class RecipeDetailOut(RecipeOut):
    ingredients: list[IngredientOut]
    steps: list[StepOut]


# --- meals -----------------------------------------------------------------


class MealCreate(BaseModel):
    """One of two shapes: a recipe in servings, or a food in a quantity.

    Checked here as well as by the database's own CHECK, so the refusal is a sentence with
    a code (AD-44) rather than a constraint violation naming a constraint.
    """

    eaten_on: dt.date
    recipe_id: uuid.UUID | None = None
    servings: OptionalMealServings = None
    food_id: uuid.UUID | None = None
    quantity: OptionalQuantity = None
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _one_shape(self) -> "MealCreate":
        recipe = self.recipe_id is not None
        food = self.food_id is not None
        if recipe == food:
            raise ValueError("a meal names either a recipe or a food, not both and not neither")
        if recipe and self.quantity is not None:
            raise ValueError("a recipe is eaten in servings, not in a quantity")
        if food and self.servings is not None:
            raise ValueError("a food is eaten in a quantity, not in servings")
        if food and self.quantity is None:
            raise ValueError("say how much of it was eaten")
        return self


class MealUpdate(BaseModel):
    """What may be amended: how much, and the note.

    Not *what* was eaten, and not the shape: a meal log filed against the wrong recipe is
    one that did not happen, so it is deleted and recorded again — the same rule Epic 26
    settled for a check-in on the wrong day. Amending the recipe would also have to amend
    the servings-or-quantity pair with it, which is a second shape decision on a PATCH.
    """

    eaten_on: dt.date | None = None
    servings: OptionalMealServings = None
    quantity: OptionalQuantity = None
    note: str | None = Field(default=None, max_length=500)


class MealOut(BaseModel):
    id: uuid.UUID
    eaten_on: dt.date
    recipe_id: uuid.UUID | None
    recipe_name: str | None
    servings: OptionalMealServings
    food_id: uuid.UUID | None
    food_name: str | None
    quantity: OptionalQuantity
    unit: RecipeUnit | None
    note: str | None
    nutrition: NutritionOut
