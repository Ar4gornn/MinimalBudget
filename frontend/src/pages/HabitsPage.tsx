import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type {
  Habit,
  HabitProgress,
  Heatmap,
  MoodHistory,
  Schedule,
  ScheduleKind,
} from "../api/types";
import { HabitHeatmap } from "../charts/HabitHeatmap";
import { MoodStrip, MoodTally } from "../charts/MoodStrip";
import { Card, Empty, ErrorBanner } from "../components/ui";
import { useToast } from "../components/Toast";
import { useT, type Translate } from "../i18n";
import type { MessageKey } from "../i18n/catalogue";
import { errorMessage, loadErrorMessage } from "../i18n/errors";
import { useDates } from "../useDates";
import {
  SCHEDULE_KINDS,
  WEEKDAYS,
  defaultsFor,
  nowTime,
  scheduleProblem,
  scheduleBody,
  timeLabel,
  toggleWeekday,
  weekdayList,
} from "../schedule";

/**
 * Habits, the schedule each one keeps, and the evidence that it was done (Epics 23 and 26).
 *
 * A habit is a plan and a check-in is a record, and this page keeps them apart: editing the
 * schedule never touches a check-in, and checking in never edits the habit (AD-35).
 *
 * Nothing shown here is stored. "Done this week", "met" and the streak are all computed by
 * the server on read, because the schedule is allowed to change and a stored figure would be
 * wrong from the moment it did (AD-40).
 *
 * The mood card at the bottom is deliberately **not** translated. Epic 24 is not committed,
 * and writing French against code that may still change would be a guess wearing a
 * translation. It is the one known gap in the French pass, written down rather than left to
 * be discovered.
 */

const HEATMAP_WEEKS = 12;
const MOOD_DAYS = 30;

const NTH = [
  { value: 1, key: "habits.nth.1" },
  { value: 2, key: "habits.nth.2" },
  { value: 3, key: "habits.nth.3" },
  { value: 4, key: "habits.nth.4" },
  { value: -1, key: "habits.nth.last" },
] as const;

/**
 * "1st", "2nd", "15th" — and in French simply "15", because French uses an ordinal only for
 * the first of the month: "le 1er mai", but "le 15 mai". Suffixing every day would be the
 * clearest possible sign that the translation was done by pattern-matching English.
 */
function ordinal(day: number, t: Translate): string {
  if (t.lang === "fr") return day === 1 ? "1er" : String(day);
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  return `${day}${["th", "st", "nd", "rd"][day % 10] ?? "th"}`;
}

/**
 * The schedule as a sentence. The one place a rule becomes words, so the list, the card and
 * the heat-map heading can never describe the same habit differently.
 *
 * A whole sentence per kind rather than a shared skeleton with holes: French puts the
 * article, the number and the noun in an order English does not, and a skeleton would only
 * ever fit one of the two.
 */
function describeSchedule(
  schedule: Schedule,
  t: Translate,
  weekdayShort: (weekday: number) => string,
  weekdayLong: (weekday: number) => string,
): string {
  const count = schedule.target_count;
  const many = count > 1;
  switch (schedule.kind) {
    case "daily":
      return many ? t("habits.says.dailyTimes", { count }) : t("habits.says.daily");
    case "times_per_week":
      return t("habits.says.timesPerWeek", { count });
    case "weekdays": {
      const days = weekdayList(schedule.weekdays).map(weekdayShort).join(", ");
      return many
        ? t("habits.says.weekdaysTimes", { count, days })
        : t("habits.says.weekdays", { days });
    }
    case "every_n_days":
      return many
        ? t("habits.says.everyDaysTimes", { times: count, count: schedule.interval_days ?? 2 })
        : t("habits.says.everyDays", { count: schedule.interval_days ?? 2 });
    case "day_of_month": {
      const day = ordinal(schedule.day_of_month ?? 1, t);
      return many
        ? t("habits.says.dayOfMonthTimes", { count, day })
        : t("habits.says.dayOfMonth", { day });
    }
    case "nth_weekday": {
      const chosen = NTH.find((one) => one.value === schedule.nth)?.key ?? "habits.nth.1";
      const nth = t(chosen);
      const weekday = weekdayLong(schedule.weekday ?? 0);
      return many
        ? t("habits.says.nthWeekdayTimes", { count, nth, weekday })
        : t("habits.says.nthWeekday", { nth, weekday });
    }
    default:
      return "";
  }
}

