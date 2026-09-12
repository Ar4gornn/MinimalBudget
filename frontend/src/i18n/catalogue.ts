/**
 * The message catalogue (Epic 25).
 *
 * **Both languages live side by side, in one entry.** A message is
 * `{ en: "Habits", fr: "Habitudes" }`, not two parallel files keyed the same way. Two
 * files drift: a key added to one and forgotten in the other is the ordinary failure of
 * every hand-rolled i18n layer, and it shows up as an English word in the middle of a
 * French sentence weeks later. Here the type below makes a missing French string a
 * compile error, and a reviewer reads the pair together instead of scrolling between
 * files.
 *
 * **Hand-rolled rather than react-i18next.** This app has three runtime dependencies —
 * react, react-dom, react-router — and pins its own money and date formatting on purpose
 * (see `money.ts`). Two languages that share a plural rule shape need a lookup, an
 * interpolation and a plural switch; that is the file you are reading, and it is smaller
 * than i18next's configuration would be.
 *
 * Keys are `area.thing`, and the area matches the page or module the string belongs to.
 * They are split across `messages/` by area so an epic touches one file.
 */

import { account } from "./messages/account";
import { calendar } from "./messages/calendar";
import { common } from "./messages/common";
import { entries } from "./messages/entries";
import { errors } from "./messages/errors";
import { gym } from "./messages/gym";
import { habits } from "./messages/habits";
import { inventory } from "./messages/inventory";
import { dates } from "./messages/dates";
import { plan } from "./messages/plan";
import { recipes } from "./messages/recipes";

export const LANGUAGES = ["en", "fr"] as const;
export type Lang = (typeof LANGUAGES)[number];

/** One message in every language the app ships. Missing `fr` is a compile error. */
export type Entry = Record<Lang, string>;

export const messages = {
  ...common,
  ...account,
  ...dates,
  ...entries,
  ...plan,
  ...inventory,
  ...gym,
  ...habits,
  ...calendar,
  ...recipes,
  ...errors,
};

export type MessageKey = keyof typeof messages;

/**
 * The bases of the plural pairs — every key ending `_one` has a matching `_other`.
 *
 * Distributes over the union, so `t.n("habits.streak", 3)` type-checks only where both
 * halves of the pair exist.
 */
type OneKey = Extract<MessageKey, `${string}_one`>;
type OtherKey = Extract<MessageKey, `${string}_other`>;
type BaseOf<K> = K extends `${infer B}_one` ? B : never;
type OtherBaseOf<K> = K extends `${infer B}_other` ? B : never;
export type PluralBase = Extract<BaseOf<OneKey>, OtherBaseOf<OtherKey>>;

/**
 * Which of the two forms a count takes.
 *
 * English: only 1 is singular. French: 0 **and** 1 are singular — "0 jour", not
 * "0 jours". Written down rather than assumed, because `count !== 1` is an English rule
 * wearing a general-looking condition, and because the server holds the same rule for the
 * push digest (`services/push.py`) where the two must agree.
 */
export function pluralForm(lang: Lang, count: number): "one" | "other" {
  if (lang === "fr") return count === 0 || count === 1 ? "one" : "other";
  return count === 1 ? "one" : "other";
}

/** `{name}` holes, filled from `vars`. An unmatched hole is left as written, so a missing
 *  variable is visible in the screenshot rather than silently rendering as nothing. */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

type Vars = Record<string, string | number>;

export interface Translate {
  /** One message, with `{name}` holes filled from `vars`. */
  (key: MessageKey, vars?: Vars): string;
  /** The singular or plural form of a `_one`/`_other` pair. `count` is also a variable. */
  n: (base: PluralBase, count: number, vars?: Vars) => string;
  /** The language actually in force, for the few places that must branch on it. */
  lang: Lang;
}

/**
 * A translator for one language.
 *
 * Lives here rather than beside the React provider so that `months.ts` — pure date
 * arithmetic, tested without a DOM — can label a month in French without importing React.
 */
export function translator(lang: Lang): Translate {
  const t = ((key: MessageKey, vars?: Vars) => {
    const entry = messages[key];
    // A key that is not in the catalogue cannot happen through the types, but it can happen
    // through a stale build or a hand-written cast. Showing the key is louder than showing
    // nothing, and it names the thing to fix.
    if (!entry) return key;
    return interpolate(entry[lang], vars);
  }) as Translate;

  t.n = (base: PluralBase, count: number, vars?: Vars) =>
    t(`${base}_${pluralForm(lang, count)}` as MessageKey, { count, ...vars });
  t.lang = lang;
  return t;
}
