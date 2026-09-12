"""Foods, recipes, and the meals that were eaten (Epic 27).

An independent module: it imports its own models and nothing else, and nothing here
commits (AD-31, AD-4). There is no cross-module read and no cross-module write —
``services/shopping.py`` remains the one declared seam in this codebase.

**Where the stored fact ends and the derived figure begins** (AD-45, extending AD-9 and
AD-29). Stored: a food's nutrition per one basis amount, an ingredient's quantity, a
recipe's serving count, and the fact that something was eaten on a day. Derived, computed
on every read and written nowhere: a recipe's totals, its per-serving figures, and what a
meal contributed. A ``kcal`` column on ``recipes`` would be wrong the first time somebody
corrected a quantity, with nothing in the row to say so.

**Two implementations of one arithmetic, held equal by a test.** A single line's
contribution is :func:`nutrition_of` in Python — the recipe detail and the meal list both
need it per row, and neither is an aggregate. A recipe's totals are a SQL ``GROUP BY``,
because that *is* an aggregate and AD-9 says so. Two implementations is exactly the
divergence AD-30 warns about, so ``test_recipes.py`` holds them equal over a recipe with
several ingredients — the same guard AD-29 already specifies for unit prices.
"""

import dataclasses
import datetime as dt
import decimal
import uuid
from collections.abc import Iterable, Mapping

from sqlalchemy import and_, case, delete, func, literal, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import Conflict, Invalid, NotFound
from app.models.recipes import (
    BASIS_AMOUNT,
    BASIS_UNIT,
    EARLIEST,
    NUTRIENTS,
    Food,
    FoodBasis,
    MealLog,
    Recipe,
    RecipeIngredient,
    RecipeStep,
)

# --------------------------------------------------------------- nutrition


@dataclasses.dataclass(frozen=True)
class Nutrition:
    """A nutrition figure and how complete it is.

    ``values`` holds an **exact, unquantised** Decimal per nutrient, or ``None`` when
    nothing that contributed carried the nutrient. Rounding happens once, at the wire edge
    (``schemas/recipes.py``), so a chain of multiplications and divisions is not rounded
    four times on the way out.

    ``unknown`` counts the contributors that had no value. A partial total without it would
    be a number that is quietly too low and says nothing about it.
    """

    values: Mapping[str, decimal.Decimal | None]
    unknown: Mapping[str, int]

    @classmethod
    def nothing(cls) -> "Nutrition":
        """A recipe with no ingredients: unknown to zero, every figure null."""
        return cls({name: None for name in NUTRIENTS}, dict.fromkeys(NUTRIENTS, 0))

    def scaled(self, factor: decimal.Decimal) -> "Nutrition":
        """The same figure for a different amount of it.

        ``unknown`` is carried through unscaled: it counts contributors, and eating half a
        pot does not halve how many of its ingredients had no protein figure.
        """
        return Nutrition(
            {
                name: (None if value is None else value * factor)
                for name, value in self.values.items()
            },
            dict(self.unknown),
        )


def nutrition_of(food: Food, quantity: decimal.Decimal) -> Nutrition:
    """What ``quantity`` of ``food`` contributes.

    The one place a single line's arithmetic is written. ``basis`` says what the stored
    figures describe — 100 g, 100 ml, or one of the thing — so the rate is scaled by
    ``quantity / basis_amount`` and nothing else. There is no unit conversion anywhere in
    this module: an ingredient's unit is obliged to match its food's basis, so the two
    numbers are always in the same measure.
    """
    amount = BASIS_AMOUNT[food.basis]
    values: dict[str, decimal.Decimal | None] = {}
    unknown: dict[str, int] = {}
    for name in NUTRIENTS:
        rate = getattr(food, name)
        values[name] = None if rate is None else rate * quantity / amount
        unknown[name] = 1 if rate is None else 0
    return Nutrition(values, unknown)


