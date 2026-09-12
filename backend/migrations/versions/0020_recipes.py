"""foods, recipes, their steps, and the meals that were eaten

Epic 27. Five tables in one new module, independent of every other (AD-31).

**Nutrition is stored as a rate and never as a total.** A food holds what it contains per
one basis amount — 100 g, 100 ml, or one of the thing — and that is the only nutrition
figure written anywhere. A recipe's totals, its per-serving figures and a day's energy are
all computed on read from those rates and the quantities beside them (AD-9, AD-29, AD-45).
The alternative, a ``kcal`` column on ``recipes``, is wrong the first time somebody
corrects a quantity, and nothing in the row says so.

**Nutrient columns are nullable, and NULL is not zero.** A food whose protein was never
typed still counts its calories. Everything derived reports a count of how many
contributors were NULL beside the partial sum, so an incomplete figure is visibly
incomplete rather than quietly low.

**Recipes carry their own closed unit list**, ``g`` / ``ml`` / ``unit``, and AD-29's
ledger list is untouched. Adding grams to the ledger's list would make ``g`` selectable
beside ``kg`` on an expense, and AD-29 keys a unit-price series by ``(category, unit)``
with no conversion — so a household that typed ``g`` one month and ``kg`` the next would
get two series and no warning. Two lists, each owned by the module that compares within it.

**A meal log is a record, not a plan** (AD-35), and it is one of two shapes held by a
single CHECK: a recipe eaten in some number of servings, or a bare food in some quantity.
Never both, never neither, and never with the other side's columns left behind where a
later edit could revive them — the typed-columns-with-a-CHECK shape Epic 26 settled on for
habit schedules (AD-43).

**Deleting a food or a recipe that has been used is refused (RESTRICT), not nulled.**
AD-35's ``SET NULL (routine_id)`` is right for a gym set — it still records a real weight
after its routine is gone. A meal log nulled off its recipe records nothing at all, since
every nutrition figure lives on the other side of that key; keeping it would mean
snapshotting the totals onto the row, which is the stored derived figure AD-9 forbids. A
category with entries already behaves this way (AD-21).

Revision ID: 0020
Revises: 0019
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect, unprotect

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen here rather than imported from the ORM: a migration is a historical record, and a
# later epic extending either list must do it by altering the constraint, visibly.
BASIS = ("per_100g", "per_100ml", "per_unit")
UNITS = ("g", "ml", "unit")
NUTRIENTS = ("kcal", "protein", "carbs", "fat")

_BASIS_CHECK = "basis IN (" + ", ".join(f"'{b}'" for b in BASIS) + ")"
_UNIT_CHECK = "unit IN (" + ", ".join(f"'{u}'" for u in UNITS) + ")"


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.create_table(
        "foods",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(80), nullable=False),
        # What one stored figure describes. A VARCHAR with a CHECK rather than an enum
        # type, matching habits.schedule_kind: a sixth basis is one ALTER of a constraint.
        sa.Column("basis", sa.String(10), nullable=False),
        # NULL is "not known", and is not zero. Four of them because four is what a macro
        # tracker uses; a fifth is a migration and a form field, and backfills nothing,
        # because no total is stored anywhere.
        *[sa.Column(name, sa.Numeric(8, 2), nullable=True) for name in NUTRIENTS],
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(_BASIS_CHECK, name="foods_basis_supported"),
        # A sanity ceiling, not a business rule: no food is 100,000 kcal per 100 g, and the
        # column is NUMERIC(8,2), so a typo of 1e7 would be an overflow error rather than a
        # refusal that says anything.
        sa.CheckConstraint(
            " AND ".join(
                f"({name} IS NULL OR ({name} >= 0 AND {name} <= 100000.00))" for name in NUTRIENTS
            ),
            name="foods_nutrients_in_range",
        ),
        # AD-18 needs this on the referenced side for the composite keys below.
        sa.UniqueConstraint("user_id", "id", name="foods_user_id_id_key"),
    )
    # AD-12: reference data is unique per account, case-insensitively, with the original
    # casing kept. "Rice" and "rice" are one food.
    op.execute("CREATE UNIQUE INDEX foods_user_name_key ON foods (user_id, lower(name))")
    protect("foods")

    op.create_table(
        "recipes",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("servings", sa.Integer, nullable=False, server_default=sa.text("1")),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("servings >= 1 AND servings <= 100", name="recipes_servings_in_range"),
        sa.UniqueConstraint("user_id", "id", name="recipes_user_id_id_key"),
    )
    op.execute("CREATE UNIQUE INDEX recipes_user_name_key ON recipes (user_id, lower(name))")
    protect("recipes")

    op.create_table(
        "recipe_ingredients",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("recipe_id", uuid_type, nullable=False),
        sa.Column("food_id", uuid_type, nullable=False),
        sa.Column("quantity", sa.Numeric(10, 3), nullable=False),
        # Must match the food's basis. That rule spans two tables, so no CHECK can hold it;
        # it lives in services/recipes.py with a stable code and a test.
        sa.Column("unit", sa.String(4), nullable=False),
        sa.Column("position", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.CheckConstraint("quantity > 0", name="recipe_ingredients_quantity_positive"),
        sa.CheckConstraint(_UNIT_CHECK, name="recipe_ingredients_unit_supported"),
        sa.CheckConstraint("position >= 0", name="recipe_ingredients_position_non_negative"),
        # CASCADE: an ingredient has no meaning without its recipe.
        sa.ForeignKeyConstraint(
            ["user_id", "recipe_id"],
            ["recipes.user_id", "recipes.id"],
            name="recipe_ingredients_recipe_fkey",
            ondelete="CASCADE",
        ),
        # RESTRICT: a food is reference data. Deleting one a recipe uses is a 409.
        sa.ForeignKeyConstraint(
            ["user_id", "food_id"],
            ["foods.user_id", "foods.id"],
            name="recipe_ingredients_food_fkey",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "recipe_ingredients_recipe_idx", "recipe_ingredients", ["user_id", "recipe_id"]
    )
    # Deliberately **no** unique key over (recipe, food): butter in the dough and butter on
    # top are two lines a cook reads separately.
    protect("recipe_ingredients")

    op.create_table(
        "recipe_steps",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("recipe_id", uuid_type, nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("text", sa.String(1000), nullable=False),
        sa.CheckConstraint("position >= 1", name="recipe_steps_position_positive"),
        sa.ForeignKeyConstraint(
            ["user_id", "recipe_id"],
            ["recipes.user_id", "recipes.id"],
            name="recipe_steps_recipe_fkey",
            ondelete="CASCADE",
        ),
    )
    # DEFERRABLE INITIALLY DEFERRED, which is the whole reason a reorder is one statement.
    # An immediate unique key fails halfway through renumbering 1,2,3 to 3,1,2 — the first
    # UPDATE collides with a row that has not moved yet — and the workarounds are all worse:
    # a temporary negative offset (two extra statements and a window where the data is
    # nonsense) or dropping the constraint for the duration (a window with no constraint).
    op.execute(
        "ALTER TABLE recipe_steps ADD CONSTRAINT recipe_steps_position_key "
        "UNIQUE (user_id, recipe_id, position) DEFERRABLE INITIALLY DEFERRED"
    )
    protect("recipe_steps")

    op.create_table(
        "meal_logs",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        # AD-10: the calendar day the person names, not the instant they tapped, so the
        # same meal lands on the same day on a phone and a laptop.
        sa.Column("eaten_on", sa.Date, nullable=False),
        sa.Column("recipe_id", uuid_type, nullable=True),
        sa.Column("servings", sa.Numeric(6, 3), nullable=True),
        sa.Column("food_id", uuid_type, nullable=True),
        sa.Column("quantity", sa.Numeric(10, 3), nullable=True),
        sa.Column("unit", sa.String(4), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        # One shape or the other, and the unused side is NULL rather than left over.
        sa.CheckConstraint(
            "(recipe_id IS NOT NULL AND servings IS NOT NULL"
            " AND food_id IS NULL AND quantity IS NULL AND unit IS NULL)"
            " OR "
            "(food_id IS NOT NULL AND quantity IS NOT NULL AND unit IS NOT NULL"
            " AND recipe_id IS NULL AND servings IS NULL)",
            name="meal_logs_shape",
        ),
        sa.CheckConstraint("servings IS NULL OR servings > 0", name="meal_logs_servings_positive"),
        sa.CheckConstraint("quantity IS NULL OR quantity > 0", name="meal_logs_quantity_positive"),
        sa.CheckConstraint(f"unit IS NULL OR {_UNIT_CHECK}", name="meal_logs_unit_supported"),
        # A sanity floor, the same one habits and mood use. "Not in the future" cannot be a
        # CHECK — current_date is not IMMUTABLE — so it lives in the service with a test.
        sa.CheckConstraint("eaten_on >= DATE '2000-01-01'", name="meal_logs_eaten_on_sane"),
        sa.ForeignKeyConstraint(
            ["user_id", "recipe_id"],
            ["recipes.user_id", "recipes.id"],
            name="meal_logs_recipe_fkey",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "food_id"],
            ["foods.user_id", "foods.id"],
            name="meal_logs_food_fkey",
            ondelete="RESTRICT",
        ),
    )
    op.create_index("meal_logs_user_eaten_idx", "meal_logs", ["user_id", "eaten_on"])
    protect("meal_logs")


def downgrade() -> None:
    unprotect("meal_logs")
    op.drop_table("meal_logs")
    unprotect("recipe_steps")
    op.drop_table("recipe_steps")
    unprotect("recipe_ingredients")
    op.drop_table("recipe_ingredients")
    unprotect("recipes")
    op.drop_table("recipes")
    unprotect("foods")
    op.drop_table("foods")
