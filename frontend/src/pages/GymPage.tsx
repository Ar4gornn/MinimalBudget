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

/**
 * Routines and the workout log (Epic 19).
 *
 * A routine is a plan and a workout is a record, and the page keeps them apart: starting a
 * session from a routine prefills the form, it does not write sets. A set exists once it
 * was actually done.
 */
export function GymPage() {
  const { user } = useAuth();
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
      setError(caught instanceof Error ? caught.message : "Could not load the gym.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
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
    }, "Could not create that routine.");
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
    }, "Could not add that exercise.");
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
    }, "Could not start that session.");
  }

  async function logSet(event: FormEvent) {
    event.preventDefault();
    if (!current) return;
    const reps = Number(setReps);
    if (!Number.isInteger(reps) || reps < 1) {
      setError("How many reps? A whole number, at least one.");
      return;
    }
    const weight = setWeight.trim();
    if (weight && !/^\d{1,5}(\.\d{1,2})?$/.test(weight)) {
      setError(`Enter a weight in ${unit}, with at most two decimal places.`);
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
      toast.show("Set logged");
    }, "Could not log that set.");
  }

  if (loading && routines.length === 0 && workouts.length === 0) {
    return <p className="empty">Loading…</p>;
  }

  return (
    <>
      <h1 style={{ fontSize: 18, margin: "0 0 16px" }}>Gym</h1>
      <ErrorBanner message={error} />

      {current ? (
        <Card
          title={`Session · ${current.performed_on}`}
          actions={
            <button type="button" className="quiet" onClick={() => setCurrent(null)}>
              Done
            </button>
          }
        >
          {current.routine_id && (
            <p className="hint" style={{ margin: "0 0 8px" }}>
              From {routineName_(current.routine_id)}
              {routine?.lines.length
                ? ` · ${routine.lines.map((line) => line.exercise_name).join(", ")}`
                : ""}
            </p>
          )}

          <form className="row" onSubmit={logSet} aria-label="Log a set">
            <label style={{ flex: "1 1 160px" }}>
              Exercise
              <input
                list="exercise-names"
                aria-label="Exercise"
                placeholder="Bench press"
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
              Reps
              <input
                className="num"
                inputMode="numeric"
                aria-label="Reps"
                required
                value={setReps}
                onChange={(event) => setSetReps(event.target.value)}
              />
            </label>
            <label style={{ flex: "0 0 110px" }}>
              Weight ({unit})
              <input
                className="num"
                inputMode="decimal"
                aria-label={`Weight in ${unit}`}
                placeholder="—"
                value={setWeight}
                onChange={(event) => setSetWeight(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              Log set
            </button>
          </form>
          <p className="hint" style={{ marginTop: 8 }}>
            Leave the weight blank for a bodyweight set.
          </p>

          {current.sets.length === 0 ? (
            <Empty>No sets yet.</Empty>
          ) : (
            <TableWrap>
              <table className="stacked" aria-label="Sets">
                <thead>
                  <tr>
                    <th>Exercise</th>
                    <th className="num">Reps</th>
                    <th className="num">Weight ({unit})</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {current.sets.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Exercise">{row.exercise_name}</td>
                      <td className="num" data-label="Reps">
                        {row.reps}
                      </td>
                      <td className="num" data-label="Weight">
                        {row.weight ?? <span className="hint">bodyweight</span>}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="quiet"
                          disabled={busy}
                          aria-label={`Delete set of ${row.exercise_name}`}
                          onClick={() =>
                            void run(async () => {
                              await api.deleteSet(row.id);
                              setCurrent(await api.readWorkout(current.id));
                            }, "Could not delete that set.")
                          }
                        >
                          Delete
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
        <Card title="Start a session">
          <div className="row">
            <button type="button" disabled={busy} onClick={() => void startSession()}>
              Start empty
            </button>
            {routines.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="quiet"
                disabled={busy}
                // Named for the action: the Routines card below has a chip with the same
                // text that opens the routine for editing instead.
                aria-label={`Start ${entry.name}`}
                onClick={() => void startSession(entry.id)}
              >
                {entry.name}
              </button>
            ))}
          </div>
          {routines.length === 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              No routines yet. A routine is a named list of exercises you start a session
              from; you can also just start empty.
            </p>
          )}
        </Card>
      )}

      <Card title="Routines" collapseKey="gym.routines" summary={`${routines.length}`}>
        <form className="row" onSubmit={addRoutine} aria-label="Add a routine">
          <label style={{ flex: "1 1 160px" }}>
            Name
            <input
              aria-label="Routine name"
              placeholder="Push day"
              required
              value={routineName}
              onChange={(event) => setRoutineName(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            Add
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
                aria-label={`Edit ${entry.name}`}
                onClick={() =>
                  void run(async () => {
                    setRoutine(
                      routine?.id === entry.id ? null : await api.readRoutine(entry.id),
                    );
                  }, "Could not open that routine.")
                }
              >
                {entry.name}
              </button>
            ))}
          </div>
        )}

        {routine && (
          <>
            <form className="row" onSubmit={addLine} aria-label="Add an exercise to the routine">
              <label style={{ flex: "1 1 160px" }}>
                {/* Not just "Exercise": the session form above uses that, and two fields
                    with the same visible label on one screen is a question, not a label. */}
                Add exercise
                <input
                  list="exercise-names"
                  aria-label="Routine exercise"
                  placeholder="Bench press"
                  required
                  value={lineName}
                  onChange={(event) => setLineName(event.target.value)}
                />
              </label>
              <label style={{ flex: "0 0 80px" }}>
                Sets
                <input
                  className="num"
                  inputMode="numeric"
                  aria-label="Target sets"
                  value={lineSets}
                  onChange={(event) => setLineSets(event.target.value)}
                />
              </label>
              <label style={{ flex: "0 0 80px" }}>
                Reps
                <input
                  className="num"
                  inputMode="numeric"
                  aria-label="Target reps"
                  value={lineReps}
                  onChange={(event) => setLineReps(event.target.value)}
                />
              </label>
              <button type="submit" disabled={busy}>
                Add
              </button>
            </form>

            {routine.lines.length === 0 ? (
              <Empty>Nothing in {routine.name} yet.</Empty>
            ) : (
              <TableWrap>
                <table className="stacked" aria-label={`${routine.name} exercises`}>
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th className="num">Target</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {routine.lines.map((line) => (
                      <tr key={line.id}>
                        <td data-label="Exercise">
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
                                video
                              </a>
                            </>
                          )}
                        </td>
                        <td className="num" data-label="Target">
                          {line.target_sets && line.target_reps
                            ? `${line.target_sets}×${line.target_reps}`
                            : (line.target_sets ?? line.target_reps ?? "—")}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="quiet"
                            disabled={busy}
                            aria-label={`Remove ${line.exercise_name} from ${routine.name}`}
                            onClick={() =>
                              void run(async () => {
                                await api.removeRoutineLine(line.id);
                                setRoutine(await api.readRoutine(routine.id));
                              }, "Could not remove that.")
                            }
                          >
                            Remove
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
        title="Progress"
        collapseKey="gym.progress"
        summary={`${exercises.length} exercises`}
      >
        {exercises.length === 0 ? (
          <Empty>Log a set and the history appears here.</Empty>
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
                    }, "Could not load that history.")
                  }
                >
                  {exercise.name}
                </button>
              ))}
            </div>
            {history &&
              (history.points.length === 0 ? (
                <Empty>Nothing logged for {history.exercise_name} yet.</Empty>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <StrengthChart points={history.points} label={history.exercise_name} unit={unit} />
                </div>
              ))}
          </>
        )}
      </Card>

      <Card title="Recent sessions" collapseKey="gym.recent" summary={`${workouts.length}`}>
        {workouts.length === 0 ? (
          <Empty>Nothing logged yet.</Empty>
        ) : (
          <TableWrap>
            <table className="stacked" aria-label="Recent sessions">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Routine</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {workouts.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Date">{entry.performed_on}</td>
                    <td data-label="Routine">
                      {entry.routine_id ? routineName_(entry.routine_id) : <span className="hint">—</span>}
                    </td>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                        <button
                          type="button"
                          className="quiet"
                          aria-label={`Open session of ${entry.performed_on}`}
                          onClick={() =>
                            void run(async () => {
                              setCurrent(await api.readWorkout(entry.id));
                            }, "Could not open that session.")
                          }
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          aria-label={`Delete session of ${entry.performed_on}`}
                          onClick={() =>
                            void run(async () => {
                              await api.deleteWorkout(entry.id);
                              if (current?.id === entry.id) setCurrent(null);
                              await load();
                            }, "Could not delete that session.")
                          }
                        >
                          Delete
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
