import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { Food, Nutrition, RecipeDetail } from "../api/types";
import { Card, Empty, ErrorBanner } from "../components/ui";
import { useToast } from "../components/Toast";
import { useT, type Translate } from "../i18n";
import { errorMessage, loadErrorMessage } from "../i18n/errors";
import {
  NUTRIENTS,
  NUTRIENT_LABEL,
  basisLabel,
  formatNutrient,
  trim,
} from "../nutrition";

/** Today as `YYYY-MM-DD`, from the local parts — `toISOString` shifts the day west of UTC. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * A nutrition figure, with how complete it is.
 *
 * The unknown count is rendered **beside the number, never instead of it**: a partial total
 * is still the best answer available, and hiding it would be worse than showing it with its
 * caveat. When nothing carried a figure there is no number at all — `0` would be a claim
 * that the recipe contains none of that nutrient (AD-45).
 */
function NutritionTable({ value, t }: { value: Nutrition; t: Translate }) {
  return (
    <table>
      <tbody>
        {NUTRIENTS.map((key) => {
          const shown = formatNutrient(key, value[key]);
          const unknown = value.unknown[key];
          return (
            <tr key={key}>
              <th scope="row" style={{ textAlign: "left", fontWeight: 400 }}>
                {t(NUTRIENT_LABEL[key])}
              </th>
              <td>
                {shown === null ? (
                  <span className="hint">{t("rec.notKnown")}</span>
                ) : (
                  `${shown} ${key === "kcal" ? t("rec.kcalUnit") : t("rec.gramsUnit")}`
                )}
              </td>
              <td className="hint">
                {unknown > 0 ? t.n("rec.unknownNote", unknown) : ""}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * One recipe: what goes in it, how it is made, and recording that it was eaten (Epic 27).
 *
 * **Every write answers with the whole recipe**, and the page simply replaces its state with
 * what came back. Patching the ingredient locally and leaving the totals alone would show a
 * list that no longer adds up to the figure above it — and recomputing the totals here would
 * be the second implementation of the arithmetic that AD-30 forbids.
 */
export function RecipePage() {
  const { recipeId = "" } = useParams();
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();

  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [foodId, setFoodId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [stepText, setStepText] = useState("");
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [ateOn, setAteOn] = useState(today);
  const [ateServings, setAteServings] = useState("1");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, pantry] = await Promise.all([api.readRecipe(recipeId), api.listFoods()]);
      setRecipe(detail);
      setFoods(pantry);
      setFoodId((was) => was || (pantry[0]?.id ?? ""));
      setError(null);
    } catch (caught) {
      setError(loadErrorMessage(t, caught, "rec.couldNotLoadOne"));
    } finally {
      setLoading(false);
    }
  }, [recipeId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const chosen = foods.find((food) => food.id === foodId) ?? null;

  async function run(work: () => Promise<RecipeDetail>, fallback: "rec.couldNotSave") {
    try {
      setRecipe(await work());
      setError(null);
    } catch (caught) {
      toast.show(errorMessage(t, caught, fallback), { tone: "error" });
    }
  }

  async function addIngredient(event: FormEvent) {
    event.preventDefault();
    if (!foodId || !quantity.trim()) return;
    await run(
      () => api.addIngredient(recipeId, { food_id: foodId, quantity: quantity.trim() }),
      "rec.couldNotSave",
    );
    setQuantity("");
  }

  async function addStep(event: FormEvent) {
    event.preventDefault();
    if (!stepText.trim()) return;
    try {
      await api.addStep(recipeId, stepText.trim());
      setStepText("");
      await load();
    } catch (caught) {
      toast.show(errorMessage(t, caught, "rec.couldNotSave"), { tone: "error" });
    }
  }

  /** Swap a step with its neighbour and send the whole new order. */
  async function move(index: number, by: -1 | 1) {
    if (!recipe) return;
    const ids = recipe.steps.map((step) => step.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    try {
      await api.reorderSteps(recipeId, ids);
      await load();
    } catch (caught) {
      toast.show(errorMessage(t, caught, "rec.couldNotSave"), { tone: "error" });
    }
  }

  async function saveStep(stepId: string) {
    try {
      await api.updateStep(recipeId, stepId, editingText.trim());
      setEditingStep(null);
      await load();
    } catch (caught) {
      toast.show(errorMessage(t, caught, "rec.couldNotSave"), { tone: "error" });
    }
  }

  async function removeStep(stepId: string) {
    try {
      await api.deleteStep(recipeId, stepId);
      await load();
    } catch (caught) {
      toast.show(errorMessage(t, caught, "rec.couldNotDelete"), { tone: "error" });
    }
  }

  async function eatIt(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createMeal({
        eaten_on: ateOn,
        recipe_id: recipeId,
        servings: ateServings.trim() || "1",
      });
      toast.show(t("rec.ateRecorded"));
    } catch (caught) {
      toast.show(errorMessage(t, caught, "rec.couldNotRecord"), { tone: "error" });
    }
  }

  async function removeRecipe() {
    if (!window.confirm(t("rec.deleteConfirm"))) return;
    try {
      await api.deleteRecipe(recipeId);
      navigate("/recipes");
    } catch (caught) {
      toast.show(errorMessage(t, caught, "rec.couldNotDelete"), { tone: "error" });
    }
  }

  if (loading && !recipe) return <main className="shell" />;
  if (!recipe) return <ErrorBanner message={error} />;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <Link to="/recipes" className="hint">
            ← {t("rec.back")}
          </Link>
          {/* Editable, and it has to be: a recipe that has been eaten cannot be deleted
              (AD-21), so without this a typo in the name would be permanent. Uncontrolled
              and committed on blur, the same shape as the serving count below. */}
          <h1 style={{ fontSize: 18, margin: "4px 0 0" }}>
            <input
              key={recipe.name}
              aria-label={t("rec.editName")}
              defaultValue={recipe.name}
              maxLength={80}
              className="title-input"
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (!next) {
                  event.target.value = recipe.name;
                  return;
                }
                if (next === recipe.name) return;
                void run(() => api.updateRecipe(recipeId, { name: next }), "rec.couldNotSave");
              }}
            />
          </h1>
          {/* Editable in place, because changing it is the point: a serving count re-judges
              the same pot rather than relabelling anything stored, so every figure over it
              moves and no row does (AD-40).

              Uncontrolled, and committed on blur. Written as a controlled input first, and
              it could not be cleared: React rewrote the box on every keystroke, so emptying
              it and typing 4 left "24". A `key` off the stored value resyncs the box when
              the server answers with something else. */}
          <label className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {t("rec.servings")}
            <input
              key={recipe.servings}
              type="number"
              min={1}
              max={100}
              step={1}
              defaultValue={recipe.servings}
              style={{ width: 64 }}
              onBlur={(event) => {
                const next = Number(event.target.value);
                if (!Number.isInteger(next) || next < 1 || next > 100) {
                  event.target.value = String(recipe.servings);
                  return;
                }
                if (next === recipe.servings) return;
                void run(() => api.updateRecipe(recipeId, { servings: next }), "rec.couldNotSave");
              }}
            />
          </label>
        </div>
        <button type="button" className="quiet" onClick={() => void removeRecipe()}>
          {t("rec.delete")}
        </button>
      </div>

      <ErrorBanner message={error} />

      <Card title={t("rec.perServing")}>
        <NutritionTable value={recipe.per_serving} t={t} />
        <h3 style={{ fontSize: 13, marginBottom: 4 }}>{t("rec.total")}</h3>
        <NutritionTable value={recipe.total} t={t} />
      </Card>

      <Card title={t("rec.ingredients")}>
        {recipe.ingredients.length === 0 ? (
          <Empty>{t("rec.ingredientsNone")}</Empty>
        ) : (
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {recipe.ingredients.map((line) => {
              const kcal = formatNutrient("kcal", line.nutrition.kcal);
              return (
                <li key={line.id} style={{ marginBottom: 4 }}>
                  {/* The quantity is editable in place: correcting it is what moves the
                      totals, and a line you can only delete and retype loses the note of
                      why it was there. The unit beside it is not editable — it is obliged
                      by the food's basis, and the server would refuse a disagreement. */}
                  <input
                    inputMode="decimal"
                    aria-label={t("rec.editQuantity", { name: line.food_name })}
                    defaultValue={trim(line.quantity)}
                    style={{ width: 72 }}
                    onBlur={(event) => {
                      const typed = event.target.value.trim();
                      if (!typed || typed === trim(line.quantity)) return;
                      void run(
                        () => api.updateIngredient(recipeId, line.id, { quantity: typed }),
                        "rec.couldNotSave",
                      );
                    }}
                  />{" "}
                  {line.unit === "unit" ? "" : `${line.unit} `}
                  {line.food_name}
                  {kcal === null ? null : (
                    <span className="hint"> · {kcal} {t("rec.kcalUnit")}</span>
                  )}{" "}
                  <button
                    type="button"
                    className="quiet"
                    aria-label={t("rec.removeIngredient", { name: line.food_name })}
                    onClick={() =>
                      void run(
                        () => api.deleteIngredient(recipeId, line.id),
                        "rec.couldNotSave",
                      )
                    }
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {foods.length === 0 ? (
          <p className="hint">{t("rec.needsFoodsFirst")}</p>
        ) : (
          <form onSubmit={addIngredient} className="row" style={{ gap: 8, marginTop: 12 }}>
            <label>
              {t("rec.food")}
              <select value={foodId} onChange={(event) => setFoodId(event.target.value)}>
                {foods.map((food) => (
                  <option key={food.id} value={food.id}>
                    {food.name} ({basisLabel(food.basis, t)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              {/* The unit is the food's, so the label says which one rather than offering a
                  choice the server would refuse. */}
              {chosen ? t("rec.quantityIn", { unit: chosen.unit }) : t("rec.quantity")}
              <input
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </label>
            <button type="submit">{t("rec.addIngredient")}</button>
          </form>
        )}
      </Card>

      <Card title={t("rec.steps")}>
        {recipe.steps.length === 0 ? (
          <Empty>{t("rec.stepsNone")}</Empty>
        ) : (
          <ol style={{ paddingLeft: 22, margin: 0 }}>
            {recipe.steps.map((step, index) => (
              <li key={step.id} style={{ marginBottom: 6 }}>
                {editingStep === step.id ? (
                  <span className="row" style={{ gap: 6 }}>
                    <input
                      value={editingText}
                      onChange={(event) => setEditingText(event.target.value)}
                      aria-label={t("rec.editStep", { position: String(step.position) })}
                      maxLength={1000}
                    />
                    <button type="button" onClick={() => void saveStep(step.id)}>
                      {t("rec.save")}
                    </button>
                    <button type="button" className="quiet" onClick={() => setEditingStep(null)}>
                      {t("rec.cancel")}
                    </button>
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="quiet"
                      aria-label={t("rec.editStep", { position: String(step.position) })}
                      onClick={() => {
                        setEditingStep(step.id);
                        setEditingText(step.text);
                      }}
                    >
                      {step.text}
                    </button>{" "}
                    <button
                      type="button"
                      className="quiet"
                      aria-label={t("rec.moveStepUp", { position: String(step.position) })}
                      disabled={index === 0}
                      onClick={() => void move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="quiet"
                      aria-label={t("rec.moveStepDown", { position: String(step.position) })}
                      disabled={index === recipe.steps.length - 1}
                      onClick={() => void move(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="quiet"
                      aria-label={t("rec.removeStep", { position: String(step.position) })}
                      onClick={() => void removeStep(step.id)}
                    >
                      ×
                    </button>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}

        <form onSubmit={addStep} className="row" style={{ gap: 8, marginTop: 12 }}>
          <label style={{ flex: "1 1 auto" }}>
            {t("rec.stepText")}
            <input
              value={stepText}
              onChange={(event) => setStepText(event.target.value)}
              placeholder={t("rec.stepPlaceholder")}
              maxLength={1000}
              required
            />
          </label>
          <button type="submit">{t("rec.addStep")}</button>
        </form>
      </Card>

      <Card title={t("rec.ate")}>
        <form onSubmit={eatIt} className="row" style={{ gap: 8 }}>
          <label>
            {t("rec.ateDay")}
            <input
              type="date"
              value={ateOn}
              max={today()}
              onChange={(event) => setAteOn(event.target.value)}
              required
            />
          </label>
          <label>
            {t("rec.atePortion")}
            <input
              inputMode="decimal"
              value={ateServings}
              onChange={(event) => setAteServings(event.target.value)}
            />
          </label>
          <button type="submit">{t("rec.ateRecord")}</button>
        </form>
        <p className="hint">{t("rec.servingsHint")}</p>
      </Card>
    </>
  );
}
