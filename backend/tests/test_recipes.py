"""Epic 27 — foods, recipes, nutrition and meals.

The figures below are hand-computed rather than read back from the code, because a test
that asserts whatever the implementation produced proves only that it is deterministic.

Two of these matter more than the rest:

* :func:`test_sql_total_equals_the_sum_of_the_python_lines` holds the module's **two**
  implementations of one arithmetic equal — the SQL ``GROUP BY`` that computes a recipe's
  totals, and the Python function that computes one line's contribution. AD-30's warning
  about a predicate written twice applies to arithmetic as well, and AD-29 already
  specifies exactly this guard for unit prices.
* :func:`test_a_missing_nutrient_is_counted_not_zeroed` is the reason nutrient columns are
  nullable at all. Summing NULL as zero would produce a total that is quietly too low and
  says nothing about it.
"""

import datetime as dt
from decimal import Decimal

TODAY = dt.date.today()
YESTERDAY = TODAY - dt.timedelta(days=1)
TOMORROW = TODAY + dt.timedelta(days=1)


def make_food(client, user, **body):
    payload = {"name": "Rice", "basis": "per_100g", **body}
    response = client.post("/api/foods", json=payload, headers=user["headers"])
    assert response.status_code == 201, response.text
    return response.json()


def make_recipe(client, user, **body):
    payload = {"name": "Rice and eggs", "servings": 2, **body}
    response = client.post("/api/recipes", json=payload, headers=user["headers"])
    assert response.status_code == 201, response.text
    return response.json()