#: How much of a food one stored figure describes, as SQL. Mirrors ``BASIS_AMOUNT``; the
#: test that holds the Python and SQL paths equal is what keeps them from drifting.
_BASIS_AMOUNT_SQL = case((Food.basis == FoodBasis.per_unit, literal(1)), else_=literal(100))


def recipe_totals(
    session: Session, user_id: uuid.UUID, recipe_ids: Iterable[uuid.UUID] | None = None
) -> dict[uuid.UUID, Nutrition]:
    """Every recipe's totals in one ``GROUP BY`` (AD-9).

    ``SUM`` over rows that all lack a nutrient returns NULL, which is precisely what should
    be reported — ``COALESCE(..., 0)`` here would be the one place AD-22's zero-fill rule
    does damage, because 0 kcal is a claim about the food rather than an absence of data.
    That is the same exception AD-29 already carves out for a period with no quantified rows.

    Recipes with no ingredients are absent from the result; the caller reads them as
    :meth:`Nutrition.nothing`.
    """
    columns = []
    for name in NUTRIENTS:
        rate = getattr(Food, name)
        columns.append(
            func.sum(rate * RecipeIngredient.quantity / _BASIS_AMOUNT_SQL).label(name)
        )
        columns.append(func.count().filter(rate.is_(None)).label(f"{name}_unknown"))

    query = (
        select(RecipeIngredient.recipe_id, *columns)
        .join(
            Food,
            and_(Food.id == RecipeIngredient.food_id, Food.user_id == RecipeIngredient.user_id),
        )
        # RLS already scopes this; the filter is AD-1's defence in depth, not the guard.
        .where(RecipeIngredient.user_id == user_id)
        .group_by(RecipeIngredient.recipe_id)
    )
    ids = None if recipe_ids is None else list(recipe_ids)
    if ids is not None:
        if not ids:
            return {}
        query = query.where(RecipeIngredient.recipe_id.in_(ids))

    totals: dict[uuid.UUID, Nutrition] = {}
    for row in session.execute(query):
        totals[row.recipe_id] = Nutrition(
            {name: getattr(row, name) for name in NUTRIENTS},
            {name: getattr(row, f"{name}_unknown") for name in NUTRIENTS},
        )
    return totals


def per_serving(total: Nutrition, servings: int) -> Nutrition:
    """A whole recipe divided by the number of people it feeds.

    Exact division, unrounded — a third of a pot stays a third until the wire edge rounds
    it once. ``servings`` is ``CHECK (>= 1)``, so there is no division by zero to guard.
    """
    return total.scaled(decimal.Decimal(1) / decimal.Decimal(servings))


# ------------------------------------------------------------------- foods


def list_foods(session: Session, user_id: uuid.UUID) -> list[Food]:
    query = (
        select(Food)
        .where(Food.user_id == user_id)
        # AD-20: reference data by name, then id, so identical requests come back identical.
        .order_by(func.lower(Food.name), Food.id)
    )
    return list(session.execute(query).scalars())


def get_food(session: Session, user_id: uuid.UUID, food_id: uuid.UUID) -> Food:
    food = session.execute(
        select(Food).where(Food.user_id == user_id, Food.id == food_id)
    ).scalar_one_or_none()
    if food is None:
        # AD-8: deliberately indistinguishable from "belongs to someone else".
        raise NotFound("No food with that id", "food_not_found")
    return food


def _name_taken(session: Session, model, user_id: uuid.UUID, name: str, *, exclude=None) -> bool:
    query = select(model.id).where(
        model.user_id == user_id, func.lower(model.name) == name.strip().lower()
    )
    if exclude is not None:
        query = query.where(model.id != exclude)
    return session.execute(query).first() is not None


