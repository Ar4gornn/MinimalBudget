import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api } from "../api/client";
import type {
  Exercise,
  ExerciseHistory,
  Routine,
  RoutineDetail,
  Workout,
  WorkoutDetail,
} from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Card, Empty, ErrorBanner, TableWrap } from "../components/ui";
import { useToast } from "../components/Toast";
import { StrengthChart } from "../charts/StrengthChart";
import { todayIso } from "../months";
import { useT } from "../i18n";
import type { MessageKey } from "../i18n/catalogue";
import { errorMessage } from "../i18n/errors";

/**
 * Routines and the workout log (Epic 19).
 *
 * A routine is a plan and a workout is a record, and the page keeps them apart: starting a
 * session from a routine prefills the form, it does not write sets. A set exists once it
 * was actually done.
 */
export function GymPage() {
  const { user } = useAuth();
  const t = useT();
  const toast = useToast();
  const unit = user?.weight_unit ?? "kg";

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The session being logged, and the routine open for editing. Only one of each at a time:
  // at the gym you are in one session, and a routine is edited rarely.
  const [current, setCurrent] = useState<WorkoutDetail | null>(null);
  const [routine, setRoutine] = useState<RoutineDetail | null>(null);
  const [history, setHistory] = useState<ExerciseHistory | null>(null);

  const [routineName, setRoutineName] = useState("");
  const [lineName, setLineName] = useState("");
  const [lineSets, setLineSets] = useState("");
  const [lineReps, setLineReps] = useState("");

  const [setExercise, setSetExercise] = useState("");
  const [setReps, setSetReps] = useState("");
  const [setWeight, setSetWeight] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextRoutines, nextWorkouts, nextExercises] = await Promise.all([
        api.listRoutines(),
        api.listWorkouts({ limit: 20 }),
        api.listExercises(),
      ]);
      setRoutines(nextRoutines);
      setWorkouts(nextWorkouts);
      setExercises(nextExercises);
    } catch (caught) {
      setError(errorMessage(t, caught, "gym.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const routineName_ = useMemo(() => {
    const lookup = new Map(routines.map((r) => [r.id, r.name]));
    return (id: string | null) => (id ? (lookup.get(id) ?? "—") : "—");
  }, [routines]);

  // ------------------------------------------------------------- routines

  async function addRoutine(event: FormEvent) {
    event.preventDefault();
    if (!routineName.trim()) return;
    await run(async () => {
      const created = await api.createRoutine(routineName.trim());
      setRoutineName("");
      await load();
      setRoutine(await api.readRoutine(created.id));
    }, "gym.couldNotCreateRoutine");
  }

  async function addLine(event: FormEvent) {
    event.preventDefault();
    if (!routine || !lineName.trim()) return;
    await run(async () => {
      await api.addRoutineLine(routine.id, {
        exercise_name: lineName.trim(),
        ...(lineSets.trim() ? { target_sets: Number(lineSets) } : {}),
        ...(lineReps.trim() ? { target_reps: Number(lineReps) } : {}),
      });
      setLineName("");
      setLineSets("");
      setLineReps("");
      setRoutine(await api.readRoutine(routine.id));
      setExercises(await api.listExercises());
    }, "gym.couldNotAddExercise");
  }

  // ------------------------------------------------------------- workouts

  async function startSession(routineId?: string) {
    await run(async () => {
      const created = await api.startWorkout({
        performed_on: todayIso(),
        ...(routineId ? { routine_id: routineId } : {}),
      });
      const detail = await api.readWorkout(created.id);
      setCurrent(detail);
      // Prefill from the routine, so the first exercise is already in the field.
      if (routineId) {
        const plan = await api.readRoutine(routineId);
        setRoutine(plan);
        setSetExercise(plan.lines[0]?.exercise_name ?? "");
      }
      await load();
    }, "gym.couldNotStart");
  }

  async function logSet(event: FormEvent) {
    event.preventDefault();
    if (!current) return;
    const reps = Number(setReps);
    if (!Number.isInteger(reps) || reps < 1) {
      setError(t("gym.badReps"));
      return;
    }
    const weight = setWeight.trim();
    if (weight && !/^\d{1,5}(\.\d{1,2})?$/.test(weight)) {
      setError(t("gym.badWeight", { unit }));
      return;
    }
    await run(async () => {
      await api.logSet(current.id, {
        exercise_name: setExercise.trim(),
        reps,
        ...(weight ? { weight } : {}),
      });
      setSetReps("");
      setCurrent(await api.readWorkout(current.id));
      setExercises(await api.listExercises());
      toast.show(t("gym.setLogged"));
    }, "gym.couldNotLogSet");
  }

  if (loading && routines.length === 0 && workouts.length === 0) {
    return <p className="empty">{t("state.loading")}</p>;
  }

  return (
    <>
      <h1 style={{ fontSize: 18, margin: "0 0 16px" }}>{t("gym.title")}</h1>
      <ErrorBanner message={error} />

      {current ? (
        <Card
          title={t("gym.session", { date: current.performed_on })}
          actions={
            <button type="button" className="quiet" onClick={() => setCurrent(null)}>
              {t("gym.done")}
            </button>
          }
        >
          {current.routine_id && (
            <p className="hint" style={{ margin: "0 0 8px" }}>
              {t("gym.fromRoutine", { name: routineName_(current.routine_id) })}
              {routine?.lines.length
                ? ` · ${routine.lines.map((line) => line.exercise_name).join(", ")}`
                : ""}
            </p>
          )}

          <form className="row" onSubmit={logSet} aria-label={t("gym.logASet")}>
            <label style={{ flex: "1 1 160px" }}>
              {t("gym.exercise")}
              <input
                list="exercise-names"
                aria-label={t("gym.exercise")}
                placeholder={t("gym.exercisePlaceholder")}
                required
                value={setExercise}
                onChange={(event) => setSetExercise(event.target.value)}
              />
            </label>
            <datalist id="exercise-names">
              {exercises.map((exercise) => (
                <option key={exercise.id} value={exercise.name} />
              ))}
            </datalist>
            <label style={{ flex: "0 0 90px" }}>
              {t("gym.reps")}
              <input
                className="num"
                inputMode="numeric"
                aria-label={t("gym.reps")}
                required
                value={setReps}
                onChange={(event) => setSetReps(event.target.value)}
              />
            </label>
            <label style={{ flex: "0 0 110px" }}>
              {t("gym.weight", { unit })}
              <input
                className="num"
                inputMode="decimal"
                aria-label={t("gym.weightAria", { unit })}
                placeholder="—"
                value={setWeight}
                onChange={(event) => setSetWeight(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              {t("gym.logSet")}
            </button>
          </form>
          <p className="hint" style={{ marginTop: 8 }}>
            {t("gym.bodyweightHint")}
          </p>

          {current.sets.length === 0 ? (
            <Empty>{t("gym.noSets")}</Empty>
          ) : (
            <TableWrap>
              <table className="stacked" aria-label={t("gym.sets")}>
                <thead>
                  <tr>
                    <th>{t("gym.exercise")}</th>
                    <th className="num">{t("gym.reps")}</th>
                    <th className="num">{t("gym.weight", { unit })}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {current.sets.map((row) => (
                    <tr key={row.id}>
                      <td data-label={t("gym.exercise")}>{row.exercise_name}</td>
                      <td className="num" data-label={t("gym.reps")}>
                        {row.reps}
                      </td>
                      <td className="num" data-label={t("gym.weightShort")}>
                        {row.weight ?? <span className="hint">{t("gym.bodyweight")}</span>}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="quiet"
                          disabled={busy}
                          aria-label={t("gym.deleteSet", { name: row.exercise_name })}
                          onClick={() =>
                            void run(async () => {
                              await api.deleteSet(row.id);
                              setCurrent(await api.readWorkout(current.id));
                            }, "gym.couldNotDeleteSet")
                          }
                        >
                          {t("action.delete")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      ) : (
        <Card title={t("gym.startSession")}>
          <div className="row">
            <button type="button" disabled={busy} onClick={() => void startSession()}>
              {t("gym.startEmpty")}
            </button>
            {routines.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="quiet"
                disabled={busy}
                // Named for the action: the Routines card below has a chip with the same
                // text that opens the routine for editing instead.
                aria-label={t("gym.startNamed", { name: entry.name })}
                onClick={() => void startSession(entry.id)}
              >
                {entry.name}
              </button>
            ))}
          </div>
          {routines.length === 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              {t("gym.noRoutinesHint")}
            </p>
          )}
        </Card>
      )}

      <Card
        title={t("gym.routines")}
        collapseKey="gym.routines"
        summary={`${routines.length}`}
      >
        <form className="row" onSubmit={addRoutine} aria-label={t("gym.addRoutine")}>
          <label style={{ flex: "1 1 160px" }}>
            {t("field.name")}
            <input
              aria-label={t("gym.routineName")}
              placeholder={t("gym.routinePlaceholder")}
              required
              value={routineName}
              onChange={(event) => setRoutineName(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            {t("action.add")}
          </button>
        </form>

        {routines.length > 0 && (
          <div className="row" style={{ marginTop: 8 }}>
            {routines.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`chip ${routine?.id === entry.id ? "on" : ""}`}
                aria-pressed={routine?.id === entry.id}
                aria-label={t("gym.editNamed", { name: entry.name })}
                onClick={() =>
                  void run(async () => {
                    setRoutine(
                      routine?.id === entry.id ? null : await api.readRoutine(entry.id),
                    );
                  }, "gym.couldNotOpenRoutine")
                }
              >
                {entry.name}
              </button>
            ))}
          </div>
        )}

        {routine && (
          <>
            <form
              className="row"
              onSubmit={addLine}
              aria-label={t("gym.addExerciseTo")}
            >
              <label style={{ flex: "1 1 160px" }}>
                {/* Not just "Exercise": the session form above uses that, and two fields
                    with the same visible label on one screen is a question, not a label. */}
                {t("gym.addExercise")}
                <input
                  list="exercise-names"
                  aria-label={t("gym.routineExercise")}
                  placeholder={t("gym.exercisePlaceholder")}
                  required
                  value={lineName}
                  onChange={(event) => setLineName(event.target.value)}
                />
              </label>
              <label style={{ flex: "0 0 80px" }}>
                {t("gym.setsShort")}
                <input
                  className="num"
                  inputMode="numeric"
                  aria-label={t("gym.targetSets")}
                  value={lineSets}
                  onChange={(event) => setLineSets(event.target.value)}
                />
              </label>
              <label style={{ flex: "0 0 80px" }}>
                {t("gym.reps")}
                <input
                  className="num"
                  inputMode="numeric"
                  aria-label={t("gym.targetReps")}
                  value={lineReps}
                  onChange={(event) => setLineReps(event.target.value)}
                />
              </label>
              <button type="submit" disabled={busy}>
                {t("action.add")}
              </button>
            </form>

            {routine.lines.length === 0 ? (
              <Empty>{t("gym.emptyRoutine", { name: routine.name })}</Empty>
            ) : (
              <TableWrap>
                <table
                  className="stacked"
                  aria-label={t("gym.routineExercises", { name: routine.name })}
                >
                  <thead>
                    <tr>
                      <th>{t("gym.exercise")}</th>
                      <th className="num">{t("gym.colTarget")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {routine.lines.map((line) => (
                      <tr key={line.id}>
                        <td data-label={t("gym.exercise")}>
                          {line.exercise_name}
                          {line.video_url && (
                            <>
                              {" "}
                              <a
                                href={line.video_url}
                                target="_blank"
                                // noopener so the opened page cannot reach back through
                                // window.opener; noreferrer so it is not told where from.
                                rel="noopener noreferrer"
                              >
                                {t("gym.video")}
                              </a>
                            </>
                          )}
                        </td>
                        <td className="num" data-label={t("gym.colTarget")}>
                          {line.target_sets && line.target_reps
                            ? `${line.target_sets}×${line.target_reps}`
                            : (line.target_sets ?? line.target_reps ?? "—")}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="quiet"
                            disabled={busy}
                            aria-label={t("gym.removeFrom", {
                              exercise: line.exercise_name,
                              routine: routine.name,
                            })}
                            onClick={() =>
                              void run(async () => {
                                await api.removeRoutineLine(line.id);
                                setRoutine(await api.readRoutine(routine.id));
                              }, "gym.couldNotRemove")
                            }
                          >
                            {t("action.remove")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </>
        )}
      </Card>

      <Card
        title={t("gym.progress")}
        collapseKey="gym.progress"
        summary={t("gym.exerciseCount", { count: exercises.length })}
      >
        {exercises.length === 0 ? (
          <Empty>{t("gym.logToSee")}</Empty>
        ) : (
          <>
            <div className="row">
              {exercises.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  className={`chip ${history?.exercise_id === exercise.id ? "on" : ""}`}
                  onClick={() =>
                    void run(async () => {
                      setHistory(
                        history?.exercise_id === exercise.id
                          ? null
                          : await api.exerciseHistory(exercise.id),
                      );
                    }, "gym.couldNotLoadHistory")
                  }
                >
                  {exercise.name}
                </button>
              ))}
            </div>
            {history &&
              (history.points.length === 0 ? (
                <Empty>{t("gym.nothingLoggedFor", { name: history.exercise_name })}</Empty>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <StrengthChart points={history.points} label={history.exercise_name} unit={unit} />
                </div>
              ))}
          </>
        )}
      </Card>

      <Card
        title={t("gym.recent")}
        collapseKey="gym.recent"
        summary={`${workouts.length}`}
      >
        {workouts.length === 0 ? (
          <Empty>{t("gym.nothingLogged")}</Empty>
        ) : (
          <TableWrap>
            <table className="stacked" aria-label={t("gym.recent")}>
              <thead>
                <tr>
                  <th>{t("field.date")}</th>
                  <th>{t("gym.colRoutine")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {workouts.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label={t("field.date")}>{entry.performed_on}</td>
                    <td data-label={t("gym.colRoutine")}>
                      {entry.routine_id ? routineName_(entry.routine_id) : <span className="hint">—</span>}
                    </td>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                        <button
                          type="button"
                          className="quiet"
                          aria-label={t("gym.openSession", { date: entry.performed_on })}
                          onClick={() =>
                            void run(async () => {
                              setCurrent(await api.readWorkout(entry.id));
                            }, "gym.couldNotOpenSession")
                          }
                        >
                          {t("gym.open")}
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          aria-label={t("gym.deleteSession", { date: entry.performed_on })}
                          onClick={() =>
                            void run(async () => {
                              await api.deleteWorkout(entry.id);
                              if (current?.id === entry.id) setCurrent(null);
                              await load();
                            }, "gym.couldNotDeleteSession")
                          }
                        >
                          {t("action.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
