"""Foods, recipes, and the meals that were eaten (Epic 27).

A module beside the ledger, the inventory, the gym, the habits and the mood — not inside
any of them (AD-31). Nothing here has a foreign key to another module: a food is not an
inventory item, deliberately, because ``inventory_items.quantity`` is an integer with no
unit at all — it counts things, not grams — so making one the other would force a unit
system onto a module that has none, across a boundary AD-31 forbids.

**Nutrition is a rate over a declared basis, and every figure over it is derived**
(AD-45, extending AD-29). A food stores what it contains per *one basis amount* — 100 g,
100 ml, or one unit — and nothing else. A recipe's totals, its per-serving figures and a
day's energy are all computed from those rates and the quantities beside them. No column
anywhere holds a total: an ingredient swapped or a quantity corrected would make it wrong
the same afternoon, with nothing to say so (AD-9).

**The unit vocabulary here is not AD-29's**, and that is a decision rather than an
oversight. The ledger's closed list (``l``, ``gal``, ``kg``, ``lb``, ``kwh``, ``m3``,
``unit``) exists so that this month's litres compare with last month's on an expense.
Recipes need grams and millilitres, and adding those to the ledger's list would make ``g``
selectable beside ``kg`` on an entry — which fragments the unit-price series, because
AD-29 keys a series by ``(category, unit)`` and converts nothing. Two closed lists, each
owned by the module that compares within it.
"""

import datetime as dt
import decimal
import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FoodBasis(enum.StrEnum):
    """What one basis amount of a food is.

    A VARCHAR with a CHECK rather than a Postgres enum type, matching
    ``recurring_templates.cadence`` and ``habits.schedule_kind``: adding ``per_100g_dry``
    later is one ALTER of a constraint instead of an ALTER TYPE.
    """

    per_100g = "per_100g"
    per_100ml = "per_100ml"
    per_unit = "per_unit"


class RecipeUnit(enum.StrEnum):
    """The closed list an ingredient's quantity may be expressed in.

    Three, and they are not interchangeable: ``g`` weighs, ``ml`` measures volume, and
    ``unit`` counts. There is no conversion between them — the same rule AD-29 sets for
    the ledger's units, for the same reason. 250 ml of oil is not 250 g of oil, and a
    density table is a feature nobody asked for.
    """

    g = "g"
    ml = "ml"
    unit = "unit"


BASIS_VALUES = tuple(b.value for b in FoodBasis)
UNIT_VALUES = tuple(u.value for u in RecipeUnit)

#: Which unit a basis obliges. Enforced in the service with a stable code, so a mismatch is
#: a 422 that names the problem rather than a constraint violation naming a constraint.
#: The database cannot hold this rule: it spans two tables.
BASIS_UNIT: dict[str, str] = {
    FoodBasis.per_100g: RecipeUnit.g,
    FoodBasis.per_100ml: RecipeUnit.ml,
    FoodBasis.per_unit: RecipeUnit.unit,
}

#: How much of a food one stored figure describes. 100 g, 100 ml, or one of the thing.
BASIS_AMOUNT: dict[str, decimal.Decimal] = {
    FoodBasis.per_100g: decimal.Decimal(100),
    FoodBasis.per_100ml: decimal.Decimal(100),
    FoodBasis.per_unit: decimal.Decimal(1),
}

#: The nutrients a food carries, named once so nothing retypes the list. Adding a fifth is
#: a migration plus a form field and nothing else — every figure over them is derived, so
#: there is no stored total to backfill (AD-45).
NUTRIENTS: tuple[str, ...] = ("kcal", "protein", "carbs", "fat")

#: Ceilings that are sanity floors rather than business rules. No food is 10,000 kcal per
#: 100 g, and a recipe for 500 people is a typo.
MAX_NUTRIENT = decimal.Decimal("100000.00")
MAX_SERVINGS = 100
#: The earliest date any dated row in this project accepts, matching habits and mood.
EARLIEST = dt.date(2000, 1, 1)