def create_food(
    session: Session,
    user_id: uuid.UUID,
    *,
    name: str,
    basis: str,
    nutrients: Mapping[str, decimal.Decimal | None],
) -> Food:
    """AD-12: unique per account, case-insensitively, with the typed casing kept.

    Not the insert-or-return of a category: a category is created as a side effect of
    filing an entry under a name, so returning the existing one is the whole point. A food
    is created deliberately, from a form, and a second "Rice" is a mistake worth reporting.
    """
    name = name.strip()
    if _name_taken(session, Food, user_id, name):
        raise Conflict("You already have a food with that name", "food_name_taken")
    food = Food(user_id=user_id, name=name, basis=basis, **dict(nutrients))
    session.add(food)
    try:
        session.flush()
    except IntegrityError as exc:  # pragma: no cover — the read above wins every race but one
        session.rollback()
        raise Conflict("You already have a food with that name", "food_name_taken") from exc
    return food


def update_food(
    session: Session, user_id: uuid.UUID, food_id: uuid.UUID, fields: Mapping[str, object]
) -> Food:
    """A PATCH: only the keys present are written.

    **The nutrition figures move freely; the basis locks once anything uses the food.**
    That is AD-36's line, applied here. A nutrition figure is a *judgement* corrected
    toward a truth outside the row — the packet says 358, not 350 — so editing it changes
    only what is derived, exactly as a habit target re-judges its check-ins (AD-40). A
    basis is a *unit*: "200" beside a food measured per 100 g means 200 grams, and the same
    200 beside the same food measured per 100 ml means 200 millilitres. Changing it would
    silently reinterpret every quantity already typed under the old one, which is precisely
    what AD-36 refuses for the account's currency and its weight unit. So the basis is
    freely set while the food is unused, and refused the moment a recipe or a meal depends
    on it — the same shape, and the same 409, as those two.
    """
    food = get_food(session, user_id, food_id)

    if "name" in fields:
        name = str(fields["name"]).strip()
        if _name_taken(session, Food, user_id, name, exclude=food_id):
            raise Conflict("You already have a food with that name", "food_name_taken")
        food.name = name

    for name in NUTRIENTS:
        if name in fields:
            setattr(food, name, fields[name])

    if fields.get("basis") is not None and fields["basis"] != food.basis:
        if _food_is_used(session, user_id, food_id):
            raise Conflict(
                "That food is already used, so how it is measured is fixed", "food_basis_locked"
            )
        food.basis = str(fields["basis"])

    food.updated_at = func.now()
    session.flush()
    # updated_at is a SQL expression on the instance until it is read back.
    session.refresh(food)
    return food


def _food_is_used(session: Session, user_id: uuid.UUID, food_id: uuid.UUID) -> bool:
    """Does anything point at this food?

    The same question the two RESTRICT foreign keys ask at delete time, asked in SQL here
    because a basis change has no constraint to bounce off — it is a rule about what a
    stored quantity *means*, which no key can see (AD-30: one predicate, one definition).
    """
    used = (
        select(RecipeIngredient.id)
        .where(RecipeIngredient.user_id == user_id, RecipeIngredient.food_id == food_id)
        .limit(1)
        .union_all(
            select(MealLog.id)
            .where(MealLog.user_id == user_id, MealLog.food_id == food_id)
            .limit(1)
        )
    )
    return session.execute(used).first() is not None


def delete_food(session: Session, user_id: uuid.UUID, food_id: uuid.UUID) -> None:
    try:
        result = session.execute(
            delete(Food).where(Food.user_id == user_id, Food.id == food_id)
        )
    except IntegrityError as exc:
        # AD-21: both foreign keys pointing here are RESTRICT, so this is the database
        # refusing to leave a recipe or a meal describing a food that no longer exists.
        session.rollback()
        raise Conflict(
            "That food is still used by a recipe or a meal", "food_in_use"
        ) from exc
    if result.rowcount == 0:
        raise NotFound("No food with that id", "food_not_found")


# ----------------------------------------------------------------- recipes


