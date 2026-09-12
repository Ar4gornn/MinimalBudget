"""Story 27.1 — the second-user proof, extended to the five recipe tables (AD-24).

Same shape as the ledger, savings, inventory, gym, habits and mood proofs: connect **as
the runtime role** with B's tenancy and assert zero rows of A's on read, and refusal on
insert, update and delete. Executed rather than read off a policy, which is what the brief
demands and what makes this file worth its runtime.

The one thing here the other proofs did not have is a **second** composite foreign key.
``recipe_ingredients`` points at both ``recipes`` and ``foods``, and ``meal_logs`` points
at both as well. Postgres foreign-key checks always bypass row security — the manual says
so and warns about the covert channel — so RLS alone would let B build a recipe out of A's
foods: B would learn which food ids exist, and A could never delete one of them again.
:func:`test_b_cannot_reference_a_food_of_as_by_id` is the execution of AD-18 against that.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, ProgrammingError

TABLES = ("foods", "recipes", "recipe_ingredients", "recipe_steps", "meal_logs")


def _kitchen(client, user, *, name="Rice", recipe="Dinner"):
    """A food, a recipe using it, a step, and a meal that was eaten."""
    headers = user["headers"]
    food = client.post(
        "/api/foods",
        json={"name": name, "basis": "per_100g", "kcal": "130.00"},
        headers=headers,
    )
    assert food.status_code == 201, food.text
    food = food.json()

    made = client.post("/api/recipes", json={"name": recipe, "servings": 2}, headers=headers)
    assert made.status_code == 201, made.text
    made = made.json()

    added = client.post(
        f"/api/recipes/{made['id']}/ingredients",
        json={"food_id": food["id"], "quantity": "200"},
        headers=headers,
    )
    assert added.status_code == 201, added.text

    step = client.post(
        f"/api/recipes/{made['id']}/steps", json={"text": "Boil it"}, headers=headers
    )
    assert step.status_code == 201, step.text

    meal = client.post(
        "/api/meals", json={"eaten_on": "2026-09-01", "recipe_id": made["id"]}, headers=headers
    )
    assert meal.status_code == 201, meal.text
    return food, made, meal.json()


def test_b_sees_none_of_a_rows(client, user_a, user_b, runtime_connection):
    _kitchen(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        for table in TABLES:
            count = conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()
            assert count == 0, table
    finally:
        conn.close()

    headers = user_b["headers"]
    assert client.get("/api/foods", headers=headers).json()["items"] == []
    assert client.get("/api/recipes", headers=headers).json()["items"] == []
    assert client.get("/api/meals", headers=headers).json()["items"] == []


def test_b_cannot_read_a_recipe_of_as_by_id(client, user_a, user_b):
    """AD-8: not a 403, which would confirm the id exists."""
    _, recipe, meal = _kitchen(client, user_a)
    headers = user_b["headers"]
    assert client.get(f"/api/recipes/{recipe['id']}", headers=headers).status_code == 404
    assert client.delete(f"/api/meals/{meal['id']}", headers=headers).status_code == 404


def test_b_cannot_write_rows_owned_by_a(client, user_a, user_b, runtime_connection):
    _kitchen(client, user_a)

    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(text("UPDATE foods SET kcal = 1")).rowcount == 0
        assert conn.execute(text("UPDATE recipes SET servings = 99")).rowcount == 0
        assert conn.execute(text("UPDATE recipe_ingredients SET quantity = 1")).rowcount == 0
        assert conn.execute(text("UPDATE recipe_steps SET text = 'no'")).rowcount == 0
        assert conn.execute(text("UPDATE meal_logs SET servings = 9")).rowcount == 0
        for table in reversed(TABLES):
            assert conn.execute(text(f"DELETE FROM {table}")).rowcount == 0, table
    finally:
        conn.close()

    # A's rows are all still there and unchanged.
    listed = client.get("/api/recipes", headers=user_a["headers"]).json()["items"]
    detail = client.get(f"/api/recipes/{listed[0]['id']}", headers=user_a["headers"]).json()
    assert detail["servings"] == 2
    assert detail["steps"] == [{"id": detail["steps"][0]["id"], "position": 1, "text": "Boil it"}]
    assert detail["total"]["kcal"] == "260.0000"


def test_b_cannot_smuggle_a_row_in_under_as_user_id(client, user_a, user_b, runtime_connection):
    """The WITH CHECK half of every policy, on the table with no id to enumerate."""
    _kitchen(client, user_a)
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises((ProgrammingError, IntegrityError)):
            conn.execute(
                text(
                    "INSERT INTO foods (user_id, name, basis) "
                    "VALUES (:uid, 'Smuggled', 'per_100g')"
                ),
                {"uid": str(user_a["id"])},
            )
    finally:
        conn.rollback()
        conn.close()


def test_b_cannot_reference_a_food_of_as_by_id(client, user_a, user_b, runtime_connection):
    """AD-18, executed.

    B owns the recipe and stamps the row with B's own ``user_id`` — so the RLS policy is
    perfectly happy with it — and points ``food_id`` at A's rice. The **composite** foreign
    key is what refuses it: ``(B, A's food)`` is not a row in ``foods``.

    Made to fail on purpose by reducing the key to ``FOREIGN KEY (food_id)``: the insert
    succeeded. B then had a recipe whose calories came out of A's food, and A could never
    delete that food again, with no visible reason why.
    """
    a_food, _, _ = _kitchen(client, user_a, name="A's rice", recipe="A's dinner")
    _, b_recipe, _ = _kitchen(client, user_b, name="B's rice", recipe="B's dinner")

    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises((ProgrammingError, IntegrityError)):
            conn.execute(
                text(
                    "INSERT INTO recipe_ingredients "
                    "(user_id, recipe_id, food_id, quantity, unit, position) "
                    "VALUES (:uid, :recipe, :food, 100, 'g', 9)"
                ),
                {
                    "uid": str(user_b["id"]),
                    "recipe": str(b_recipe["id"]),
                    "food": str(a_food["id"]),
                },
            )
    finally:
        conn.rollback()
        conn.close()


def test_b_cannot_log_a_meal_against_as_recipe(client, user_a, user_b, runtime_connection):
    """The same hole on ``meal_logs``, which has its own pair of composite keys."""
    _, a_recipe, _ = _kitchen(client, user_a, name="A's rice", recipe="A's dinner")

    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises((ProgrammingError, IntegrityError)):
            conn.execute(
                text(
                    "INSERT INTO meal_logs (user_id, eaten_on, recipe_id, servings) "
                    "VALUES (:uid, DATE '2026-09-01', :recipe, 1)"
                ),
                {"uid": str(user_b["id"]), "recipe": str(a_recipe["id"])},
            )
    finally:
        conn.rollback()
        conn.close()


def test_an_unset_tenant_sees_nothing(client, user_a, runtime_connection):
    """AD-3: a connection with no ``app.user_id`` matches no row rather than every row."""
    _kitchen(client, user_a)
    conn = runtime_connection(None)
    try:
        for table in TABLES:
            assert conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one() == 0, table
    finally:
        conn.close()


def test_one_accounts_food_names_never_reach_anothers_list(client, user_a, user_b):
    """The name is the leak that matters here: it is what a person would recognise."""
    _kitchen(client, user_a, name="A's secret rice", recipe="A's dinner")
    _kitchen(client, user_b, name="B's rice", recipe="B's dinner")

    listed = client.get("/api/foods", headers=user_b["headers"]).json()["items"]
    assert [row["name"] for row in listed] == ["B's rice"]
