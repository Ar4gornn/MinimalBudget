import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { useOptionalAuth } from "../auth/AuthContext";
import type {
  Category,
  Checkin,
  Contribution,
  Entry,
  ExpectedEntry,
  Meal,
  PendingEntry,
  SavingsType,
  MoodDay,
  StockChange,
  Workout,
} from "../api/types";
import { MoodFace, moodWord } from "../components/MoodFace";
import { Card, Empty, ErrorBanner } from "../components/ui";
import { timeLabel } from "../schedule";
import { ViewSwitch } from "../components/ViewSwitch";
import { fromCents, toCents } from "../money";
import { formatEnergy, sumEnergy, trim } from "../nutrition";
import { useMoney } from "../useMoney";
import { useT, type Translate } from "../i18n";
import { useDates } from "../useDates";
import { budgetMonth, monthBounds, monthOf, shiftMonth } from "../months";

/**
 * One view of what happened, and what is due, day by day (Epic 22).
 *
 * **A window, not a workbench.** Everything here is read, with two exceptions that are
 * navigation rather than data entry: a day links to the records on it, and "Add on this
 * day" hands off to the entry form with the date filled in. Rebuilding five write forms
 * inside day cells would either duplicate the rules each of them enforces — the kind match
 * of AD-7, the quantity/unit pair of AD-29, create-by-name of AD-12, propose-before-write
 * of AD-33 — or quietly drop them.
 *
 * **It composes, it does not join.** Every layer below is one module's own endpoint,
 * merged here by date (AD-31, AD-37). A module that fails takes its own layer down and
 * nothing else, exactly as a dashboard card does.
 *
 * **The grid is the account's month, not the calendar's.** For an account paid on the 26th,
 * "September" runs 26 August to 25 September (AD-10). Drawing the calendar month instead
 * would make this the one view in the app that disagrees with every total above it. The
 * price is ragged edges: the first and last rows carry days from the neighbouring periods,
 * drawn muted, and tapping one moves to the period it belongs to.
 */

type LayerKey = "money" | "savings" | "stock" | "gym" | "habits" | "mood" | "meals" | "due";

/**
 * The layers, as message keys — the chips are drawn on every calendar.
 *
 * The mood layer keeps an English literal rather than a key: Epic 24 is not committed,
 * and the French pass stops at its edge deliberately (see the catalogue).
 */
const LAYERS: { key: LayerKey; label: string; glyph: string; literal?: boolean }[] = [
  { key: "money", label: "cal.layerMoney", glyph: "≡" },
  { key: "savings", label: "cal.layerSavings", glyph: "◎" },
  { key: "stock", label: "cal.layerStock", glyph: "▤" },
  { key: "gym", label: "cal.layerGym", glyph: "◈" },
  { key: "habits", label: "cal.layerHabits", glyph: "✓" },
  // A mood is a dated fact a person wrote down, which is exactly what this page shows;
  // the layer costs one more endpoint composed at the edge and nothing else (AD-37).
  { key: "mood", label: "Mood", glyph: "◉", literal: true },
  // Meals are a dated fact somebody wrote down, exactly like every layer above — one more
  // endpoint composed at the edge and nothing else (AD-37). It is a *record*: what was
  // eaten, never what is planned, so it never appears after today.
  { key: "meals", label: "cal.layerMeals", glyph: "◍" },
  { key: "due", label: "cal.layerDue", glyph: "◷" },
];

/** A layer's name, in words. Mood's label is already a word, not a key. */
function layerName(layer: (typeof LAYERS)[number], t: Translate): string {
  return layer.literal ? layer.label : t(layer.label as Parameters<Translate>[0]);
}

const LAYER_KEY = "minimalbudget.calendarLayers";

/** Remembered per device, like the collapsed sections and the trend window. */
function readLayers(): LayerKey[] {
  try {
    const raw = window.localStorage.getItem(LAYER_KEY);
    if (!raw) return LAYERS.map((layer) => layer.key);
    const parsed = JSON.parse(raw) as unknown;
    const keys = Array.isArray(parsed)
      ? LAYERS.map((l) => l.key).filter((key) => parsed.includes(key))
      : [];
    // An empty stored set would render a calendar that shows nothing and looks broken.
    return keys.length ? keys : LAYERS.map((layer) => layer.key);
  } catch {
    return LAYERS.map((layer) => layer.key);
  }
}