def get_recipe(session: Session, user_id: uuid.UUID, recipe_id: uuid.UUID) -> Recipe:
    recipe = session.execute(
        select(Recipe).where(Recipe.user_id == user_id, Recipe.id == recipe_id)
    ).scalar_one_or_none()
    if recipe is None:
        raise NotFound("No recipe with that id", "recipe_not_found")
    return recipe


@dataclasses.dataclass(frozen=True)
class RecipeRow:
    recipe: Recipe
    ingredient_count: int
    step_count: int
    total: Nutrition
    per_serving: Nutrition


def _counts(session: Session, user_id: uuid.UUID, model) -> dict[uuid.UUID, int]:
    rows = session.execute(
        select(model.recipe_id, func.count())
        .where(model.user_id == user_id)
        .group_by(model.recipe_id)
    )
    return {recipe_id: count for recipe_id, count in rows}


def list_recipes(session: Session, user_id: uuid.UUID) -> list[RecipeRow]:
    recipes = list(
        session.execute(
            select(Recipe)
            .where(Recipe.user_id == user_id)
            .order_by(func.lower(Recipe.name), Recipe.id)
        ).scalars()
    )
    totals = recipe_totals(session, user_id)
    ingredients = _counts(session, user_id, RecipeIngredient)
    steps = _counts(session, user_id, RecipeStep)
    return [
        RecipeRow(
            recipe=recipe,
            ingredient_count=ingredients.get(recipe.id, 0),
            step_count=steps.get(recipe.id, 0),
            total=(total := totals.get(recipe.id, Nutrition.nothing())),
            per_serving=per_serving(total, recipe.servings),
        )
        for recipe in recipes
    ]


def create_recipe(
    session: Session, user_id: uuid.UUID, *, name: str, servings: int, note: str | None
) -> Recipe:
    name = name.strip()
    if _name_taken(session, Recipe, user_id, name):
        raise Conflict("You already have a recipe with that name", "recipe_name_taken")
    recipe = Recipe(user_id=user_id, name=name, servings=servings, note=note)
    session.add(recipe)
    try:
        session.flush()
    except IntegrityError as exc:  # pragma: no cover
        session.rollback()
        raise Conflict("You already have a recipe with that name", "recipe_name_taken") from exc
    return recipe


def update_recipe(
    session: Session, user_id: uuid.UUID, recipe_id: uuid.UUID, fields: Mapping[str, object]
) -> Recipe:
    recipe = get_recipe(session, user_id, recipe_id)
    if "name" in fields:
        name = str(fields["name"]).strip()
        if _name_taken(session, Recipe, user_id, name, exclude=recipe_id):
            raise Conflict("You already have a recipe with that name", "recipe_name_taken")
        recipe.name = name
    if "servings" in fields and fields["servings"] is not None:
        # Freely changed, and every figure over it moves with it: a serving count is a
        # judgement about the same pot, not a relabelling of a stored number (AD-40).
        recipe.servings = int(fields["servings"])  # type: ignore[arg-type]
    if "note" in fields:
        recipe.note = fields["note"]  # type: ignore[assignment]
    recipe.updated_at = func.now()
    session.flush()
    session.refresh(recipe)
    return recipe


def delete_recipe(session: Session, user_id: uuid.UUID, recipe_id: uuid.UUID) -> None:
    try:
        result = session.execute(
            delete(Recipe).where(Recipe.user_id == user_id, Recipe.id == recipe_id)
        )
    except IntegrityError as exc:
        # Ingredients and steps CASCADE; meal logs RESTRICT. So this is only ever "it has
        # been eaten", which is history and is not deleted to tidy a list.
        session.rollback()
        raise Conflict("That recipe has been eaten and is kept", "recipe_in_use") from exc
    if result.rowcount == 0:
        raise NotFound("No recipe with that id", "recipe_not_found")


# ------------------------------------------------------------- ingredients