def add_ingredient(client, user, recipe_id, food_id, quantity, **body):
    response = client.post(
        f"/api/recipes/{recipe_id}/ingredients",
        json={"food_id": food_id, "quantity": quantity, **body},
        headers=user["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


def a_kitchen(client, user):
    """Rice (per 100 g) and eggs (per unit), and a two-serving recipe using both.

    Rice knows its carbs and not its fat; an egg knows neither. So every branch of the
    "some contributors have it, all of them lack it" rule is exercised by one fixture.
    """
    rice = make_food(
        client, user, name="Rice", basis="per_100g", kcal="130.00", protein="2.70", carbs="28.00"
    )
    egg = make_food(client, user, name="Egg", basis="per_unit", kcal="78.00", protein="6.30")
    recipe = make_recipe(client, user)
    add_ingredient(client, user, recipe["id"], rice["id"], "200")
    detail = add_ingredient(client, user, recipe["id"], egg["id"], "3")
    return rice, egg, recipe, detail


# ------------------------------------------------------------------- foods


def test_a_food_reports_the_unit_its_basis_obliges(client, user_a):
    """The basis-to-unit rule is the server's, so a client cannot re-derive it wrongly."""
    assert make_food(client, user_a, name="Rice", basis="per_100g")["unit"] == "g"
    assert make_food(client, user_a, name="Milk", basis="per_100ml")["unit"] == "ml"
    assert make_food(client, user_a, name="Egg", basis="per_unit")["unit"] == "unit"


def test_a_second_food_of_the_same_name_is_refused(client, user_a):
    make_food(client, user_a, name="Rice")
    response = client.post(
        "/api/foods", json={"name": "  rice  ", "basis": "per_100g"}, headers=user_a["headers"]
    )
    assert response.status_code == 409
    assert response.json()["code"] == "food_name_taken"


def test_a_stored_nutrient_round_trips_unchanged(client, user_a):
    """The client echoes back what it received when it edits a food.

    Two places out and two places in. Serialising the stored figure as a four-place rate
    would send "130.0000", which the two-place input validator then refuses — a food nobody
    could edit twice.
    """
    food = make_food(client, user_a, kcal="130.00")
    assert food["kcal"] == "130.00"
    response = client.patch(
        f"/api/foods/{food['id']}", json={"kcal": food["kcal"]}, headers=user_a["headers"]
    )
    assert response.status_code == 200, response.text
    assert response.json()["kcal"] == "130.00"


def test_a_nutrient_can_be_cleared_back_to_not_known(client, user_a):
    food = make_food(client, user_a, kcal="130.00", protein="2.70")
    response = client.patch(
        f"/api/foods/{food['id']}", json={"protein": None}, headers=user_a["headers"]
    )
    assert response.status_code == 200, response.text
    assert response.json()["protein"] is None
    assert response.json()["kcal"] == "130.00"


def test_nutrition_is_never_a_json_number(client, user_a):
    """AD-5's rule, applied to nutrition: a string on the wire, never a float."""
    response = client.post(
        "/api/foods", json={"name": "Rice", "basis": "per_100g", "kcal": 130.5},
        headers=user_a["headers"],
    )
    assert response.status_code == 422


# ------------------------------------------------------- derived nutrition


def test_a_recipe_totals_its_ingredients_and_divides_by_its_servings(client, user_a):
    _, _, _, detail = a_kitchen(client, user_a)

    # 200 g of rice at 130 kcal/100 g is 260; three eggs at 78 kcal each is 234.
    assert detail["total"]["kcal"] == "494.0000"
    # 2.70 * 2 + 6.30 * 3
    assert detail["total"]["protein"] == "24.3000"
    assert detail["servings"] == 2
    assert detail["per_serving"]["kcal"] == "247.0000"
    assert detail["per_serving"]["protein"] == "12.1500"


def test_each_ingredient_carries_its_own_share(client, user_a):
    _, _, _, detail = a_kitchen(client, user_a)
    lines = {row["food_name"]: row for row in detail["ingredients"]}
    assert lines["Rice"]["nutrition"]["kcal"] == "260.0000"
    assert lines["Rice"]["unit"] == "g"
    assert lines["Egg"]["nutrition"]["kcal"] == "234.0000"
    assert lines["Egg"]["unit"] == "unit"


def test_sql_total_equals_the_sum_of_the_python_lines(client, user_a):
    """The one guard against the module's two implementations drifting apart.

    Made to fail on purpose by changing the SQL basis divisor from 100 to 1000: the totals
    dropped to a tenth while every ingredient line stayed right, which is exactly the shape
    of the bug this exists to catch — a page where the parts and the whole disagree.
    """
    _, _, _, detail = a_kitchen(client, user_a)
    for nutrient in ("kcal", "protein", "carbs"):
        lines = [
            row["nutrition"][nutrient]
            for row in detail["ingredients"]
            if row["nutrition"][nutrient] is not None
        ]
        # Decimal, not float: summing "2.7000" and "18.9000" as floats gives
        # 24.299999999999997, which would make this guard fail for a reason that has
        # nothing to do with the two implementations it is comparing.
        summed = sum((Decimal(value) for value in lines), Decimal(0))
        assert Decimal(detail["total"][nutrient]) == summed, nutrient


def test_a_missing_nutrient_is_counted_not_zeroed(client, user_a):
    """Rice has carbs and the egg does not; neither has a fat figure."""
    _, _, _, detail = a_kitchen(client, user_a)

    # A partial total, and a count saying how partial.
    assert detail["total"]["carbs"] == "56.0000"
    assert detail["total"]["unknown"]["carbs"] == 1
    # Nothing knew its fat, so there is no figure at all — 0.0000 would be a claim that
    # this recipe is fat free.
    assert detail["total"]["fat"] is None
    assert detail["total"]["unknown"]["fat"] == 2
    # And everything that was known is complete.
    assert detail["total"]["unknown"]["kcal"] == 0


def test_an_empty_recipe_has_no_figures_rather_than_zeroes(client, user_a):
    recipe = make_recipe(client, user_a, name="Nothing yet")
    detail = client.get(f"/api/recipes/{recipe['id']}", headers=user_a["headers"]).json()
    assert detail["total"]["kcal"] is None
    assert detail["per_serving"]["kcal"] is None
    assert detail["total"]["unknown"] == {"kcal": 0, "protein": 0, "carbs": 0, "fat": 0}


def test_correcting_a_quantity_moves_every_derived_figure(client, user_a):
    """The point of storing no total: nothing has to be recomputed or invalidated."""
    _, _, recipe, detail = a_kitchen(client, user_a)
    rice_line = next(row for row in detail["ingredients"] if row["food_name"] == "Rice")

    response = client.patch(
        f"/api/recipes/{recipe['id']}/ingredients/{rice_line['id']}",
        json={"quantity": "100"},
        headers=user_a["headers"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"]["kcal"] == "364.0000"  # 130 + 234
    assert response.json()["per_serving"]["kcal"] == "182.0000"


def test_changing_the_serving_count_re_judges_without_touching_a_row(client, user_a):
    """AD-40's line: a judgement moves freely, the fact under it does not change."""
    _, _, recipe, detail = a_kitchen(client, user_a)
    ingredient_ids = sorted(row["id"] for row in detail["ingredients"])

    response = client.patch(
        f"/api/recipes/{recipe['id']}", json={"servings": 4}, headers=user_a["headers"]
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"]["kcal"] == "494.0000"
    assert body["per_serving"]["kcal"] == "123.5000"
    assert sorted(row["id"] for row in body["ingredients"]) == ingredient_ids


# ------------------------------------------------------------ units and basis


def test_an_ingredient_takes_its_unit_from_the_food(client, user_a):
    food = make_food(client, user_a, name="Milk", basis="per_100ml")
    recipe = make_recipe(client, user_a)
    detail = add_ingredient(client, user_a, recipe["id"], food["id"], "250")
    assert detail["ingredients"][0]["unit"] == "ml"


def test_a_unit_that_contradicts_the_basis_is_refused(client, user_a):
    """Not silently corrected: a form showing the wrong unit is a bug somebody should see."""
    food = make_food(client, user_a, name="Milk", basis="per_100ml")
    recipe = make_recipe(client, user_a)
    response = client.post(
        f"/api/recipes/{recipe['id']}/ingredients",
        json={"food_id": food["id"], "quantity": "250", "unit": "g"},
        headers=user_a["headers"],
    )
    assert response.status_code == 422
    assert response.json()["code"] == "unit_basis_mismatch"


def test_a_unit_outside_the_closed_list_is_refused(client, user_a):
    """AD-29's ledger units are a different vocabulary and are not accepted here."""
    food = make_food(client, user_a)
    recipe = make_recipe(client, user_a)
    response = client.post(
        f"/api/recipes/{recipe['id']}/ingredients",
        json={"food_id": food["id"], "quantity": "1", "unit": "kg"},
        headers=user_a["headers"],
    )
    assert response.status_code == 422


def test_a_basis_is_free_until_something_uses_it_then_locked(client, user_a):
    """AD-36: a unit that reinterprets stored numbers locks; the numbers beside it do not.

    Made to fail on purpose by dropping the usage check: the basis changed to per_100ml
    while the ingredient still said "200", which silently turned 200 grams of rice into
    200 millilitres of it — a wrong figure with nothing in the row to show it moved.
    """
    food = make_food(client, user_a, name="Rice", basis="per_100g", kcal="130.00")
    free = client.patch(
        f"/api/foods/{food['id']}", json={"basis": "per_100ml"}, headers=user_a["headers"]
    )
    assert free.status_code == 200, free.text
    assert free.json()["unit"] == "ml"

    recipe = make_recipe(client, user_a)
    add_ingredient(client, user_a, recipe["id"], food["id"], "200")

    locked = client.patch(
        f"/api/foods/{food['id']}", json={"basis": "per_100g"}, headers=user_a["headers"]
    )
    assert locked.status_code == 409
    assert locked.json()["code"] == "food_basis_locked"

    # The nutrition figures beside it are still free: they are a judgement, not a unit.
    corrected = client.patch(
        f"/api/foods/{food['id']}", json={"kcal": "128.00"}, headers=user_a["headers"]
    )
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["kcal"] == "128.00"


# --------------------------------------------------------------- deletion


def test_a_food_a_recipe_uses_cannot_be_deleted(client, user_a):
    rice, _, _, _ = a_kitchen(client, user_a)
    response = client.delete(f"/api/foods/{rice['id']}", headers=user_a["headers"])
    assert response.status_code == 409
    assert response.json()["code"] == "food_in_use"


def test_a_food_that_has_been_eaten_cannot_be_deleted(client, user_a):
    food = make_food(client, user_a)
    client.post(
        "/api/meals",
        json={"eaten_on": TODAY.isoformat(), "food_id": food["id"], "quantity": "150"},
        headers=user_a["headers"],
    )
    response = client.delete(f"/api/foods/{food['id']}", headers=user_a["headers"])
    assert response.status_code == 409
    assert response.json()["code"] == "food_in_use"


def test_a_recipe_that_has_been_eaten_is_kept(client, user_a):
    """RESTRICT rather than SET NULL: a meal log nulled off its recipe records nothing."""
    _, _, recipe, _ = a_kitchen(client, user_a)
    client.post(
        "/api/meals",
        json={"eaten_on": TODAY.isoformat(), "recipe_id": recipe["id"]},
        headers=user_a["headers"],
    )
    response = client.delete(f"/api/recipes/{recipe['id']}", headers=user_a["headers"])
    assert response.status_code == 409
    assert response.json()["code"] == "recipe_in_use"


def test_an_uneaten_recipe_deletes_and_takes_its_ingredients(client, user_a):
    rice, _, recipe, _ = a_kitchen(client, user_a)
    headers = user_a["headers"]
    assert client.delete(f"/api/recipes/{recipe['id']}", headers=headers).status_code == 204
    # The ingredients cascaded, so the food is free again.
    assert client.delete(f"/api/foods/{rice['id']}", headers=user_a["headers"]).status_code == 204


# ------------------------------------------------------------------- steps


def steps_of(client, user, recipe_id):
    detail = client.get(f"/api/recipes/{recipe_id}", headers=user["headers"]).json()
    return [(step["position"], step["text"]) for step in detail["steps"]]


def add_steps(client, user, recipe_id, *texts):
    for text in texts:
        response = client.post(
            f"/api/recipes/{recipe_id}/steps", json={"text": text}, headers=user["headers"]
        )
        assert response.status_code == 201, response.text


def test_steps_are_numbered_from_one_in_the_order_they_are_added(client, user_a):
    recipe = make_recipe(client, user_a)
    add_steps(client, user_a, recipe["id"], "Boil water", "Add rice", "Wait")
    assert steps_of(client, user_a, recipe["id"]) == [
        (1, "Boil water"),
        (2, "Add rice"),
        (3, "Wait"),
    ]


def test_a_reorder_renumbers_every_step_in_one_go(client, user_a):
    """The deferred unique key is what makes this a plain sequence of UPDATEs.

    Made to fail on purpose by declaring the key immediately: moving 1,2,3 to 3,1,2 raised
    ``duplicate key value violates unique constraint`` on the first statement, against a
    row that had not moved yet.
    """
    recipe = make_recipe(client, user_a)
    add_steps(client, user_a, recipe["id"], "Boil water", "Add rice", "Wait")
    ids = [step["id"] for step in
           client.get(f"/api/recipes/{recipe['id']}", headers=user_a["headers"]).json()["steps"]]

    response = client.put(
        f"/api/recipes/{recipe['id']}/steps/order",
        json={"ids": [ids[2], ids[0], ids[1]]},
        headers=user_a["headers"],
    )
    assert response.status_code == 200, response.text
    assert [(s["position"], s["text"]) for s in response.json()["items"]] == [
        (1, "Wait"),
        (2, "Boil water"),
        (3, "Add rice"),
    ]


def test_a_partial_order_is_refused(client, user_a):
    recipe = make_recipe(client, user_a)
    add_steps(client, user_a, recipe["id"], "Boil water", "Add rice", "Wait")
    ids = [step["id"] for step in
           client.get(f"/api/recipes/{recipe['id']}", headers=user_a["headers"]).json()["steps"]]

    response = client.put(
        f"/api/recipes/{recipe['id']}/steps/order",
        json={"ids": [ids[0], ids[1]]},
        headers=user_a["headers"],
    )
    assert response.status_code == 422
    assert response.json()["code"] == "step_order_invalid"
    assert steps_of(client, user_a, recipe["id"])[0] == (1, "Boil water")


def test_deleting_a_step_closes_the_gap(client, user_a):
    """Leaving 1, 3, 4 would render as "step 1, 2, 3" anyway — the stored order and the
    displayed one would have quietly stopped agreeing."""
    recipe = make_recipe(client, user_a)
    add_steps(client, user_a, recipe["id"], "Boil water", "Add rice", "Wait")
    ids = [step["id"] for step in
           client.get(f"/api/recipes/{recipe['id']}", headers=user_a["headers"]).json()["steps"]]

    response = client.delete(
        f"/api/recipes/{recipe['id']}/steps/{ids[0]}", headers=user_a["headers"]
    )
    assert response.status_code == 200, response.text
    assert [(s["position"], s["text"]) for s in response.json()["items"]] == [
        (1, "Add rice"),
        (2, "Wait"),
    ]


# ------------------------------------------------------------------- meals


def test_eating_a_recipe_defaults_to_one_serving(client, user_a):
    _, _, recipe, _ = a_kitchen(client, user_a)
    response = client.post(
        "/api/meals",
        json={"eaten_on": TODAY.isoformat(), "recipe_id": recipe["id"]},
        headers=user_a["headers"],
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["servings"] == "1.000"
    assert body["recipe_name"] == "Rice and eggs"
    assert body["nutrition"]["kcal"] == "247.0000"


def test_a_portion_scales_the_per_serving_figure(client, user_a):
    _, _, recipe, _ = a_kitchen(client, user_a)
    response = client.post(
        "/api/meals",
        json={"eaten_on": TODAY.isoformat(), "recipe_id": recipe["id"], "servings": "0.5"},
        headers=user_a["headers"],
    )
    assert response.status_code == 201, response.text
    # Half of 247 kcal, and half of 12.15 g of protein.
    assert response.json()["nutrition"]["kcal"] == "123.5000"
    assert response.json()["nutrition"]["protein"] == "6.0750"


def test_a_bare_food_is_eaten_in_its_own_unit(client, user_a):
    """"I ate an apple" must not require inventing a one-ingredient recipe."""
    rice = make_food(client, user_a, kcal="130.00")
    response = client.post(
        "/api/meals",
        json={"eaten_on": TODAY.isoformat(), "food_id": rice["id"], "quantity": "150"},
        headers=user_a["headers"],
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["unit"] == "g"
    assert body["food_name"] == "Rice"
    assert body["recipe_id"] is None
    assert body["nutrition"]["kcal"] == "195.0000"


def test_a_meal_names_one_thing_or_the_other(client, user_a):
    rice, _, recipe, _ = a_kitchen(client, user_a)
    both = client.post(
        "/api/meals",
        json={
            "eaten_on": TODAY.isoformat(),
            "recipe_id": recipe["id"],
            "food_id": rice["id"],
            "quantity": "10",
        },
        headers=user_a["headers"],
    )
    assert both.status_code == 422
    neither = client.post(
        "/api/meals", json={"eaten_on": TODAY.isoformat()}, headers=user_a["headers"]
    )
    assert neither.status_code == 422


def test_a_recipe_is_not_eaten_in_a_quantity(client, user_a):
    _, _, recipe, _ = a_kitchen(client, user_a)
    response = client.post(
        "/api/meals",
        json={"eaten_on": TODAY.isoformat(), "recipe_id": recipe["id"], "quantity": "200"},
        headers=user_a["headers"],
    )
    assert response.status_code == 422


def test_a_meal_cannot_be_in_the_future(client, user_a):
    """A record describes what happened. Tuesday's dinner is a plan, and a different table."""
    _, _, recipe, _ = a_kitchen(client, user_a)
    response = client.post(
        "/api/meals",
        json={"eaten_on": TOMORROW.isoformat(), "recipe_id": recipe["id"]},
        headers=user_a["headers"],
    )
    assert response.status_code == 422
    assert response.json()["code"] == "meal_in_future"


def test_a_meal_can_be_amended_but_not_re_pointed(client, user_a):
    rice, _, recipe, _ = a_kitchen(client, user_a)
    meal = client.post(
        "/api/meals",
        json={"eaten_on": TODAY.isoformat(), "recipe_id": recipe["id"]},
        headers=user_a["headers"],
    ).json()

    amended = client.patch(
        f"/api/meals/{meal['id']}",
        json={"servings": "2", "eaten_on": YESTERDAY.isoformat(), "note": "with chilli"},
        headers=user_a["headers"],
    )
    assert amended.status_code == 200, amended.text
    assert amended.json()["nutrition"]["kcal"] == "494.0000"
    assert amended.json()["eaten_on"] == YESTERDAY.isoformat()

    # A recipe eaten in servings has no quantity to set; saying so beats a 500 later.
    wrong = client.patch(
        f"/api/meals/{meal['id']}", json={"quantity": "200"}, headers=user_a["headers"]
    )
    assert wrong.status_code == 422
    assert wrong.json()["code"] == "meal_shape_mismatch"


def test_meals_are_listed_in_the_accounts_month(client, user_a):
    """AD-10/AD-38: the same window the calendar grid is drawn over."""
    _, _, recipe, _ = a_kitchen(client, user_a)
    client.post(
        "/api/meals",
        json={"eaten_on": TODAY.isoformat(), "recipe_id": recipe["id"]},
        headers=user_a["headers"],
    )
    this_month = TODAY.strftime("%Y-%m")
    listed = client.get(f"/api/meals?month={this_month}", headers=user_a["headers"]).json()
    assert len(listed["items"]) == 1

    other = (TODAY.replace(day=1) - dt.timedelta(days=40)).strftime("%Y-%m")
    assert client.get(f"/api/meals?month={other}", headers=user_a["headers"]).json()["items"] == []


def test_deleting_a_meal_frees_the_recipe_again(client, user_a):
    _, _, recipe, _ = a_kitchen(client, user_a)
    meal = client.post(
        "/api/meals",
        json={"eaten_on": TODAY.isoformat(), "recipe_id": recipe["id"]},
        headers=user_a["headers"],
    ).json()
    headers = user_a["headers"]
    assert client.delete(f"/api/meals/{meal['id']}", headers=headers).status_code == 204
    assert client.delete(f"/api/recipes/{recipe['id']}", headers=headers).status_code == 204


def test_another_accounts_row_is_a_404_not_a_403(client, user_a, user_b):
    """AD-8, on every id this module takes."""
    rice, _, recipe, detail = a_kitchen(client, user_a)
    headers = user_b["headers"]
    assert client.get(f"/api/recipes/{recipe['id']}", headers=headers).status_code == 404
    assert client.patch(
        f"/api/foods/{rice['id']}", json={"kcal": "1.00"}, headers=headers
    ).status_code == 404
    assert client.delete(f"/api/foods/{rice['id']}", headers=headers).status_code == 404
    # And B cannot pin A's food into B's own recipe by id, which is the AD-18 hole.
    b_recipe = make_recipe(client, user_b, name="B's dinner")
    response = client.post(
        f"/api/recipes/{b_recipe['id']}/ingredients",
        json={"food_id": rice["id"], "quantity": "10"},
        headers=headers,
    )
    assert response.status_code == 404
    assert response.json()["code"] == "food_not_found"
