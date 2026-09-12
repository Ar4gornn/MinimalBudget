"""Foods, recipes and meals over HTTP (Epic 27).

Three routers from one module, because the module owns three nouns and a single
``/api/recipes`` prefix would put ``/api/recipes/foods`` one path segment away from
``/api/recipes/{recipe_id}`` — where FastAPI would try to parse "foods" as a UUID unless
the declaration order happened to be right. Separate prefixes have no such ordering rule
to remember.

No SQL here and no business rules (the Design Paradigm): routers shape requests and
responses, services decide.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.deps import CurrentUserId, DbSession, StartDay
from app.core.months import month_range
from app.models.recipes import BASIS_UNIT, NUTRIENTS
from app.schemas.common import Page
from app.schemas.recipes import (
    FoodCreate,
    FoodOut,
    FoodUpdate,
    IngredientCreate,
    IngredientOut,
    IngredientUpdate,
    MealCreate,
    MealOut,
    MealUpdate,
    NutritionOut,
    RecipeCreate,
    RecipeDetailOut,
    RecipeOut,
    RecipeUpdate,
    StepCreate,
    StepOrder,
    StepOut,
    StepUpdate,
    UnknownCounts,
)
from app.services import recipes as service

router = APIRouter(prefix="/api/recipes", tags=["recipes"])
foods_router = APIRouter(prefix="/api/foods", tags=["recipes"])
meals_router = APIRouter(prefix="/api/meals", tags=["recipes"])


def _nutrition(value: service.Nutrition) -> NutritionOut:
    """One derived figure, on the wire.

    ``unknown`` travels with the numbers rather than beside them, so a client cannot render
    a total having forgotten to check how complete it is.
    """
    return NutritionOut(
        **{name: value.values[name] for name in NUTRIENTS},
        unknown=UnknownCounts(**{name: value.unknown[name] for name in NUTRIENTS}),
    )


def _food(food) -> FoodOut:  # noqa: ANN001 — a Food row
    return FoodOut(
        id=food.id,
        name=food.name,
        basis=food.basis,
        # Sent rather than left to the client: the basis-to-unit mapping is a rule, and
        # AD-44 gives the client the words, not the rules.
        unit=BASIS_UNIT[food.basis],
        **{name: getattr(food, name) for name in NUTRIENTS},
    )


def _ingredient(row: service.IngredientRow) -> IngredientOut:
    return IngredientOut(
        id=row.ingredient.id,
        food_id=row.food.id,
        food_name=row.food.name,
        basis=row.food.basis,
        quantity=row.ingredient.quantity,
        unit=row.ingredient.unit,
        position=row.ingredient.position,
        nutrition=_nutrition(row.nutrition),
    )


def _step(step) -> StepOut:  # noqa: ANN001 — a RecipeStep row
    return StepOut(id=step.id, position=step.position, text=step.text_)


def _recipe(row: service.RecipeRow) -> RecipeOut:
    return RecipeOut(
        id=row.recipe.id,
        name=row.recipe.name,
        servings=row.recipe.servings,
        note=row.recipe.note,
        ingredient_count=row.ingredient_count,
        step_count=row.step_count,
        total=_nutrition(row.total),
        per_serving=_nutrition(row.per_serving),
    )


def _meal(row: service.MealRow) -> MealOut:
    return MealOut(
        id=row.meal.id,
        eaten_on=row.meal.eaten_on,
        recipe_id=row.meal.recipe_id,
        recipe_name=row.recipe_name,
        servings=row.meal.servings,
        food_id=row.meal.food_id,
        food_name=row.food_name,
        quantity=row.meal.quantity,
        unit=row.meal.unit,
        note=row.meal.note,
        nutrition=_nutrition(row.nutrition),
    )


# ------------------------------------------------------------------- foods


@foods_router.get("", response_model=Page[FoodOut])
def list_foods(user_id: CurrentUserId, session: DbSession) -> Page[FoodOut]:
    return Page[FoodOut](items=[_food(food) for food in service.list_foods(session, user_id)])


@foods_router.post("", response_model=FoodOut, status_code=status.HTTP_201_CREATED)
def create_food(payload: FoodCreate, user_id: CurrentUserId, session: DbSession) -> FoodOut:
    food = service.create_food(
        session,
        user_id,
        name=payload.name,
        basis=payload.basis,
        nutrients={name: getattr(payload, name) for name in NUTRIENTS},
    )
    return _food(food)


@foods_router.patch("/{food_id}", response_model=FoodOut)
def update_food(
    food_id: uuid.UUID, payload: FoodUpdate, user_id: CurrentUserId, session: DbSession
) -> FoodOut:
    # `model_fields_set` and not `exclude_unset` on a dict: a nutrient sent as null must
    # clear the column, and an absent one must leave it — two states a plain dict of
    # non-null values cannot tell apart.
    fields = {key: getattr(payload, key) for key in payload.model_fields_set}
    return _food(service.update_food(session, user_id, food_id, fields))


@foods_router.delete("/{food_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_food(food_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    service.delete_food(session, user_id, food_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ----------------------------------------------------------------- recipes


@router.get("", response_model=Page[RecipeOut])
def list_recipes(user_id: CurrentUserId, session: DbSession) -> Page[RecipeOut]:
    return Page[RecipeOut](items=[_recipe(row) for row in service.list_recipes(session, user_id)])


@router.post("", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def create_recipe(payload: RecipeCreate, user_id: CurrentUserId, session: DbSession) -> RecipeOut:
    recipe = service.create_recipe(
        session, user_id, name=payload.name, servings=payload.servings, note=payload.note
    )
    return _recipe(
        service.RecipeRow(
            recipe=recipe,
            ingredient_count=0,
            step_count=0,
            total=service.Nutrition.nothing(),
            per_serving=service.Nutrition.nothing(),
        )
    )


def _detail(user_id: uuid.UUID, session, recipe_id: uuid.UUID) -> RecipeDetailOut:  # noqa: ANN001
    recipe = service.get_recipe(session, user_id, recipe_id)
    ingredients = service.list_ingredients(session, user_id, recipe_id)
    steps = service.list_steps(session, user_id, recipe_id)
    total = service.recipe_totals(session, user_id, [recipe_id]).get(
        recipe_id, service.Nutrition.nothing()
    )
    return RecipeDetailOut(
        id=recipe.id,
        name=recipe.name,
        servings=recipe.servings,
        note=recipe.note,
        ingredient_count=len(ingredients),
        step_count=len(steps),
        total=_nutrition(total),
        per_serving=_nutrition(service.per_serving(total, recipe.servings)),
        ingredients=[_ingredient(row) for row in ingredients],
        steps=[_step(step) for step in steps],
    )


@router.get("/{recipe_id}", response_model=RecipeDetailOut)
def read_recipe(
    recipe_id: uuid.UUID, user_id: CurrentUserId, session: DbSession
) -> RecipeDetailOut:
    return _detail(user_id, session, recipe_id)


@router.patch("/{recipe_id}", response_model=RecipeDetailOut)
def update_recipe(
    recipe_id: uuid.UUID, payload: RecipeUpdate, user_id: CurrentUserId, session: DbSession
) -> RecipeDetailOut:
    fields = {key: getattr(payload, key) for key in payload.model_fields_set}
    service.update_recipe(session, user_id, recipe_id, fields)
    return _detail(user_id, session, recipe_id)


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(recipe_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    service.delete_recipe(session, user_id, recipe_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------- ingredients


@router.post(
    "/{recipe_id}/ingredients", response_model=RecipeDetailOut, status_code=status.HTTP_201_CREATED
)
def add_ingredient(
    recipe_id: uuid.UUID,
    payload: IngredientCreate,
    user_id: CurrentUserId,
    session: DbSession,
) -> RecipeDetailOut:
    """Answers with the whole recipe.

    Adding an ingredient moves the totals, the per-serving figures and every other
    ingredient's share of them. Returning the line on its own would leave the client to
    either recompute those — a second implementation of the arithmetic, which AD-30
    forbids — or fetch the recipe again anyway.
    """
    service.add_ingredient(
        session,
        user_id,
        recipe_id,
        food_id=payload.food_id,
        quantity=payload.quantity,
        unit=payload.unit,
    )
    return _detail(user_id, session, recipe_id)


@router.patch("/{recipe_id}/ingredients/{ingredient_id}", response_model=RecipeDetailOut)
def update_ingredient(
    recipe_id: uuid.UUID,
    ingredient_id: uuid.UUID,
    payload: IngredientUpdate,
    user_id: CurrentUserId,
    session: DbSession,
) -> RecipeDetailOut:
    fields = {key: getattr(payload, key) for key in payload.model_fields_set}
    service.update_ingredient(session, user_id, recipe_id, ingredient_id, fields)
    return _detail(user_id, session, recipe_id)


@router.delete("/{recipe_id}/ingredients/{ingredient_id}", response_model=RecipeDetailOut)
def delete_ingredient(
    recipe_id: uuid.UUID,
    ingredient_id: uuid.UUID,
    user_id: CurrentUserId,
    session: DbSession,
) -> RecipeDetailOut:
    service.delete_ingredient(session, user_id, recipe_id, ingredient_id)
    return _detail(user_id, session, recipe_id)


# ------------------------------------------------------------------- steps


@router.post(
    "/{recipe_id}/steps", response_model=Page[StepOut], status_code=status.HTTP_201_CREATED
)
def add_step(
    recipe_id: uuid.UUID, payload: StepCreate, user_id: CurrentUserId, session: DbSession
) -> Page[StepOut]:
    service.add_step(session, user_id, recipe_id, text=payload.text)
    return Page[StepOut](
        items=[_step(step) for step in service.list_steps(session, user_id, recipe_id)]
    )


@router.put("/{recipe_id}/steps/order", response_model=Page[StepOut])
def reorder_steps(
    recipe_id: uuid.UUID, payload: StepOrder, user_id: CurrentUserId, session: DbSession
) -> Page[StepOut]:
    steps = service.reorder_steps(session, user_id, recipe_id, payload.ids)
    return Page[StepOut](items=[_step(step) for step in steps])


@router.patch("/{recipe_id}/steps/{step_id}", response_model=StepOut)
def update_step(
    recipe_id: uuid.UUID,
    step_id: uuid.UUID,
    payload: StepUpdate,
    user_id: CurrentUserId,
    session: DbSession,
) -> StepOut:
    return _step(service.update_step(session, user_id, recipe_id, step_id, text=payload.text))


@router.delete("/{recipe_id}/steps/{step_id}", response_model=Page[StepOut])
def delete_step(
    recipe_id: uuid.UUID, step_id: uuid.UUID, user_id: CurrentUserId, session: DbSession
) -> Page[StepOut]:
    """Answers with the surviving steps, renumbered.

    A 204 would leave the client holding positions that no longer exist — deleting step 2
    of four renumbers the two below it.
    """
    service.delete_step(session, user_id, recipe_id, step_id)
    return Page[StepOut](
        items=[_step(step) for step in service.list_steps(session, user_id, recipe_id)]
    )


# ------------------------------------------------------------------- meals


@meals_router.get("", response_model=Page[MealOut])
def list_meals(
    user_id: CurrentUserId,
    session: DbSession,
    month: Annotated[str | None, Query(description="YYYY-MM, the account's month")] = None,
    start_day: StartDay = 1,
) -> Page[MealOut]:
    """Every meal in one window — what the calendar's meals layer reads.

    The window is the account's budget month (AD-10, AD-38), not the calendar one, so the
    grid drawn over it and this list cover exactly the same days. Composed at the edge with
    the other seven layers, never joined to them (AD-37).
    """
    start = end = None
    if month is not None:
        start, end = month_range(month, start_day)
    rows = service.list_meals(session, user_id, start=start, end=end)
    return Page[MealOut](items=[_meal(row) for row in rows])


@meals_router.post("", response_model=MealOut, status_code=status.HTTP_201_CREATED)
def create_meal(payload: MealCreate, user_id: CurrentUserId, session: DbSession) -> MealOut:
    row = service.create_meal(
        session,
        user_id,
        eaten_on=payload.eaten_on,
        recipe_id=payload.recipe_id,
        servings=payload.servings,
        food_id=payload.food_id,
        quantity=payload.quantity,
        note=payload.note,
    )
    return _meal(row)


@meals_router.patch("/{meal_id}", response_model=MealOut)
def update_meal(
    meal_id: uuid.UUID, payload: MealUpdate, user_id: CurrentUserId, session: DbSession
) -> MealOut:
    fields = {key: getattr(payload, key) for key in payload.model_fields_set}
    return _meal(service.update_meal(session, user_id, meal_id, fields))


@meals_router.delete("/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meal(meal_id: uuid.UUID, user_id: CurrentUserId, session: DbSession) -> Response:
    service.delete_meal(session, user_id, meal_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