@dataclasses.dataclass(frozen=True)
class IngredientRow:
    ingredient: RecipeIngredient
    food: Food
    nutrition: Nutrition


def list_ingredients(
    session: Session, user_id: uuid.UUID, recipe_id: uuid.UUID
) -> list[IngredientRow]:
    rows = session.execute(
        select(RecipeIngredient, Food)
        .join(
            Food,
            and_(Food.id == RecipeIngredient.food_id, Food.user_id == RecipeIngredient.user_id),
        )
        .where(RecipeIngredient.user_id == user_id, RecipeIngredient.recipe_id == recipe_id)
        .order_by(RecipeIngredient.position, RecipeIngredient.id)
    )
    return [
        IngredientRow(
            ingredient=ingredient, food=food, nutrition=nutrition_of(food, ingredient.quantity)
        )
        for ingredient, food in rows
    ]


def _unit_for(food: Food, unit: str | None) -> str:
    """The unit an ingredient carries: the food's, or the caller's if it agrees.

    This rule spans two tables, so no CHECK constraint can hold it — which is exactly why
    it is written once, here, rather than in the router and again in the client. A caller
    that sends nothing gets the right answer; a caller that sends the wrong thing is told
    so rather than silently corrected, because a form showing "kg" while the row says "g"
    is a bug somebody should see.
    """
    obliged = BASIS_UNIT[food.basis]
    if unit is not None and unit != obliged:
        raise Invalid(
            f"a food measured {food.basis} is used in {obliged}", "unit_basis_mismatch"
        )
    return obliged


def add_ingredient(
    session: Session,
    user_id: uuid.UUID,
    recipe_id: uuid.UUID,
    *,
    food_id: uuid.UUID,
    quantity: decimal.Decimal,
    unit: str | None,
) -> IngredientRow:
    # AD-8: prove both sides are the caller's before writing. The composite foreign keys
    # would refuse a foreign id anyway, but they would refuse it as a 500.
    get_recipe(session, user_id, recipe_id)
    food = get_food(session, user_id, food_id)
    last = session.execute(
        select(func.max(RecipeIngredient.position)).where(
            RecipeIngredient.user_id == user_id, RecipeIngredient.recipe_id == recipe_id
        )
    ).scalar_one()
    ingredient = RecipeIngredient(
        user_id=user_id,
        recipe_id=recipe_id,
        food_id=food_id,
        quantity=quantity,
        unit=_unit_for(food, unit),
        position=(last or 0) + 1,
    )
    session.add(ingredient)
    session.flush()
    return IngredientRow(ingredient, food, nutrition_of(food, quantity))