_BASIS_CHECK = "basis IN (" + ", ".join(f"'{b}'" for b in BASIS_VALUES) + ")"
_UNIT_CHECK = "unit IN (" + ", ".join(f"'{u}'" for u in UNIT_VALUES) + ")"


def _nutrient_column() -> Mapped[decimal.Decimal | None]:
    """Nullable on purpose.

    A food whose protein was never typed must still count its calories, and NULL is the
    only honest way to say "not known" — zero is a claim that it contains none. Everything
    derived carries a count of how many contributors were NULL beside the partial sum, so
    an incomplete figure is visibly incomplete rather than quietly low (AD-45).
    """
    return mapped_column(Numeric(8, 2), nullable=True)


class Food(Base):
    """A named thing with nutrition per one basis amount.

    Reference data, in the sense AD-12 gives the word: created by name, unique per account
    case-insensitively, and pointed at by transactional rows. So it deletes under RESTRICT
    (AD-21) — a food a recipe uses, or one that has been eaten, cannot be deleted, and the
    API answers 409.
    """

    __tablename__ = "foods"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="foods_user_id_id_key"),
        CheckConstraint(_BASIS_CHECK, name="foods_basis_supported"),
        CheckConstraint(
            " AND ".join(
                f"({name} IS NULL OR ({name} >= 0 AND {name} <= {MAX_NUTRIENT}))"
                for name in NUTRIENTS
            ),
            name="foods_nutrients_in_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    basis: Mapped[str] = mapped_column(String(10), nullable=False)

    kcal: Mapped[decimal.Decimal | None] = _nutrient_column()
    protein: Mapped[decimal.Decimal | None] = _nutrient_column()
    carbs: Mapped[decimal.Decimal | None] = _nutrient_column()
    fat: Mapped[decimal.Decimal | None] = _nutrient_column()

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Recipe(Base):
    """A meal: what goes in it, how it is made, and how many it feeds."""

    __tablename__ = "recipes"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="recipes_user_id_id_key"),
        CheckConstraint(
            f"servings >= 1 AND servings <= {MAX_SERVINGS}", name="recipes_servings_in_range"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    #: How many people the whole recipe feeds. Per-serving nutrition is the total over it,
    #: computed on read — storing it would go stale on the next ingredient edit.
    servings: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class RecipeIngredient(Base):
    """How much of one food a recipe uses.

    A food may appear twice in one recipe on purpose — butter in the dough and butter on
    top are two lines a cook reads separately — so there is no unique key over
    ``(recipe, food)``. ``position`` is the order they are listed in, and ties break by id.
    """

    __tablename__ = "recipe_ingredients"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="recipe_ingredients_quantity_positive"),
        CheckConstraint(_UNIT_CHECK, name="recipe_ingredients_unit_supported"),
        CheckConstraint("position >= 0", name="recipe_ingredients_position_non_negative"),
        # AD-18, twice. Postgres FK checks always bypass RLS, so a bare recipe_id would let
        # user B add an ingredient to user A's recipe, and a bare food_id would let B point
        # at A's food — learning it exists, and pinning it against deletion.
        ForeignKeyConstraint(
            ["user_id", "recipe_id"],
            ["recipes.user_id", "recipes.id"],
            name="recipe_ingredients_recipe_fkey",
            ondelete="CASCADE",
        ),
        # RESTRICT, unlike the line above: an ingredient has no meaning without its recipe,
        # but a food is reference data that other recipes and meals still point at (AD-21).
        ForeignKeyConstraint(
            ["user_id", "food_id"],
            ["foods.user_id", "foods.id"],
            name="recipe_ingredients_food_fkey",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    recipe_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    food_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    quantity: Mapped[decimal.Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    #: Must match the food's basis. The service holds that rule; see ``BASIS_UNIT``.
    unit: Mapped[str] = mapped_column(String(4), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))


class RecipeStep(Base):
    """One instruction, at a position.

    Rows rather than a newline-separated block, because a step is a thing a person names —
    "step 3" — reorders, and ticks off while cooking. The unique key over
    ``(user, recipe, position)`` is **deferred**, so a reorder can renumber every row in
    one statement without tripping over itself halfway through.
    """

    __tablename__ = "recipe_steps"
    __table_args__ = (
        CheckConstraint("position >= 1", name="recipe_steps_position_positive"),
        UniqueConstraint(
            "user_id",
            "recipe_id",
            "position",
            name="recipe_steps_position_key",
            deferrable=True,
            initially="DEFERRED",
        ),
        ForeignKeyConstraint(
            ["user_id", "recipe_id"],
            ["recipes.user_id", "recipes.id"],
            name="recipe_steps_recipe_fkey",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    recipe_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    text_: Mapped[str] = mapped_column("text", String(1000), nullable=False)


#: The two shapes a meal log may take, as one expression. Either a recipe eaten in some
#: number of servings, or a bare food in some quantity — never both, never neither, and
#: never with the other side's columns left lying around where a later edit could revive
#: them. Typed columns with one CHECK, the shape Epic 26 settled for habit schedules
#: (AD-43): the database, not only the service, knows a meal log is one thing or the other.
_MEAL_SHAPE = (
    "(recipe_id IS NOT NULL AND servings IS NOT NULL"
    " AND food_id IS NULL AND quantity IS NULL AND unit IS NULL)"
    " OR "
    "(food_id IS NOT NULL AND quantity IS NOT NULL AND unit IS NOT NULL"
    " AND recipe_id IS NULL AND servings IS NULL)"
)


class MealLog(Base):
    """What was eaten, on a day the person names.

    A **record**, not a plan (AD-35). Planning to cook something on Tuesday is a different
    row in a table this epic deliberately does not build, and neither would rewrite the
    other. Which is also why nutrition figures mean something here: a plan's calories are
    an intention, and these are a measurement.

    ``eaten_on`` is a ``DATE`` (AD-10) — the day the person says, not the instant they
    tapped — so a meal cannot land on a different day on a phone and a laptop.

    Deleting a recipe or a food that has been eaten is **refused**, not nulled. AD-35's
    ``SET NULL (routine_id)`` is right for a gym set, which still records a real weight
    once its routine is gone; a meal log nulled off its recipe records *nothing*, because
    every nutrition figure lives on the other side of that key. Keeping it would mean
    snapshotting the totals onto the row, which is storing a derived figure (AD-9). So
    RESTRICT, exactly as a category with entries already behaves (AD-21).
    """

    __tablename__ = "meal_logs"
    __table_args__ = (
        CheckConstraint(_MEAL_SHAPE, name="meal_logs_shape"),
        CheckConstraint("servings IS NULL OR servings > 0", name="meal_logs_servings_positive"),
        CheckConstraint("quantity IS NULL OR quantity > 0", name="meal_logs_quantity_positive"),
        CheckConstraint(f"unit IS NULL OR {_UNIT_CHECK}", name="meal_logs_unit_supported"),
        CheckConstraint(
            f"eaten_on >= DATE '{EARLIEST.isoformat()}'", name="meal_logs_eaten_on_sane"
        ),
        ForeignKeyConstraint(
            ["user_id", "recipe_id"],
            ["recipes.user_id", "recipes.id"],
            name="meal_logs_recipe_fkey",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["user_id", "food_id"],
            ["foods.user_id", "foods.id"],
            name="meal_logs_food_fkey",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    eaten_on: Mapped[dt.date] = mapped_column(Date, nullable=False)

    recipe_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    #: How much of the recipe, in servings. 0.5 is half a bowl of a four-serving pot.
    servings: Mapped[decimal.Decimal | None] = mapped_column(Numeric(6, 3), nullable=True)

    food_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    quantity: Mapped[decimal.Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(4), nullable=True)

    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
