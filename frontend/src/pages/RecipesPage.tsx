import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type { FoodInput } from "../api/client";
import { FOOD_BASES, type Food, type FoodBasis, type Meal, type Recipe } from "../api/types";
import { useOptionalAuth } from "../auth/AuthContext";
import { Card, Empty, ErrorBanner, TableWrap } from "../components/ui";
import { useToast } from "../components/Toast";
import { useT } from "../i18n";
import { errorMessage, loadErrorMessage } from "../i18n/errors";
import { budgetMonth } from "../months";
import { NUTRIENTS, basisLabel, formatNutrient, quantityLabel, trim } from "../nutrition";

/**
 * The recipe book, the meals recorded out of it, and the foods it is all built on (Epic 27).
 *
 * **Three cards rather than three tabs.** A food and a recipe are not alternatives you
 * choose between; adding a recipe almost always means adding the food it needs a moment
 * later, and a tab would put a navigation between the two halves of one task. The lower two
 * collapse, which is what somebody who has already typed their pantry wants.
 *
 * **Nothing here computes nutrition.** Every figure came off the wire already derived,
 * because the arithmetic lives in one place on the server and a second copy in the client is
 * exactly the drift AD-30 exists to prevent.
 */
export function RecipesPage() {
  const t = useT();
  const toast = useToast();
  const startDay = useOptionalAuth()?.user?.budget_start_day ?? 1;

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [servings, setServings] = useState("2");
  const [saving, setSaving] = useState(false);

  const [foodName, setFoodName] = useState("");
  const [basis, setBasis] = useState<FoodBasis>("per_100g");
  const [nutrients, setNutrients] = useState<Record<string, string>>({});
  const [savingFood, setSavingFood] = useState(false);

  // Which food is being edited, and the draft of it. The row swaps into inputs rather than
  // opening a dialog: there are five values and they are already laid out in a table.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftBasis, setDraftBasis] = useState<FoodBasis>("per_100g");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, pantry, eaten] = await Promise.all([
        api.listRecipes(),
        api.listFoods(),
        // The account's month, the window every other month-shaped view uses (AD-10).
        api.listMeals({ month: budgetMonth(startDay) }),
      ]);
      setRecipes(list);
      setFoods(pantry);
      setMeals(eaten);
      setError(null);
    } catch (caught) {
      setError(loadErrorMessage(t, caught, "rec.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [t, startDay]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addRecipe(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await api.createRecipe({ name: name.trim(), servings: Number(servings) || 1 });
      setName("");
      await load();
    } catch (caught) {
      setError(errorMessage(t, caught, "rec.couldNotSave"));
    } finally {
      setSaving(false);
    }
  }

  async function addFood(event: FormEvent) {
    event.preventDefault();
    if (!foodName.trim() || savingFood) return;
    setSavingFood(true);
    try {
      const body: FoodInput = { name: foodName.trim(), basis };
      for (const key of NUTRIENTS) {
        const typed = (nutrients[key] ?? "").trim();
        // An empty box is *not known*, which is a different claim from zero — so the key is
        // omitted rather than sent as "0".
        if (typed) body[key] = typed;
      }
      await api.createFood(body);
      setFoodName("");
      setNutrients({});
      await load();
    } catch (caught) {
      setError(errorMessage(t, caught, "rec.couldNotSave"));
    } finally {
      setSavingFood(false);
    }
  }

  function startEditing(food: Food) {
    setEditing(food.id);
    setDraftBasis(food.basis);
    setDraft(
      Object.fromEntries(NUTRIENTS.map((key) => [key, food[key] ?? ""])) as Record<string, string>,
    );
  }

  async function saveFood(food: Food) {
    try {
      // Every nutrient is sent, cleared ones as an explicit null: an emptied box means *not
      // known*, and omitting the key would leave the wrong figure exactly where it was.
      const body: Partial<FoodInput> = { basis: draftBasis };
      for (const key of NUTRIENTS) {
        const typed = (draft[key] ?? "").trim();
        body[key] = typed === "" ? null : typed;
      }
      await api.updateFood(food.id, body);
      setEditing(null);
      await load();
    } catch (caught) {
      // A basis is refused once a recipe or a meal depends on it (AD-36). The code carries
      // the reason; the words are the client's (AD-44).
      toast.show(errorMessage(t, caught, "rec.couldNotSave"), { tone: "error" });
    }
  }

  async function removeFood(food: Food) {
    try {
      await api.deleteFood(food.id);
      await load();
    } catch (caught) {
      toast.show(errorMessage(t, caught, "rec.couldNotDelete"), { tone: "error" });
    }
  }

  async function removeMeal(meal: Meal) {
    try {
      await api.deleteMeal(meal.id);
      await load();
    } catch (caught) {
      toast.show(errorMessage(t, caught, "rec.couldNotDelete"), { tone: "error" });
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 18, marginTop: 0 }}>{t("rec.title")}</h1>
      <ErrorBanner message={error} />

      <Card title={t("rec.yours")}>
        {loading ? null : recipes.length === 0 ? (
          <Empty>{t("rec.none")}</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t("rec.name")}</th>
                  <th>{t("rec.servings")}</th>
                  <th>{t("rec.perServing")}</th>
                  <th>{t("rec.ingredients")}</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => {
                  const kcal = formatNutrient("kcal", recipe.per_serving.kcal);
                  return (
                    <tr key={recipe.id}>
                      <td>
                        <Link
                          to={`/recipes/${recipe.id}`}
                          aria-label={t("rec.open", { name: recipe.name })}
                        >
                          {recipe.name}
                        </Link>
                      </td>
                      <td>{t.n("rec.servingsCount", recipe.servings)}</td>
                      <td>
                        {kcal === null ? (
                          <span className="hint">{t("rec.notKnown")}</span>
                        ) : (
                          `${kcal} ${t("rec.kcalUnit")}`
                        )}
                      </td>
                      <td>{recipe.ingredient_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}

        <form onSubmit={addRecipe} className="row" style={{ gap: 8, marginTop: 12 }}>
          <label>
            {t("rec.name")}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("rec.namePlaceholder")}
              maxLength={80}
              required
            />
          </label>
          <label>
            {t("rec.servings")}
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={servings}
              onChange={(event) => setServings(event.target.value)}
            />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? t("rec.adding") : t("rec.add")}
          </button>
        </form>
        <p className="hint">{t("rec.servingsHint")}</p>
      </Card>

      {/* The one place a recorded meal can be taken back. The calendar shows meals but is
          deliberately a window rather than a workbench, and the recipe page records them
          without listing them — so without this card a mis-tap would be permanent. */}
      <Card title={t("rec.meals")} collapseKey="recipes.meals" summary={String(meals.length)}>
        {loading ? null : meals.length === 0 ? (
          <Empty>{t("rec.mealsNone")}</Empty>
        ) : (
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {meals.map((meal) => {
              const kcal = formatNutrient("kcal", meal.nutrition.kcal);
              const what =
                meal.servings === null
                  ? `${quantityLabel(meal.quantity ?? "", meal.unit ?? "unit", t)} ${
                      meal.food_name ?? ""
                    }`
                  : t("rec.mealServings", {
                      servings: trim(meal.servings),
                      name: meal.recipe_name ?? "",
                    });
              return (
                <li key={meal.id} style={{ marginBottom: 4 }}>
                  <span className="hint">{meal.eaten_on}</span> {what}
                  {kcal === null ? null : (
                    <span className="hint">
                      {" "}
                      · {kcal} {t("rec.kcalUnit")}
                    </span>
                  )}{" "}
                  <button
                    type="button"
                    className="quiet"
                    aria-label={t("rec.mealRemove")}
                    onClick={() => void removeMeal(meal)}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={t("rec.foods")} collapseKey="recipes.foods" summary={String(foods.length)}>
        <p className="hint" style={{ marginTop: 0 }}>
          {t("rec.foodsHint")}
        </p>
        {loading ? null : foods.length === 0 ? (
          <Empty>{t("rec.foodsNone")}</Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t("rec.foodName")}</th>
                  <th>{t("rec.basis")}</th>
                  {NUTRIENTS.map((key) => (
                    <th key={key}>{t(`rec.${key}` as "rec.kcal")}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {foods.map((food) =>
                  editing === food.id ? (
                    <tr key={food.id}>
                      <td>{food.name}</td>
                      <td>
                        <select
                          aria-label={t("rec.basis")}
                          value={draftBasis}
                          onChange={(event) => setDraftBasis(event.target.value as FoodBasis)}
                        >
                          {FOOD_BASES.map((option) => (
                            <option key={option} value={option}>
                              {basisLabel(option, t)}
                            </option>
                          ))}
                        </select>
                      </td>
                      {NUTRIENTS.map((key) => (
                        <td key={key}>
                          <input
                            inputMode="decimal"
                            aria-label={t(`rec.${key}` as "rec.kcal")}
                            value={draft[key] ?? ""}
                            onChange={(event) =>
                              setDraft((was) => ({ ...was, [key]: event.target.value }))
                            }
                          />
                        </td>
                      ))}
                      <td>
                        <button type="button" onClick={() => void saveFood(food)}>
                          {t("rec.save")}
                        </button>{" "}
                        <button type="button" className="quiet" onClick={() => setEditing(null)}>
                          {t("rec.cancel")}
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={food.id}>
                      <td>{food.name}</td>
                      <td>{basisLabel(food.basis, t)}</td>
                      {NUTRIENTS.map((key) => (
                        <td key={key}>
                          {food[key] === null ? <span className="hint">—</span> : food[key]}
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          className="quiet"
                          aria-label={t("rec.editFood", { name: food.name })}
                          onClick={() => startEditing(food)}
                        >
                          ✎
                        </button>{" "}
                        <button
                          type="button"
                          className="quiet"
                          aria-label={t("rec.deleteFood", { name: food.name })}
                          onClick={() => void removeFood(food)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </TableWrap>
        )}

        <form onSubmit={addFood} className="row" style={{ gap: 8, marginTop: 12 }}>
          <label>
            {t("rec.foodName")}
            <input
              value={foodName}
              onChange={(event) => setFoodName(event.target.value)}
              placeholder={t("rec.foodNamePlaceholder")}
              maxLength={80}
              required
            />
          </label>
          <label>
            {t("rec.basis")}
            <select value={basis} onChange={(event) => setBasis(event.target.value as FoodBasis)}>
              {FOOD_BASES.map((option) => (
                <option key={option} value={option}>
                  {basisLabel(option, t)}
                </option>
              ))}
            </select>
          </label>
          {NUTRIENTS.map((key) => (
            <label key={key}>
              {t(`rec.${key}` as "rec.kcal")}
              <input
                inputMode="decimal"
                value={nutrients[key] ?? ""}
                onChange={(event) =>
                  setNutrients((was) => ({ ...was, [key]: event.target.value }))
                }
              />
            </label>
          ))}
          <button type="submit" disabled={savingFood}>
            {savingFood ? t("rec.adding") : t("rec.addFood")}
          </button>
        </form>
      </Card>
    </>
  );
}