def get_ingredient(
    session: Session, user_id: uuid.UUID, recipe_id: uuid.UUID, ingredient_id: uuid.UUID
) -> RecipeIngredient:
    row = session.execute(
        select(RecipeIngredient).where(
            RecipeIngredient.user_id == user_id,
            RecipeIngredient.recipe_id == recipe_id,
            RecipeIngredient.id == ingredient_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFound("No ingredient with that id", "ingredient_not_found")
    return row


def update_ingredient(
    session: Session,
    user_id: uuid.UUID,
    recipe_id: uuid.UUID,
    ingredient_id: uuid.UUID,
    fields: Mapping[str, object],
) -> IngredientRow:
    ingredient = get_ingredient(session, user_id, recipe_id, ingredient_id)
    food = get_food(session, user_id, ingredient.food_id)
    if "quantity" in fields and fields["quantity"] is not None:
        ingredient.quantity = fields["quantity"]  # type: ignore[assignment]
    if "unit" in fields and fields["unit"] is not None:
        ingredient.unit = _unit_for(food, str(fields["unit"]))
    if "position" in fields and fields["position"] is not None:
        ingredient.position = int(fields["position"])  # type: ignore[arg-type]
    session.flush()
    return IngredientRow(ingredient, food, nutrition_of(food, ingredient.quantity))


def delete_ingredient(
    session: Session, user_id: uuid.UUID, recipe_id: uuid.UUID, ingredient_id: uuid.UUID
) -> None:
    result = session.execute(
        delete(RecipeIngredient).where(
            RecipeIngredient.user_id == user_id,
            RecipeIngredient.recipe_id == recipe_id,
            RecipeIngredient.id == ingredient_id,
        )
    )
    if result.rowcount == 0:
        raise NotFound("No ingredient with that id", "ingredient_not_found")


# ------------------------------------------------------------------- steps


def list_steps(session: Session, user_id: uuid.UUID, recipe_id: uuid.UUID) -> list[RecipeStep]:
    return list(
        session.execute(
            select(RecipeStep)
            .where(RecipeStep.user_id == user_id, RecipeStep.recipe_id == recipe_id)
            .order_by(RecipeStep.position, RecipeStep.id)
        ).scalars()
    )


def add_step(
    session: Session, user_id: uuid.UUID, recipe_id: uuid.UUID, *, text: str
) -> RecipeStep:
    get_recipe(session, user_id, recipe_id)
    last = session.execute(
        select(func.max(RecipeStep.position)).where(
            RecipeStep.user_id == user_id, RecipeStep.recipe_id == recipe_id
        )
    ).scalar_one()
    step = RecipeStep(
        user_id=user_id, recipe_id=recipe_id, position=(last or 0) + 1, text_=text.strip()
    )
    session.add(step)
    session.flush()
    return step


def update_step(
    session: Session,
    user_id: uuid.UUID,
    recipe_id: uuid.UUID,
    step_id: uuid.UUID,
    *,
    text: str | None,
) -> RecipeStep:
    step = session.execute(
        select(RecipeStep).where(
            RecipeStep.user_id == user_id,
            RecipeStep.recipe_id == recipe_id,
            RecipeStep.id == step_id,
        )
    ).scalar_one_or_none()
    if step is None:
        raise NotFound("No step with that id", "step_not_found")
    if text is not None:
        step.text_ = text.strip()
    session.flush()
    return step


def delete_step(
    session: Session, user_id: uuid.UUID, recipe_id: uuid.UUID, step_id: uuid.UUID
) -> None:
    """Delete, then close the gap.

    Renumbering matters because the positions are what the reorder endpoint and the
    display both read: leaving 1, 3, 4 would render as "step 1, step 2, step 3" anyway,
    so the stored order and the displayed order would have quietly stopped agreeing.
    """
    result = session.execute(
        delete(RecipeStep).where(
            RecipeStep.user_id == user_id,
            RecipeStep.recipe_id == recipe_id,
            RecipeStep.id == step_id,
        )
    )
    if result.rowcount == 0:
        raise NotFound("No step with that id", "step_not_found")
    survivors = list_steps(session, user_id, recipe_id)
    _renumber(session, user_id, recipe_id, [step.id for step in survivors])


def _renumber(
    session: Session, user_id: uuid.UUID, recipe_id: uuid.UUID, ids: list[uuid.UUID]
) -> None:
    """Write 1..n in the given order.

    One UPDATE per step, and the collisions in between are fine: the unique key over
    ``(user, recipe, position)`` is DEFERRABLE INITIALLY DEFERRED, so it is checked once at
    commit rather than after each statement. Without that, renumbering 1,2,3 into 3,1,2
    fails on the first UPDATE against a row that has not moved yet, and the workarounds —
    a temporary negative offset, or dropping the constraint for the duration — each open a
    window in which the data is nonsense or unprotected.
    """
    for position, step_id in enumerate(ids, start=1):
        session.execute(
            update(RecipeStep)
            .where(
                RecipeStep.user_id == user_id,
                RecipeStep.recipe_id == recipe_id,
                RecipeStep.id == step_id,
            )
            .values(position=position)
        )
    session.flush()


def reorder_steps(
    session: Session, user_id: uuid.UUID, recipe_id: uuid.UUID, ids: list[uuid.UUID]
) -> list[RecipeStep]:
    """The whole new order, as ids.

    Refused unless the ids are exactly this recipe's steps, each once. A partial list would
    leave the omitted steps holding positions that the listed ones are being moved onto —
    which the deferred unique key would then reject at commit, as a 500, long after the
    request that caused it.
    """
    get_recipe(session, user_id, recipe_id)
    current = [step.id for step in list_steps(session, user_id, recipe_id)]
    if sorted(map(str, ids)) != sorted(map(str, current)):
        raise Invalid(
            "a new order lists every step of the recipe, once each", "step_order_invalid"
        )
    _renumber(session, user_id, recipe_id, ids)
    return list_steps(session, user_id, recipe_id)


# ------------------------------------------------------------------- meals


@dataclasses.dataclass(frozen=True)
class MealRow:
    meal: MealLog
    recipe_name: str | None
    food_name: str | None
    nutrition: Nutrition


def _guard_day(eaten_on: dt.date, today: dt.date) -> None:
    """The two rules the schema cannot hold.

    ``CHECK (eaten_on <= current_date)`` is refused by Postgres — the function is not
    IMMUTABLE — which is the same wall habit check-ins and mood days already hit. And a
    meal is a record, so the future is not a thing it can describe: planning Tuesday's
    dinner is a *plan*, a different table this epic deliberately does not build (AD-35).
    """
    if eaten_on > today:
        raise Invalid("that day has not happened yet", "meal_in_future")
    if eaten_on < EARLIEST:
        raise Invalid(f"that is before {EARLIEST.isoformat()}", "meal_too_early")


def _decorate(session: Session, user_id: uuid.UUID, rows: list[tuple]) -> list[MealRow]:
    """Attach each meal's nutrition.

    The aggregate — a recipe's totals — is one SQL ``GROUP BY`` for the whole page (AD-9).
    Scaling that total by this meal's servings is a multiplication on one row, not an
    aggregate, so it happens here; doing it in SQL would mean joining the grouped totals
    back to the logs for arithmetic a Decimal does exactly.
    """
    recipe_ids = {meal.recipe_id for meal, _, _ in rows if meal.recipe_id is not None}
    totals = recipe_totals(session, user_id, recipe_ids) if recipe_ids else {}

    decorated: list[MealRow] = []
    for meal, recipe, food in rows:
        if recipe is not None:
            whole = totals.get(recipe.id, Nutrition.nothing())
            nutrition = per_serving(whole, recipe.servings).scaled(meal.servings)
        elif food is not None:
            nutrition = nutrition_of(food, meal.quantity)
        else:  # pragma: no cover — the CHECK makes a meal with neither impossible
            nutrition = Nutrition.nothing()
        decorated.append(
            MealRow(
                meal=meal,
                recipe_name=None if recipe is None else recipe.name,
                food_name=None if food is None else food.name,
                nutrition=nutrition,
            )
        )
    return decorated


def _meal_query(user_id: uuid.UUID):
    return (
        select(MealLog, Recipe, Food)
        .outerjoin(
            Recipe, and_(Recipe.id == MealLog.recipe_id, Recipe.user_id == MealLog.user_id)
        )
        .outerjoin(Food, and_(Food.id == MealLog.food_id, Food.user_id == MealLog.user_id))
        .where(MealLog.user_id == user_id)
    )


def list_meals(
    session: Session,
    user_id: uuid.UUID,
    *,
    start: dt.date | None = None,
    end: dt.date | None = None,
) -> list[MealRow]:
    """Meals in a half-open ``[start, end)`` window (AD-10, AD-20)."""
    query = _meal_query(user_id)
    if start is not None:
        query = query.where(MealLog.eaten_on >= start)
    if end is not None:
        query = query.where(MealLog.eaten_on < end)
    query = query.order_by(MealLog.eaten_on.desc(), MealLog.created_at.desc(), MealLog.id)
    return _decorate(session, user_id, list(session.execute(query)))


def _one_meal(session: Session, user_id: uuid.UUID, meal_id: uuid.UUID) -> MealRow:
    row = session.execute(_meal_query(user_id).where(MealLog.id == meal_id)).first()
    if row is None:
        raise NotFound("No meal with that id", "meal_not_found")
    return _decorate(session, user_id, [tuple(row)])[0]


def create_meal(
    session: Session,
    user_id: uuid.UUID,
    *,
    eaten_on: dt.date,
    recipe_id: uuid.UUID | None,
    servings: decimal.Decimal | None,
    food_id: uuid.UUID | None,
    quantity: decimal.Decimal | None,
    note: str | None,
    today: dt.date | None = None,
) -> MealRow:
    _guard_day(eaten_on, today or dt.date.today())

    unit: str | None = None
    if recipe_id is not None:
        get_recipe(session, user_id, recipe_id)
        # Defaulted rather than required: "I ate this" is one tap, and one serving is what
        # that means. A different amount is typed; the common case is not.
        servings = servings if servings is not None else decimal.Decimal(1)
    else:
        food = get_food(session, user_id, food_id)  # type: ignore[arg-type]
        # Taken from the basis, never from the caller: a bare food has no form field for a
        # unit, so there is nothing here for a client to get wrong.
        unit = BASIS_UNIT[food.basis]

    meal = MealLog(
        user_id=user_id,
        eaten_on=eaten_on,
        recipe_id=recipe_id,
        servings=servings,
        food_id=food_id,
        quantity=quantity,
        unit=unit,
        note=note,
    )
    session.add(meal)
    session.flush()
    return _one_meal(session, user_id, meal.id)


def update_meal(
    session: Session,
    user_id: uuid.UUID,
    meal_id: uuid.UUID,
    fields: Mapping[str, object],
    *,
    today: dt.date | None = None,
) -> MealRow:
    """Amend how much, when, and the note — never *what*.

    Changing a meal from one recipe to another, or from a recipe to a food, would have to
    change the servings-or-quantity pair with it and would leave the row briefly in neither
    shape. A meal filed against the wrong thing is one that did not happen: delete it and
    record the right one, the rule Epic 26 settled for a check-in on the wrong day.
    """
    meal = session.execute(
        select(MealLog).where(MealLog.user_id == user_id, MealLog.id == meal_id)
    ).scalar_one_or_none()
    if meal is None:
        raise NotFound("No meal with that id", "meal_not_found")

    if "eaten_on" in fields and fields["eaten_on"] is not None:
        _guard_day(fields["eaten_on"], today or dt.date.today())  # type: ignore[arg-type]
        meal.eaten_on = fields["eaten_on"]  # type: ignore[assignment]

    if fields.get("servings") is not None:
        if meal.recipe_id is None:
            raise Invalid("a food is eaten in a quantity, not in servings", "meal_shape_mismatch")
        meal.servings = fields["servings"]  # type: ignore[assignment]

    if fields.get("quantity") is not None:
        if meal.food_id is None:
            raise Invalid("a recipe is eaten in servings, not in a quantity", "meal_shape_mismatch")
        meal.quantity = fields["quantity"]  # type: ignore[assignment]

    if "note" in fields:
        meal.note = fields["note"]  # type: ignore[assignment]

    meal.updated_at = func.now()
    session.flush()
    return _one_meal(session, user_id, meal.id)


def delete_meal(session: Session, user_id: uuid.UUID, meal_id: uuid.UUID) -> None:
    result = session.execute(
        delete(MealLog).where(MealLog.user_id == user_id, MealLog.id == meal_id)
    )
    if result.rowcount == 0:
        raise NotFound("No meal with that id", "meal_not_found")
