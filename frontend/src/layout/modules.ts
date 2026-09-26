import type { ModuleId } from "../api/types";
import { useOptionalAuth } from "../auth/AuthContext";
import type { MessageKey } from "../i18n";
import { preferencesOf } from "./preferences";

/**
 * Which modules the account uses (Epic 33, AD-49). Off hides a module's UI — its tab, its
 * pages, and every card, layer, button and notification that points at it — and skips the
 * requests those would have made. Its data and endpoints are untouched.
 *
 * Every place a module shows up outside its own pages, as found by grepping for each
 * module's API calls and route links (story 33.3). A new one belongs in this list:
 *
 * | module  | its own routes     | elsewhere                                              |
 * |---------|--------------------|--------------------------------------------------------|
 * | habits  | /habits            | Habits section tab, calendar habits layer, push digest |
 * | books   | /books             | Habits section view, dashboard Reading now + quote,    |
 * |         |                    | calendar quote                                         |
 * | mood    | —                  | dashboard trigger + `?mood=1`, Habits mood card,       |
 * |         |                    | calendar mood layer                                    |
 * | stock   | /inventory         | Stock tab, dashboard Restock, calendar stock layer,    |
 * |         |                    | push digest                                            |
 * | gym     | /gym               | Gym tab, calendar gym layer                            |
 * | recipes | /recipes, /recipes/:id | Recipes top link, calendar meals layer             |
 * | notes   | /notes, /notes/:id | dashboard Notes link, floating note button             |
 */
export const MODULE_NAME: Record<ModuleId, MessageKey> = {
  habits: "module.habits",
  books: "module.books",
  mood: "module.mood",
  stock: "module.stock",
  gym: "module.gym",
  recipes: "module.recipes",
  notes: "module.notes",
};

/**
 * All on outside an auth provider, like `useMoney`'s currency: a component rendered in
 * isolation has an obvious default, and throwing for want of context would be worse.
 */
export function useModules(): Record<ModuleId, boolean> {
  return preferencesOf(useOptionalAuth()?.user).modules;
}

export function useModule(id: ModuleId): boolean {
  return useModules()[id];
}