function writeLayers(keys: LayerKey[]): void {
  try {
    window.localStorage.setItem(LAYER_KEY, JSON.stringify(keys));
  } catch {
    /* a forgotten preference is not worth a crash */
  }
}

/** Local calendar day as `YYYY-MM-DD`. Built from the local parts, never from toISOString,
 *  which would shift the day for anybody west of UTC. */
function isoOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Monday-first index, 0..6. */
const weekIndex = (date: Date): number => (date.getDay() + 6) % 7;

const addDays = (date: Date, by: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + by);

/**
 * The UTC day a stored instant falls on.
 *
 * `changed_at` is a `TIMESTAMPTZ` — the moment a quantity moved — not a day anybody chose,
 * so it has no calendar day of its own until one is picked. UTC is picked, explicitly, and
 * said so on the page: it is what the restocks chart already does, so the calendar and the
 * chart cannot disagree, and unlike the browser's zone it puts the same row on the same day
 * for every device in the household. Stated limitation, unchanged: a restock at 00:30 local,
 * east of UTC, lands on the previous day here.
 */
const utcDayOf = (instant: string): string => new Date(instant).toISOString().slice(0, 10);

interface DayBucket {
  entries: Entry[];
  contributions: Contribution[];
  workouts: Workout[];
  stock: StockChange[];
  checkins: Checkin[];
  moods: MoodDay[];
  meals: Meal[];
  due: PendingEntry[];
  expected: ExpectedEntry[];
}

const emptyBucket = (): DayBucket => ({
  entries: [],
  contributions: [],
  workouts: [],
  stock: [],
  checkins: [],
  moods: [],
  meals: [],
  due: [],
  expected: [],
});

interface Loaded {
  entries: Entry[];
  contributions: Contribution[];
  workouts: Workout[];
  stock: StockChange[];
  checkins: Checkin[];
  moods: MoodDay[];
  meals: Meal[];
  due: PendingEntry[];
  expected: ExpectedEntry[];
}

const NOTHING: Loaded = {
  entries: [],
  contributions: [],
  workouts: [],
  stock: [],
  checkins: [],
  moods: [],
  meals: [],
  due: [],
  expected: [],
};