const BLANK: Schedule = {
  kind: "daily",
  target_count: 1,
  weekdays: null,
  interval_days: null,
  day_of_month: null,
  nth: null,
  weekday: null,
};

/**
 * The schedule editor, shared by the add form and the edit form.
 *
 * One component rather than two so the two forms cannot drift — the bug where a schedule
 * can be created but not corrected, or corrected into a shape the create form refuses.
 */
function ScheduleFields({
  schedule,
  onChange,
  form,
}: {
  schedule: Schedule;
  onChange: (next: Schedule) => void;
  /** Which form this is, for the accessible names. Already translated. */
  form: string;
}) {
  const t = useT();
  const dates = useDates();
  const set = (patch: Partial<Schedule>) => onChange({ ...schedule, ...patch });

  const pickKind = (kind: ScheduleKind) =>
    // Switching kind clears the previous kind's parameters and seeds the new one's, so the
    // form is never in a shape the server would refuse. The server clears them too; doing
    // it here as well is what keeps the preview sentence honest while you are still typing.
    onChange({ ...BLANK, kind, target_count: schedule.target_count, ...defaultsFor(kind) });

  return (
    <>
      <label style={{ flex: "1 1 180px" }}>
        {t("habits.repeats")}
        <select
          aria-label={t("habits.scheduleAria", { form })}
          value={schedule.kind}
          onChange={(event) => pickKind(event.target.value as ScheduleKind)}
        >
          {SCHEDULE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`habits.kind.${kind}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>

      {schedule.kind === "weekdays" && (
        <fieldset className="weekday-picker">
          <legend>{t("habits.whichDays")}</legend>
          {WEEKDAYS.map((day) => {
            const on = ((schedule.weekdays ?? 0) & (1 << day)) !== 0;
            return (
              <button
                key={day}
                type="button"
                className={`day-toggle ${on ? "on" : ""}`}
                aria-pressed={on}
                aria-label={dates.weekday(day)}
                onClick={() => {
                  // A schedule with no days is refused by the database and means nothing
                  // anyway, so the last one cannot be turned off.
                  const next = toggleWeekday(schedule.weekdays, day);
                  if (next !== 0) set({ weekdays: next });
                }}
              >
                {dates.weekdayInitial(day)}
              </button>
            );
          })}
        </fieldset>
      )}

      {schedule.kind === "every_n_days" && (
        <label style={{ flex: "0 0 110px" }}>
          {t("habits.every")}
          <input
            className="num"
            inputMode="numeric"
            aria-label={t("habits.intervalAria", { form })}
            value={String(schedule.interval_days ?? 2)}
            onChange={(event) => set({ interval_days: Number(event.target.value) || null })}
          />
        </label>
      )}

      {schedule.kind === "day_of_month" && (
        <label style={{ flex: "0 0 110px" }}>
          {t("habits.dayOfMonth")}
          <select
            aria-label={t("habits.dayOfMonthAria", { form })}
            value={String(schedule.day_of_month ?? 1)}
            onChange={(event) => set({ day_of_month: Number(event.target.value) })}
          >
            {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>
                {ordinal(day, t)}
              </option>
            ))}
          </select>
        </label>
      )}

      {schedule.kind === "nth_weekday" && (
        <>
          <label style={{ flex: "0 0 110px" }}>
            {t("habits.which")}
            <select
              aria-label={t("habits.whichAria", { form })}
              value={String(schedule.nth ?? 1)}
              onChange={(event) => set({ nth: Number(event.target.value) })}
            >
              {NTH.map((one) => (
                <option key={one.value} value={one.value}>
                  {t(one.key)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: "0 0 130px" }}>
            {t("habits.weekday")}
            <select
              aria-label={t("habits.weekdayAria", { form })}
              value={String(schedule.weekday ?? 0)}
              onChange={(event) => set({ weekday: Number(event.target.value) })}
            >
              {WEEKDAYS.map((day) => (
                <option key={day} value={day}>
                  {dates.weekday(day)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <label style={{ flex: "0 0 110px" }}>
        {schedule.kind === "times_per_week" ? t("habits.timesPerWeek") : t("habits.timesEach")}
        <input
          className="num"
          inputMode="numeric"
          aria-label={t("habits.targetAria", { form })}
          value={String(schedule.target_count)}
          // Clamped to a whole 1..100 as it is typed, rather than validated on submit. A
          // controlled numeric input cannot hold "2." anyway — React rewrites the value on
          // every keystroke and the dot disappears — so a submit-time "must be a whole
          // number" check could never fire, and "2.5" would silently have become 25.
          onChange={(event) =>
            set({
              target_count: Math.min(
                100,
                Math.max(1, Math.trunc(Number(event.target.value)) || 1),
              ),
            })
          }
        />
      </label>
    </>
  );
}

function scheduleOf(habit: Habit): Schedule {
  return {
    kind: habit.schedule_kind,
    target_count: habit.target_count,
    weekdays: habit.weekdays,
    interval_days: habit.interval_days,
    day_of_month: habit.day_of_month,
    nth: habit.nth,
    weekday: habit.weekday,
  };
}

export function HabitsPage() {
  const t = useT();
  const dates = useDates();
  const toast = useToast();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [progress, setProgress] = useState<HabitProgress[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [heatmap, setHeatmap] = useState<Heatmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Mood is its own module and its own card. It is fetched separately from the habits on
  // purpose: a view spanning modules composes their endpoints at the edge, and a module
  // that fails costs its own layer and nothing else (AD-31, AD-37). A `Promise.all`
  // alongside the habits would let a broken mood endpoint blank the check-in list, which is
  // the thing this page exists for.
  const [mood, setMood] = useState<MoodHistory | null>(null);
  const [moodError, setMoodError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState<Schedule>(BLANK);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [editSchedule, setEditSchedule] = useState<Schedule>(BLANK);
  // The time the next "+" will record. Pre-filled from the clock, and editable, so "I took
  // it at eight" is one field rather than a form.
  const [at, setAt] = useState<Record<string, string>>({});

  const describe = useCallback(
    (one: Schedule) => describeSchedule(one, t, dates.weekdayShort, dates.weekday),
    [t, dates],
  );

  /** The headline figure, and the reason this epic exists. */
  const progressLine = (row: HabitProgress): string => {
    if (row.schedule.kind === "times_per_week") {
      return t("habits.doneThisWeek", { done: row.done, target: row.schedule.target_count });
    }
    if (row.due_today) {
      return t("habits.doneToday", { done: row.done, target: row.schedule.target_count });
    }
    return row.next_due
      ? t("habits.notDueNext", { date: dates.day(row.next_due) })
      : t("habits.notDue");
  };

  /**
   * "2 of 3 this week", counted in **occasions**: three is how many times the schedule
   * asked this week, not how many days a week has. Hidden for a `times_per_week` habit,
   * whose headline already says the week, and when there is no occasion at all — a monthly
   * habit in a week it does not fall in, where a denominator of zero would be a lie.
   */
  const weekLine = (row: HabitProgress): string | null => {
    if (row.schedule.kind === "times_per_week" || row.window_due === 0) return null;
    return t("habits.occasionsThisWeek", { done: row.window_done, due: row.window_due });
  };

  const streakLabel = (row: HabitProgress): string =>
    row.schedule.kind === "times_per_week"
      ? t.n("habits.streakWeeks", row.streak)
      : t.n("habits.streak", row.streak);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextHabits, nextProgress] = await Promise.all([
        api.listHabits(showArchived),
        api.habitProgress(),
      ]);
      setHabits(nextHabits);
      setProgress(nextProgress);
    } catch (caught) {
      // `/api/habits` and `/api/habits/progress` are fixed paths, so a 404 here cannot mean
      // "no such habit" — it can only mean the route is absent, i.e. an API older than this
      // page. Passing the server's bare "Not Found" through told the reader nothing at all;
      // it happened for real against a stale uvicorn that predated the habits router.
      setError(loadErrorMessage(t, caught, "habits.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [showArchived, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void api.moodHistory(MOOD_DAYS).then(
      (value) => {
        if (!cancelled) setMood(value);
      },
      (caught: unknown) => {
        if (cancelled) return;
        // A fixed path, so a 404 can only mean the route is absent — an API older than this
        // page — never "no moods recorded". Same reasoning as the habits load above.
        setMoodError(loadErrorMessage(t, caught, "error.generic"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function run(action: () => Promise<unknown>, fallback: MessageKey) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(t, caught, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function addHabit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const problem = scheduleProblem(schedule);
    if (problem) {
      setError(t(problem === "interval" ? "habits.badInterval" : "error.schedule_incomplete"));
      return;
    }
    await run(async () => {
      await api.createHabit({ name: trimmed, ...scheduleBody(schedule) });
      setName("");
      setSchedule(BLANK);
      await load();
    }, "habits.couldNotCreate");
  }

  async function refresh(habitId: string) {
    setProgress(await api.habitProgress());
    if (heatmap?.habit_id === habitId) {
      setHeatmap(await api.habitHeatmap(habitId, HEATMAP_WEEKS));
    }
  }

  /** One more occurrence, at the time in the box beside the button. */
  async function record(habitId: string) {
    const typed = at[habitId];
    await run(async () => {
      await api.checkIn(habitId, {
        // Untouched, the box is the clock. **Emptied, it is null** — "did it, did not say
        // when", which is a real state this model has. Sending the empty string instead was
        // a 422 carrying a pydantic sentence, for a thing the person was entitled to do.
        done_at: typed === undefined ? nowTime() : typed || null,
      });
      // Back to the clock for the next one. A box that silently kept 08:00 all day would
      // record the afternoon dose at the time of the morning one — the exact confusion
      // recording a time was meant to end.
      setAt((was) => {
        const next = { ...was };
        delete next[habitId];
        return next;
      });
      await refresh(habitId);
    }, "habits.couldNotRecord");
  }

  /** Take one specific occurrence back. Named by its id, because there may be three. */
  async function undo(habitId: string, checkinId: string) {
    await run(async () => {
      await api.deleteCheckIn(habitId, checkinId);
      await refresh(habitId);
    }, "habits.couldNotUndo");
  }

  async function openHeatmap(habitId: string) {
    await run(async () => {
      setHeatmap(
        heatmap?.habit_id === habitId ? null : await api.habitHeatmap(habitId, HEATMAP_WEEKS),
      );
    }, "habits.couldNotLoadHistory");
  }

  function startEditing(habit: Habit) {
    if (editing?.id === habit.id) {
      setEditing(null);
      return;
    }
    setEditing(habit);
    setEditSchedule(scheduleOf(habit));
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const problem = scheduleProblem(editSchedule);
    if (problem) {
      setError(t(problem === "interval" ? "habits.badInterval" : "error.schedule_incomplete"));
      return;
    }
    await run(async () => {
      await api.updateHabit(editing.id, {
        name: editing.name.trim(),
        remind: editing.remind,
        ...scheduleBody(editSchedule),
      });
      setEditing(null);
      await load();
    }, "habits.couldNotSave");
  }

  async function archive(habit: Habit, archived: boolean) {
    await run(async () => {
      await api.updateHabit(habit.id, { archived });
      await load();
      toast.show(
        archived
          ? t("habits.archivedToast", { name: habit.name })
          : t("habits.restoredToast", { name: habit.name }),
      );
    }, "habits.couldNotChange");
  }

  async function remove(habit: Habit) {
    // Deleting takes the check-ins with it (AD-21), so the count goes in the question
    // rather than into a surprise afterwards. Archiving is offered on the same row.
    const rows = await api.listCheckins({ habit_id: habit.id }).catch(() => []);
    const kept = rows.length;
    const confirmed = window.confirm(
      kept === 0
        ? t("habits.confirmDelete", { name: habit.name })
        : t.n("habits.confirmDeleteWith", kept, { name: habit.name }),
    );
    if (!confirmed) return;
    await run(async () => {
      await api.deleteHabit(habit.id);
      if (heatmap?.habit_id === habit.id) setHeatmap(null);
      await load();
    }, "habits.couldNotDelete");
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>{t("habits.title")}</h1>
        <button
          type="button"
          className="quiet"
          aria-pressed={showArchived}
          onClick={() => setShowArchived((was) => !was)}
        >
          {showArchived ? t("action.hideArchived") : t("action.showArchived")}
        </button>
      </div>

      <ErrorBanner message={error} />

      <Card title={t("habits.today")}>
        {loading && progress.length === 0 ? (
          <p className="hint">{t("state.loading")}</p>
        ) : progress.length === 0 ? (
          // Only when the list really came back empty. After a failed load these arrays are
          // empty because nothing arrived, not because there is nothing — and "No habits
          // yet" beside a red banner saying the load failed is the page inventing an answer
          // it does not have.
          error ? null : (
            <Empty>{t("habits.none")}</Empty>
          )
        ) : (
          <ul className="habit-list">
            {progress.map((row) => {
              const week = weekLine(row);
              return (
                <li
                  key={row.habit_id}
                  className={`habit ${row.met ? "met" : ""} ${row.due_today ? "" : "resting"}`}
                >
                  <div className="habit-main">
                    <button
                      type="button"
                      className="habit-name"
                      aria-label={t("habits.historyFor", { name: row.name })}
                      onClick={() => void openHeatmap(row.habit_id)}
                    >
                      {row.name}
                    </button>
                    <span className="hint">
                      {progressLine(row)}
                      {week && ` · ${week}`}
                      {row.streak > 0 && (
                        <>
                          {" · "}
                          <span className="streak">{streakLabel(row)}</span>
                        </>
                      )}
                    </span>
                    {row.today_times.length > 0 && (
                      // The times themselves, each one removable. This is what "took it at
                      // 8am, 2pm and 8pm" looks like once a check-in is an occurrence rather
                      // than a counter.
                      <ul
                        className="checkin-times"
                        aria-label={t("habits.todaysCheckins", { name: row.name })}
                      >
                        {row.today_times.map((one) => (
                          <li key={one.id}>
                            <button
                              type="button"
                              className="time-chip"
                              disabled={busy}
                              aria-label={t("habits.removeCheckin", {
                                time: timeLabel(one.done_at) ?? t("habits.untimed"),
                                name: row.name,
                              })}
                              onClick={() => void undo(row.habit_id, one.id)}
                            >
                              {timeLabel(one.done_at) ?? "—"}
                              <span aria-hidden="true"> ×</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="habit-step">
                    <input
                      type="time"
                      className="at"
                      aria-label={t("habits.timeFor", { name: row.name })}
                      value={at[row.habit_id] ?? nowTime()}
                      onChange={(event) =>
                        setAt((was) => ({ ...was, [row.habit_id]: event.target.value }))
                      }
                    />
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={t("habits.checkIn", { name: row.name })}
                      onClick={() => void record(row.habit_id)}
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="hint" style={{ marginBottom: 0 }}>
          {t("habits.todayHint")}
        </p>
      </Card>

      {heatmap && (
        <Card
          title={t("habits.heatmapTitle", { name: heatmap.name, weeks: HEATMAP_WEEKS })}
          actions={
            <button type="button" className="quiet" onClick={() => setHeatmap(null)}>
              {t("action.close")}
            </button>
          }
        >
          <div className="table-wrap">
            <HabitHeatmap data={heatmap} />
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            {describe(heatmap.schedule)}. {t("habits.heatmapLegend")}
          </p>
        </Card>
      )}

      <Card title={t("habits.yours")} collapseKey="habits.list" summary={`${habits.length}`}>
        <form className="row" onSubmit={addHabit} aria-label={t("habits.addAria")}>
          <label style={{ flex: "1 1 160px" }}>
            {t("field.name")}
            <input
              aria-label={t("habits.name")}
              placeholder={t("habits.namePlaceholder")}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <ScheduleFields schedule={schedule} onChange={setSchedule} form={t("habits.formNew")} />
          <button type="submit" disabled={busy}>
            {t("action.add")}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 6 }}>
          {describe(schedule)}. {t("habits.weeksStartMonday")}
        </p>

        {habits.length === 0 ? (
          error ? null : <Empty>{t("state.empty")}</Empty>
        ) : (
          <ul className="habit-list" style={{ marginTop: 12 }}>
            {habits.map((habit) => (
              <li key={habit.id} className="habit">
                <div className="habit-main">
                  <strong>{habit.name}</strong>
                  <span className="hint">
                    {describe(scheduleOf(habit))}
                    {habit.remind ? t("habits.reminds") : ""}
                    {habit.archived_at ? t("habits.archived") : ""}
                  </span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy}
                    onClick={() => startEditing(habit)}
                  >
                    {t("action.edit")}
                  </button>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy}
                    onClick={() => void archive(habit, habit.archived_at === null)}
                  >
                    {habit.archived_at ? t("action.restore") : t("action.archive")}
                  </button>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy}
                    onClick={() => void remove(habit)}
                  >
                    {t("action.delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {editing && (
          <form
            className="row"
            onSubmit={saveEdit}
            aria-label={t("habits.editAria", { name: editing.name })}
          >
            <label style={{ flex: "1 1 160px" }}>
              {t("field.name")}
              <input
                aria-label={t("habits.editName")}
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </label>
            <ScheduleFields
              schedule={editSchedule}
              onChange={setEditSchedule}
              form={t("habits.formEdit")}
            />
            <label className="check" style={{ flex: "0 0 auto" }}>
              <input
                type="checkbox"
                aria-label={t("habits.remindMeAbout")}
                checked={editing.remind}
                onChange={(event) => setEditing({ ...editing, remind: event.target.checked })}
              />
              {t("habits.remindMe")}
            </label>
            <button type="submit" disabled={busy}>
              {t("action.save")}
            </button>
          </form>
        )}
        {editing && (
          <p className="hint" style={{ marginTop: 6 }}>
            {describe(editSchedule)}. {t("habits.editHint")}
          </p>
        )}
      </Card>

      {/* Last, and separated by its own heading and its own sentence, because a chart
          dropped between things that have targets and streaks will be read as one of them.
          The chart lives here — it is the only place in the app that answers "how has this
          been going" — while the icon that records a mood stays on the dashboard, where you
          already are when you notice how you feel.

          English on purpose: Epic 24 is not committed, and the French pass deliberately
          stops at its edge rather than translating strings that may still move. */}
      <Card title="Mood" collapseKey="habits.mood" summary={mood ? `${mood.days_answered}` : ""}>
        <p className="hint" style={{ marginTop: 0 }}>
          Not a habit: there is no target here, nothing to be enough of, and nothing to keep
          a streak of. Recorded from the <Link to="/">dashboard</Link>.
        </p>

        {moodError ? (
          <div className="error" role="alert">
            {moodError}
          </div>
        ) : mood === null ? (
          <p className="hint">{t("state.loading")}</p>
        ) : mood.days_answered === 0 ? (
          <Empty>
            Nothing recorded in the last {MOOD_DAYS} days. The face beside the date on the
            dashboard is where it goes.
          </Empty>
        ) : (
          <>
            <div className="table-wrap">
              <MoodStrip data={mood} />
            </div>
            <p className="hint" style={{ margin: "4px 0 12px" }}>
              {mood.start_on} to today · {mood.days_answered} of {MOOD_DAYS} days answered.
              The bar under a day is whether it was called a good one; an empty outline is a
              day nobody answered, not a bad one.
            </p>
            <MoodTally data={mood} />
            {(mood.days_ok > 0 || mood.days_not_ok > 0) && (
              <p className="hint" style={{ marginBottom: 0 }}>
                Good days: {mood.days_ok} · not good: {mood.days_not_ok} · not said:{" "}
                {MOOD_DAYS - mood.days_ok - mood.days_not_ok}
              </p>
            )}
          </>
        )}
      </Card>
    </>
  );
}
