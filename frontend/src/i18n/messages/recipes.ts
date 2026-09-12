import type { Entry } from "../catalogue";

/**
 * Foods, recipes, nutrition and meals (Epic 27).
 *
 * Three things here are not word-for-word translations, and each is deliberate.
 *
 * **The bases read as measures, not as enum values.** English says "per 100 g" and French
 * "pour 100 g", but "each" becomes "à l'unité" — a prepositional phrase, because French has
 * no adverb doing the job of English's bare "each" in a dropdown.
 *
 * **"Not counted" is about the figure, not about the food.** `rec.unknownNote` says how many
 * ingredients had no value for a nutrient. Rendering a total without it would be a number
 * that is quietly too low, which is the whole reason the count is on the wire.
 *
 * **The macro names are the ones on a French packet**: glucides, lipides, protéines. Not
 * "carbohydrates"/"graisses", which are the dictionary answers and not what anybody reads
 * off a label here.
 */
export const recipes = {
  "nav.recipes": { en: "Recipes", fr: "Recettes" },

  // --- the list ------------------------------------------------------------
  "rec.title": { en: "Recipes", fr: "Recettes" },
  "rec.yours": { en: "Your recipes", fr: "Vos recettes" },
  "rec.none": {
    en: "No recipes yet. Add one below — a name, and how many it feeds.",
    fr: "Aucune recette pour l’instant. Ajoutez-en une ci-dessous : un nom, et le nombre de parts.",
  },
  "rec.name": { en: "Recipe name", fr: "Nom de la recette" },
  "rec.namePlaceholder": { en: "Rice and eggs", fr: "Riz aux œufs" },
  "rec.servings": { en: "Servings", fr: "Parts" },
  "rec.servingsHint": {
    en: "How many people the whole recipe feeds.",
    fr: "Le nombre de personnes que la recette entière nourrit.",
  },
  "rec.servingsCount_one": { en: "{count} serving", fr: "{count} part" },
  "rec.servingsCount_other": { en: "{count} servings", fr: "{count} parts" },
  "rec.add": { en: "Add recipe", fr: "Ajouter la recette" },
  "rec.adding": { en: "Adding…", fr: "Ajout en cours…" },
  "rec.open": { en: "Open {name}", fr: "Ouvrir {name}" },
  "rec.back": { en: "All recipes", fr: "Toutes les recettes" },
  "rec.delete": { en: "Delete recipe", fr: "Supprimer la recette" },
  "rec.deleteConfirm": {
    en: "Delete this recipe? Its ingredients and its method go with it.",
    fr: "Supprimer cette recette ? Ses ingrédients et sa préparation disparaissent avec elle.",
  },
  "rec.editName": { en: "Edit recipe name", fr: "Modifier le nom de la recette" },
  "rec.save": { en: "Save", fr: "Enregistrer" },
  "rec.cancel": { en: "Cancel", fr: "Annuler" },

  // --- nutrition -----------------------------------------------------------
  "rec.total": { en: "Whole recipe", fr: "Recette entière" },
  "rec.perServing": { en: "Per serving", fr: "Par part" },
  "rec.kcal": { en: "Calories", fr: "Calories" },
  "rec.protein": { en: "Protein", fr: "Protéines" },
  "rec.carbs": { en: "Carbohydrate", fr: "Glucides" },
  "rec.fat": { en: "Fat", fr: "Lipides" },
  "rec.kcalUnit": { en: "kcal", fr: "kcal" },
  "rec.gramsUnit": { en: "g", fr: "g" },
  "rec.notKnown": { en: "not known", fr: "non renseigné" },
  "rec.unknownNote_one": {
    en: "{count} ingredient has no figure for this",
    fr: "{count} ingrédient n’a pas de valeur pour cela",
  },
  "rec.unknownNote_other": {
    en: "{count} ingredients have no figure for this",
    fr: "{count} ingrédients n’ont pas de valeur pour cela",
  },

  // --- ingredients ---------------------------------------------------------
  "rec.ingredients": { en: "Ingredients", fr: "Ingrédients" },
  "rec.ingredientsNone": {
    en: "No ingredients yet. Pick a food and say how much of it goes in.",
    fr: "Aucun ingrédient pour l’instant. Choisissez un aliment et indiquez la quantité.",
  },
  "rec.addIngredient": { en: "Add ingredient", fr: "Ajouter l’ingrédient" },
  "rec.food": { en: "Food", fr: "Aliment" },
  "rec.quantity": { en: "Quantity", fr: "Quantité" },
  "rec.quantityIn": { en: "Quantity in {unit}", fr: "Quantité en {unit}" },
  "rec.removeIngredient": { en: "Remove {name}", fr: "Retirer {name}" },
  "rec.editQuantity": { en: "Quantity of {name}", fr: "Quantité de {name}" },
  "rec.needsFoodsFirst": {
    en: "Add a food below first — an ingredient is a food and a quantity.",
    fr: "Ajoutez d’abord un aliment ci-dessous : un ingrédient, c’est un aliment et une quantité.",
  },

  // --- the method ----------------------------------------------------------
  "rec.steps": { en: "Method", fr: "Préparation" },
  "rec.stepsNone": {
    en: "No steps yet. Write the first one.",
    fr: "Aucune étape pour l’instant. Écrivez la première.",
  },
  "rec.stepText": { en: "What to do", fr: "Ce qu’il faut faire" },
  "rec.stepPlaceholder": { en: "Boil the water", fr: "Faire bouillir l’eau" },
  "rec.addStep": { en: "Add step", fr: "Ajouter l’étape" },
  "rec.moveStepUp": { en: "Move step {position} up", fr: "Monter l’étape {position}" },
  "rec.moveStepDown": { en: "Move step {position} down", fr: "Descendre l’étape {position}" },
  "rec.editStep": { en: "Edit step {position}", fr: "Modifier l’étape {position}" },
  "rec.removeStep": { en: "Remove step {position}", fr: "Supprimer l’étape {position}" },

  // --- foods ---------------------------------------------------------------
  "rec.foods": { en: "Foods", fr: "Aliments" },
  "rec.foodsNone": {
    en: "No foods yet. A food is a named thing with its nutrition — type it once and every recipe can use it.",
    fr: "Aucun aliment pour l’instant. Un aliment est une chose nommée avec sa valeur nutritionnelle : saisissez-le une fois et toutes les recettes pourront s’en servir.",
  },
  "rec.foodsHint": {
    en: "Figures are per the amount you pick below. Leave one blank if you do not know it — blank is not zero.",
    fr: "Les valeurs correspondent à la quantité choisie ci-dessous. Laissez un champ vide si vous ne savez pas : vide ne veut pas dire zéro.",
  },
  "rec.foodName": { en: "Food name", fr: "Nom de l’aliment" },
  "rec.foodNamePlaceholder": { en: "Rice", fr: "Riz" },
  "rec.basis": { en: "Measured", fr: "Mesuré" },
  "rec.basisPer100g": { en: "per 100 g", fr: "pour 100 g" },
  "rec.basisPer100ml": { en: "per 100 ml", fr: "pour 100 ml" },
  "rec.basisPerUnit": { en: "each", fr: "à l’unité" },
  "rec.addFood": { en: "Add food", fr: "Ajouter l’aliment" },
  "rec.editFood": { en: "Edit {name}", fr: "Modifier {name}" },
  "rec.deleteFood": { en: "Delete {name}", fr: "Supprimer {name}" },

  // --- meals ---------------------------------------------------------------
  "rec.ate": { en: "I ate this", fr: "J’en ai mangé" },
  "rec.ateDay": { en: "Day", fr: "Jour" },
  "rec.atePortion": { en: "How many servings", fr: "Combien de parts" },
  "rec.ateRecord": { en: "Record", fr: "Enregistrer" },
  "rec.ateRecorded": { en: "Recorded.", fr: "Enregistré." },
  "rec.meals": { en: "Recently eaten", fr: "Mangé récemment" },
  "rec.mealsNone": {
    en: "Nothing recorded this month.",
    fr: "Rien d’enregistré ce mois-ci.",
  },
  "rec.mealRemove": { en: "Remove this meal", fr: "Supprimer ce repas" },
  "rec.mealServings": { en: "{servings} × {name}", fr: "{servings} × {name}" },

  // --- what went wrong -----------------------------------------------------
  "rec.couldNotLoad": {
    en: "Could not load your recipes.",
    fr: "Impossible de charger vos recettes.",
  },
  "rec.couldNotLoadOne": {
    en: "Could not load that recipe.",
    fr: "Impossible de charger cette recette.",
  },
  "rec.couldNotSave": { en: "Could not save that.", fr: "Impossible d’enregistrer." },
  "rec.couldNotDelete": { en: "Could not delete that.", fr: "Impossible de supprimer." },
  "rec.couldNotRecord": {
    en: "Could not record that meal.",
    fr: "Impossible d’enregistrer ce repas.",
  },

  // --- refusals, keyed by the server's own code (AD-44) --------------------
  "error.food_not_found": { en: "No such food.", fr: "Aliment introuvable." },
  "error.recipe_not_found": { en: "No such recipe.", fr: "Recette introuvable." },
  "error.meal_not_found": { en: "No such meal.", fr: "Repas introuvable." },
  "error.ingredient_not_found": { en: "No such ingredient.", fr: "Ingrédient introuvable." },
  "error.step_not_found": { en: "No such step.", fr: "Étape introuvable." },
  "error.food_name_taken": {
    en: "You already have a food with that name.",
    fr: "Vous avez déjà un aliment portant ce nom.",
  },
  "error.recipe_name_taken": {
    en: "You already have a recipe with that name.",
    fr: "Vous avez déjà une recette portant ce nom.",
  },
  "error.food_in_use": {
    en: "That food is still used by a recipe or a meal, so it is kept.",
    fr: "Cet aliment est encore utilisé par une recette ou un repas : il est donc conservé.",
  },
  "error.recipe_in_use": {
    en: "That recipe has been eaten, so it is kept as part of your record.",
    fr: "Cette recette a été mangée : elle est conservée dans votre historique.",
  },
  "error.food_basis_locked": {
    en: "That food is already in use, so how it is measured can no longer change.",
    fr: "Cet aliment est déjà utilisé : sa mesure ne peut plus changer.",
  },
  "error.unit_basis_mismatch": {
    en: "That quantity is not in the unit the food is measured in.",
    fr: "Cette quantité n’est pas dans l’unité de mesure de l’aliment.",
  },
  "error.step_order_invalid": {
    en: "A new order has to list every step of the recipe, once each.",
    fr: "Un nouvel ordre doit énumérer chaque étape de la recette, une seule fois.",
  },
  "error.meal_in_future": {
    en: "That day has not happened yet. A meal is a record of what you ate, not a plan.",
    fr: "Ce jour n’est pas encore arrivé. Un repas est ce que vous avez mangé, pas un projet.",
  },
  "error.meal_too_early": { en: "That date is too far back.", fr: "Cette date est trop ancienne." },
  "error.meal_shape_mismatch": {
    en: "A recipe is eaten in servings and a food in a quantity, not the other way round.",
    fr: "Une recette se mange en parts et un aliment en quantité, pas l’inverse.",
  },
} satisfies Record<string, Entry>;