export function CalendarPage() {
  const money = useMoney();
  const t = useT();
  const dates = useDates();
  const startDay = useOptionalAuth()?.user?.budget_start_day ?? 1;
  const navigate = useNavigate();

  const [month, setMonth] = useState(() => budgetMonth(startDay));
  const [active, setActive] = useState<LayerKey[]>(readLayers);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<Loaded>(NOTHING);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savingsTypes, setSavingsTypes] = useState<SavingsType[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Reference data changes rarely and is not month-shaped, so it is fetched once rather
  // than on every month change.
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([api.listCategories(), api.listSavingsTypes()]).then(
      ([cats, types]) => {
        if (cancelled) return;
        if (cats.status === "fulfilled") setCategories(cats.value);
        if (types.status === "fulfilled") setSavingsTypes(types.value);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // allSettled, not all: this page is a composition of six independent modules, and one
    // of them being down must cost that layer only. `Promise.all` would blank the month.
    const results = await Promise.allSettled([
      api.listEntries({ month }),
      api.listContributions({ month }),
      api.listWorkouts({ month, limit: 200 }),
      api.stockChanges(month),
      api.listCheckins({ month }),
      api.moodDays(month),
      api.listMeals({ month }),
      api.listPending(),
      api.expectedEntries(month),
    ]);
    const [entries, contributions, workouts, stock, checkins, moods, meals, due, expected] =
      results;
    const failed: string[] = [];
    // Tracked separately from the labels: every one of these endpoints is a fixed path, so
    // a 404 cannot mean "that row is missing" — it can only mean the route is not there,
    // which is an API older than the page. Saying so turns a shrug into an instruction.
    let allMissing = true;
    const value = <T,>(
      result: PromiseSettledResult<T[]>,
      label: string,
    ): T[] => {
      if (result.status === "fulfilled") return result.value;
      failed.push(label);
      if (!(result.reason instanceof ApiError) || result.reason.status !== 404) {
        allMissing = false;
      }
      return [];
    };
    setData({
      entries: value(entries, t("cal.layerMoney")),
      contributions: value(contributions, t("cal.layerSavings")),
      workouts: value(workouts, t("cal.layerGym")),
      stock: value(stock, t("cal.layerStock")),
      checkins: value(checkins, t("cal.layerHabits")),
      moods: value(moods, "Mood"),
      meals: value(meals, t("cal.layerMeals")),
      due: value(due, t("cal.layerWhatIsDue")),
      expected: value(expected, t("cal.layerForecast")),
    });
    setMissing(failed);
    setStale(failed.length > 0 && allMissing);
    if (failed.length === results.length) {
      setError(t("cal.couldNotLoad"));
    }
    setLoading(false);
  }, [month, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryName = useMemo(() => {
    const lookup = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string) => lookup.get(id) ?? "—";
  }, [categories]);

  const savingsName = useMemo(() => {
    const lookup = new Map(savingsTypes.map((t) => [t.id, t.name]));
    return (id: string) => lookup.get(id) ?? "—";
  }, [savingsTypes]);

  const [periodStart, periodEnd] = useMemo(
    () => monthBounds(month, startDay),
    [month, startDay],
  );

  // Whole weeks, Monday first. The period's own first and last days sit wherever they fall.
  const weeks = useMemo(() => {
    const gridStart = addDays(periodStart, -weekIndex(periodStart));
    const gridEnd = addDays(periodEnd, 6 - weekIndex(periodEnd));
    const rows: Date[][] = [];
    for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 7)) {
      rows.push(Array.from({ length: 7 }, (_, offset) => addDays(cursor, offset)));
    }
    return rows;
  }, [periodStart, periodEnd]);

  const byDay = useMemo(() => {
    const map = new Map<string, DayBucket>();
    const at = (iso: string): DayBucket => {
      let bucket = map.get(iso);
      if (!bucket) map.set(iso, (bucket = emptyBucket()));
      return bucket;
    };
    for (const row of data.entries) at(row.occurred_on).entries.push(row);
    for (const row of data.contributions) at(row.occurred_on).contributions.push(row);
    for (const row of data.workouts) at(row.performed_on).workouts.push(row);
    for (const row of data.stock) at(utcDayOf(row.changed_at)).stock.push(row);
    for (const row of data.checkins) at(row.done_on).checkins.push(row);
    for (const row of data.moods) at(row.on).moods.push(row);
    for (const row of data.meals) at(row.eaten_on).meals.push(row);
    for (const row of data.due) at(row.due_on).due.push(row);
    for (const row of data.expected) at(row.due_on).expected.push(row);
    return map;
  }, [data]);

  const on = (key: LayerKey) => active.includes(key);

  function toggle(key: LayerKey) {
    setActive((was) => {
      const next = was.includes(key) ? was.filter((k) => k !== key) : [...was, key];
      // Turning the last layer off would leave an empty grid that reads as "no data".
      const kept = next.length ? next : was;
      writeLayers(kept);
      return kept;
    });
  }

  /**
   * What a day holds, in words, for the wide layout.
   *
   * A dot is all that fits in a 43px phone cell, but a desktop cell is 142px and a row of
   * anonymous dots there is a puzzle rather than a summary — it makes you click a day to
   * learn it was the electricity bill. These lines are rendered alongside the dots and CSS
   * shows whichever the width can afford, so the phone layout is untouched.
   */
  function labelsFor(bucket: DayBucket): string[] {
    const lines: string[] = [];
    if (on("money")) lines.push(...bucket.entries.map((e) => categoryName(e.category_id)));
    if (on("savings")) {
      lines.push(...bucket.contributions.map((c) => savingsName(c.savings_type_id)));
    }
    if (on("stock")) lines.push(...bucket.stock.map((row) => row.item_name));
    if (on("gym")) lines.push(...bucket.workouts.map(() => t("cal.workout")));
    if (on("habits")) lines.push(...bucket.checkins.map((row) => row.habit_name));
    if (on("mood")) {
      lines.push(
        ...bucket.moods.map((row) => (row.mood === null ? "Mood" : moodWord(row.mood))),
      );
    }
    if (on("meals")) {
      lines.push(...bucket.meals.map((row) => row.recipe_name ?? row.food_name ?? ""));
    }
    if (on("due")) {
      lines.push(...bucket.due.map((row) => row.category_name));
      lines.push(...bucket.expected.map((row) => row.category_name));
    }
    return lines;
  }

  /** Net for a day, in cents, so nothing is added as a float (AD-5). */
  function netCents(bucket: DayBucket): number {
    return bucket.entries.reduce(
      (total, entry) =>
        total + (entry.kind === "income" ? toCents(entry.amount) : -toCents(entry.amount)),
      0,
    );
  }

  const selectedBucket = selected ? (byDay.get(selected) ?? emptyBucket()) : null;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>{dates.month(month)}</h1>
          {dates.monthRange(month, startDay) && (
            <p className="hint" style={{ margin: 0 }}>
              {dates.monthRange(month, startDay)}
            </p>
          )}
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <ViewSwitch current="calendar" />
          <div className="month-nav">
            <button
              type="button"
              className="quiet"
              aria-label={t("month.previous")}
              onClick={() => {
                setSelected(null);
                setMonth(shiftMonth(month, -1));
              }}
            >
              ←
            </button>
            <label style={{ textTransform: "none" }}>
              <input
                type="month"
                aria-label={t("dash.month")}
                value={month}
                onChange={(event) => {
                  setSelected(null);
                  setMonth(event.target.value || budgetMonth(startDay));
                }}
              />
            </label>
            <button
              type="button"
              className="quiet"
              aria-label={t("month.next")}
              onClick={() => {
                setSelected(null);
                setMonth(shiftMonth(month, 1));
              }}
            >
              →
            </button>
          </div>
        </div>
      </div>

      <ErrorBanner message={error} />
      {missing.length > 0 && !error && (
        <div className="error" role="status">
          {t("cal.partial", { layers: missing.join(", ") })}
          {stale && t("cal.partialStale")}
        </div>
      )}

      <div
        className="chips"
        role="group"
        aria-label={t("cal.layers")}
        style={{ marginBottom: 12 }}
      >
        {LAYERS.map((layer) => (
          <button
            key={layer.key}
            type="button"
            className={`chip ${on(layer.key) ? "on" : ""}`}
            aria-pressed={on(layer.key)}
            onClick={() => toggle(layer.key)}
          >
            <span aria-hidden="true">{layer.glyph}</span> {layerName(layer, t)}
          </button>
        ))}
      </div>

      <Card>
        <div
          className="cal-grid"
          role="grid"
          aria-label={t("cal.gridAria", { month: dates.month(month) })}
        >
          <div className="cal-head" role="row">
            {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
              <div key={weekday} role="columnheader" className="cal-weekday">
                {dates.weekdayShort(weekday)}
              </div>
            ))}
          </div>
          {weeks.map((row) => (
            <div key={isoOf(row[0] as Date)} className="cal-week" role="row">
              {row.map((day) => {
                const iso = isoOf(day);
                const inPeriod = day >= periodStart && day <= periodEnd;
                const bucket = byDay.get(iso);
                const net = bucket && on("money") ? netCents(bucket) : 0;
                const dots = bucket
                  ? LAYERS.filter(
                      (layer) =>
                        layer.key !== "money" &&
                        on(layer.key) &&
                        (layer.key === "savings"
                          ? bucket.contributions.length
                          : layer.key === "stock"
                            ? bucket.stock.length
                            : layer.key === "gym"
                              ? bucket.workouts.length
                              : layer.key === "habits"
                                ? bucket.checkins.length
                                : layer.key === "mood"
                                  ? bucket.moods.length
                                  : layer.key === "meals"
                                    ? bucket.meals.length
                                    : bucket.due.length + bucket.expected.length),
                    )
                  : [];
                // Built in pieces rather than one template: a day's accessible name is
                // a date, then optionally a net, then optionally a list of layers, and
                // French joins those differently from English.
                const withNet = net
                  ? t("cal.dayNet", { date: iso, amount: money.plain(fromCents(net)) })
                  : iso;
                const label = inPeriod
                  ? dots.length
                    ? t("cal.dayWith", {
                        label: withNet,
                        layers: dots.map((d) => layerName(d, t)).join(", "),
                      })
                    : withNet
                  : t("cal.dayOutside", {
                      date: iso,
                      month: dates.month(monthOf(day, startDay)),
                    });
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    // Outside the period, the cell is still a way in: it moves to the period
                    // that day belongs to rather than pretending nothing happened on it.
                    className={[
                      "cal-day",
                      inPeriod ? "" : "outside",
                      selected === iso ? "on" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={label}
                    aria-pressed={selected === iso}
                    onClick={() => {
                      if (!inPeriod) {
                        setSelected(null);
                        setMonth(monthOf(day, startDay));
                        return;
                      }
                      setSelected(selected === iso ? null : iso);
                    }}
                  >
                    <span className="cal-num">{day.getDate()}</span>
                    {inPeriod && net !== 0 && (
                      // Rounded to whole units in the cell, exact in the day panel below —
                      // a cell is about 47px wide on a phone and two decimals do not fit.
                      // The rounding is display only; the arithmetic above is in cents.
                      <span className={`cal-net ${net > 0 ? "in" : "out"}`}>
                        {net > 0 ? "+" : "−"}
                        {Math.abs(Math.round(net / 100))}
                      </span>
                    )}
                    {inPeriod && bucket && labelsFor(bucket).length > 0 && (
                      <span className="cal-lines" aria-hidden="true">
                        {labelsFor(bucket)
                          .slice(0, 2)
                          .map((line, index) => (
                            <span key={`${line}-${index}`} className="cal-line">
                              {line}
                            </span>
                          ))}
                        {labelsFor(bucket).length > 2 && (
                          <span className="cal-line more">
                            {t("cal.more", { count: labelsFor(bucket).length - 2 })}
                          </span>
                        )}
                      </span>
                    )}
                    {inPeriod && dots.length > 0 && (
                      <span className="cal-dots">
                        {dots.slice(0, 4).map((layer) => (
                          <span key={layer.key} className={`cal-dot ${layer.key}`} />
                        ))}
                        {dots.length > 4 && <span className="cal-more">+{dots.length - 4}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          {t("cal.gridHint")}
        </p>
      </Card>

      {selected && selectedBucket && (
        <Card
          title={dates.day(selected)}
          actions={
            <button
              type="button"
              className="quiet"
              onClick={() => navigate(`/entries?add=1&date=${selected}`)}
            >
              {t("cal.addOnThisDay")}
            </button>
          }
        >
          <DayDetail
            bucket={selectedBucket}
            active={active}
            categoryName={categoryName}
            savingsName={savingsName}
            t={t}
          />
        </Card>
      )}

      {loading && <p className="hint">{t("state.loading")}</p>}
    </>
  );
}

function DayDetail({
  bucket,
  active,
  categoryName,
  savingsName,
  t,
}: {
  bucket: DayBucket;
  active: LayerKey[];
  categoryName: (id: string) => string;
  savingsName: (id: string) => string;
  t: Translate;
}) {
  const money = useMoney();
  const on = (key: LayerKey) => active.includes(key);

  /** A meal's own energy, already derived on the server; blank when it carried none. */
  const kcalOf = (meal: Meal): string | null => {
    const shown = formatEnergy(meal.nutrition.kcal);
    return shown === null ? null : `${shown} ${t("rec.kcalUnit")}`;
  };

  const rows: React.ReactNode[] = [];

  if (on("money")) {
    for (const entry of bucket.entries) {
      rows.push(
        <li key={`e-${entry.id}`}>
          <span className={`tag ${entry.kind}`}>
            {entry.kind === "income" ? t("cal.tagIn") : t("cal.tagOut")}
          </span>{" "}
          {/* The way back to the record: the category page holds this entry and its
              history, and is the only page that can be linked to by id. */}
          <Link to={`/categories/${entry.category_id}`}>{categoryName(entry.category_id)}</Link>{" "}
          <strong>{money.amount(entry.amount)}</strong>
          {entry.note ? <span className="hint"> — {entry.note}</span> : null}
        </li>,
      );
    }
  }
  if (on("savings")) {
    for (const row of bucket.contributions) {
      rows.push(
        <li key={`c-${row.id}`}>
          <span className="tag">{t("cal.tagSaved")}</span>{" "}
          <Link to="/plan">{savingsName(row.savings_type_id)}</Link>{" "}
          <strong>{money.amount(row.amount)}</strong>
        </li>,
      );
    }
  }
  if (on("stock")) {
    for (const row of bucket.stock) {
      const added = row.quantity_before === row.quantity_after;
      rows.push(
        <li key={`s-${row.item_id}-${row.changed_at}`}>
          <span className="tag">{t("cal.tagStock")}</span>{" "}
          <Link to="/inventory">{row.item_name}</Link>{" "}
          {added
            ? t("cal.stockAdded", { quantity: row.quantity_after })
            : t("cal.stockMoved", {
                before: row.quantity_before,
                after: row.quantity_after,
              })}
        </li>,
      );
    }
  }
  if (on("gym")) {
    for (const row of bucket.workouts) {
      rows.push(
        <li key={`w-${row.id}`}>
          <span className="tag">{t("cal.tagGym")}</span>{" "}
          <Link to="/gym">{t("cal.workout")}</Link>
          {row.note ? <span className="hint"> — {row.note}</span> : null}
        </li>,
      );
    }
  }
  if (on("habits")) {
    for (const row of bucket.checkins) {
      rows.push(
        <li key={`h-${row.id}`}>
          <span className="tag">{t("cal.tagHabit")}</span>{" "}
          <Link to="/habits">{row.habit_name}</Link>
          {/* One row per occurrence since Epic 26, so three doses are three lines rather
              than one line with a multiplier — and each one can say what time it was. */}
          {row.done_at ? <span className="hint"> {timeLabel(row.done_at)}</span> : null}
          {row.note ? <span className="hint"> — {row.note}</span> : null}
        </li>,
      );
    }
  }
  if (on("mood")) {
    for (const row of bucket.moods) {
      rows.push(
        <li key={`m-${row.on}`}>
          <span className="tag">mood</span>{" "}
          {row.mood !== null && (
            <>
              <MoodFace point={row.mood} size={16} />{" "}
            </>
          )}
          <Link to="/habits">{row.mood === null ? "no face" : moodWord(row.mood)}</Link>
          {/* Three states, kept apart: nothing is said about a day nobody judged. */}
          {row.day_ok === null ? "" : row.day_ok ? " — a good day" : " — not a good day"}
          {row.note ? <span className="hint"> — {row.note}</span> : null}
        </li>,
      );
    }
  }
  if (on("meals")) {
    for (const row of bucket.meals) {
      rows.push(
        <li key={`f-${row.id}`}>
          <span className="tag">{t("cal.tagMeal")}</span>{" "}
          <Link to={row.recipe_id ? `/recipes/${row.recipe_id}` : "/recipes"}>
            {row.recipe_name ?? row.food_name}
          </Link>{" "}
          {/* Servings for a recipe, a quantity for a bare food — the two shapes a meal log
              may take, and the row carries exactly one of them. */}
          <span className="hint">
            {row.servings === null
              ? `${trim(row.quantity ?? "")}${row.unit === "unit" ? "" : ` ${row.unit}`}`
              : `× ${trim(row.servings)}`}
          </span>
          {kcalOf(row) ? <strong> {kcalOf(row)}</strong> : null}
          {row.note ? <span className="hint"> — {row.note}</span> : null}
        </li>,
      );
    }
    // One line for the day, summed in whole ten-thousandths the way the money line is
    // summed in whole cents. Null when nothing eaten carried a calorie figure — which is
    // not the same as having eaten nothing.
    const energy = formatEnergy(sumEnergy(bucket.meals));
    if (energy !== null) {
      rows.push(
        <li key="f-total" className="hint">
          {t("cal.dayEnergy", { kcal: energy })}
        </li>,
      );
    }
  }
  if (on("due")) {
    for (const row of bucket.due) {
      rows.push(
        <li key={`p-${row.id}`}>
          <span className="tag due">{t("cal.tagWaiting")}</span>{" "}
          <Link to="/">{row.category_name}</Link>{" "}
          <strong>{money.amount(row.amount)}</strong>
          <span className="hint">{t("cal.proposedNotRecorded")}</span>
        </li>,
      );
    }
    for (const row of bucket.expected) {
      rows.push(
        <li key={`x-${row.template_id}-${row.due_on}`}>
          <span className="tag expected">{t("cal.tagExpected")}</span>{" "}
          <Link to="/plan">{row.category_name}</Link> <strong>{money.amount(row.amount)}</strong>
          {/* A forecast, computed and never written (AD-39). There is no row yet, so there
              is nothing here to confirm or skip — saying so is the point. */}
          <span className="hint">
            {row.auto ? t("cal.willBeAutomatic") : t("cal.willBeProposed")}
          </span>
        </li>,
      );
    }
  }

  if (rows.length === 0) return <Empty>{t("cal.emptyDay")}</Empty>;
  return <ul className="day-list">{rows}</ul>;
}
