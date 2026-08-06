import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiRequestError } from "../../../shared/http/api-client";
import { FormField } from "../../../shared/ui/FormField";
import {
  listExercises,
  recordingModeLabels,
  type ExerciseItem,
  type RecordingMode,
} from "../../exercises/api/exercises-api";
import {
  createRoutine,
  replaceRoutine,
  type RoutineInput,
  type RoutineItem,
  type RoutineRecordingMode,
} from "../api/routines-api";
import styles from "./RoutineEditor.module.css";

type EditorSeries = {
  key: string;
  id?: string;
  carga: string;
  repeticiones: string;
  duracion: string;
};

/** Datos resueltos por el servidor de un Ejercicio referenciado por la Rutina. */
type ResolvedExercise = {
  id: string;
  name: string;
  recordingMode: RoutineRecordingMode;
  available: boolean;
  provenance: "catalogo" | "personalizado";
};

type EditorExercise = {
  key: string;
  id?: string;
  exerciseId: string;
  exercise: ResolvedExercise | null;
  series: EditorSeries[];
};

type EditorErrors = Record<string, string[]>;

const targetLabels: Record<"carga" | "repeticiones" | "duracion", string> = {
  carga: "Carga (kg)",
  repeticiones: "Repeticiones",
  duracion: "Duración (seg)",
};

const allowedTargets: Record<RoutineRecordingMode, Array<"carga" | "repeticiones" | "duracion">> = {
  fuerza_con_carga: ["carga", "repeticiones"],
  repeticiones_sin_carga: ["repeticiones"],
  tiempo_por_serie: ["duracion"],
  cardio_continuo: ["duracion"],
};

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `ed-${keyCounter}`;
}

function emptySeries(): EditorSeries {
  return { key: nextKey(), carga: "", repeticiones: "", duracion: "" };
}

function copySeries(series: EditorSeries): EditorSeries {
  return { ...series, key: nextKey() };
}

function toEditorSeries(series: RoutineItem["exercises"][number]["series"][number]): EditorSeries {
  return {
    key: nextKey(),
    id: series.id,
    carga: series.carga === null ? "" : String(series.carga),
    repeticiones: series.repeticiones === null ? "" : String(series.repeticiones),
    duracion: series.duracion === null ? "" : String(series.duracion),
  };
}

function toEditorExercise(entry: RoutineItem["exercises"][number]): EditorExercise {
  return {
    key: nextKey(),
    id: entry.id,
    exerciseId: entry.exerciseId,
    exercise: {
      id: entry.exercise.id,
      name: entry.exercise.name,
      recordingMode: entry.exercise.recordingMode,
      available: entry.exercise.available,
      provenance: entry.exercise.provenance,
    },
    series: entry.series.map(toEditorSeries),
  };
}

/** Convierte un objetivo escrito en su número o lo omite si quedó vacío. */
function parseTarget(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : "invalid";
}

function targetError(target: "carga" | "repeticiones" | "duracion", value: number): string | null {
  if (target === "carga") {
    if (value < 0 || value > 9999.99) return "La carga admite de 0 a 9999,99 kg.";
    if (Number(value.toFixed(2)) !== value) return "La carga admite como máximo dos decimales.";
    return null;
  }
  if (target === "repeticiones") {
    return Number.isInteger(value) && value >= 1 && value <= 9999
      ? null
      : "Las repeticiones admiten enteros de 1 a 9999.";
  }
  return Number.isInteger(value) && value >= 1 && value <= 359999
    ? null
    : "La duración admite enteros de 1 a 359999 segundos.";
}

/** Validación inmediata del borrador; el servidor sigue siendo la autoridad. */
function validateDraft(name: string, exercises: EditorExercise[]): EditorErrors {
  const errors: EditorErrors = {};
  const addError = (key: string, message: string) => {
    const existing = errors[key] ?? [];
    existing.push(message);
    errors[key] = existing;
  };

  if (name.trim().length === 0) {
    addError("name", "Escribe un nombre para la Rutina.");
  }

  exercises.forEach((entry, index) => {
    const mode = entry.exercise?.recordingMode;
    if (!mode) {
      addError(`exercises[${index}].exerciseId`, "Elige un Ejercicio para esta entrada.");
      return;
    }
    if (mode === "cardio_continuo" && entry.series.length !== 1) {
      addError(
        `exercises[${index}].series`,
        "El cardio continuo admite exactamente una Serie por aparición.",
      );
    } else if (mode !== "cardio_continuo" && entry.series.length === 0) {
      addError(
        `exercises[${index}].series`,
        "Cada Ejercicio necesita al menos una Serie prevista.",
      );
    }

    const allowed = allowedTargets[mode];
    entry.series.forEach((series, seriesIndex) => {
      const targets: Array<["carga" | "repeticiones" | "duracion", string]> = [
        ["carga", series.carga],
        ["repeticiones", series.repeticiones],
        ["duracion", series.duracion],
      ];
      for (const [target, raw] of targets) {
        if (raw.trim().length === 0) continue;
        const parsed = parseTarget(raw);
        if (parsed === "invalid") {
          addError(
            `exercises[${index}].series[${seriesIndex}].${target}`,
            "Introduce un número válido.",
          );
          continue;
        }
        if (parsed === null) {
          continue;
        }
        if (!allowed.includes(target)) {
          addError(
            `exercises[${index}].series[${seriesIndex}].${target}`,
            "Objetivo no admitido por la Forma de registro del Ejercicio.",
          );
          continue;
        }
        const limit = targetError(target, parsed);
        if (limit) {
          addError(`exercises[${index}].series[${seriesIndex}].${target}`, limit);
        }
      }
    });
  });

  return errors;
}

function buildInput(name: string, exercises: EditorExercise[]): RoutineInput {
  return {
    name: name.trim(),
    exercises: exercises.map((entry) => ({
      id: entry.id,
      exerciseId: entry.exerciseId,
      series: entry.series.map((series) => {
        const toNumber = (raw: string): number | null | undefined => {
          const parsed = parseTarget(raw);
          return parsed === null ? null : parsed === "invalid" ? undefined : parsed;
        };
        return {
          id: series.id,
          carga: toNumber(series.carga),
          repeticiones: toNumber(series.repeticiones),
          duracion: toNumber(series.duracion),
        };
      }),
    })),
  };
}

function fieldError(errors: EditorErrors, key: string): string | undefined {
  const messages = errors[key];
  return messages && messages.length > 0 ? messages[0] : undefined;
}

type ExercisePickerProps = {
  selectedExerciseIds: string[];
  onPick: (exercise: ExerciseItem) => void;
  onClose: () => void;
};

function ExercisePicker({ selectedExerciseIds, onPick, onClose }: ExercisePickerProps) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const exercisesQuery = useQuery({
    queryKey: ["exercises", "picker", { q }],
    queryFn: () => listExercises({ q }),
    retry: false,
  });

  const applySearch = () => {
    setQ(search.trim());
  };

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  return (
    <div
      className={styles.pickerBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.pickerPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rutina-picker-titulo"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className={styles.pickerHeader}>
          <div>
            <p className={styles.pickerKicker}>Añadir a la Rutina</p>
            <h2 id="rutina-picker-titulo">Busca un Ejercicio</h2>
          </div>
          <button className={styles.pickerCloseIcon} type="button" onClick={onClose} aria-label="Cerrar selector">
            ×
          </button>
        </div>

        <div className={styles.pickerSearch} role="search">
          <label className={styles.visuallyHidden} htmlFor="rutina-picker-busqueda">
            Buscar Ejercicios disponibles
          </label>
          <input
            ref={searchInputRef}
            id="rutina-picker-busqueda"
            className={styles.pickerInput}
            type="search"
            placeholder="Buscar por nombre (p. ej. «press»)"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applySearch();
              }
            }}
          />
          <button className={styles.pickerButton} type="button" onClick={applySearch}>
            Buscar
          </button>
        </div>

        <div className={styles.pickerResults}>
          {exercisesQuery.isPending && (
            <p className={styles.pickerStatus}>Buscando Ejercicios…</p>
          )}
          {exercisesQuery.isError && (
            <p className={styles.pickerStatus} role="alert">
              No se pudieron cargar los Ejercicios disponibles.
            </p>
          )}
          {exercisesQuery.isSuccess && exercisesQuery.data.items.length === 0 && (
            <p className={styles.pickerStatus}>Sin Ejercicios disponibles con ese nombre.</p>
          )}
          {exercisesQuery.isSuccess && exercisesQuery.data.items.length > 0 && (
            <ul className={styles.pickerList}>
              {exercisesQuery.data.items.map((exercise) => (
                <li key={exercise.id} className={styles.pickerItem}>
                  <div className={styles.pickerExerciseCopy}>
                    <strong className={styles.pickerName}>{exercise.name}</strong>
                    <span className={styles.pickerMeta}>
                      {recordingModeLabels[exercise.recordingMode]} · {exercise.category}
                    </span>
                  </div>
                  <button
                    className={styles.pickerAdd}
                    type="button"
                    disabled={selectedExerciseIds.includes(exercise.id)}
                    onClick={() => onPick(exercise)}
                  >
                    {selectedExerciseIds.includes(exercise.id) ? "Añadido" : "Añadir"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className={styles.pickerHint}>Pulsa Enter para buscar · Escape para cerrar</p>
      </div>
    </div>
  );
}

type RoutineEditorProps = {
  routine?: RoutineItem | null;
  submitLabel: string;
  onSaved: (routine: RoutineItem) => void;
  onCancel: () => void;
  /** La revisión enviada quedó obsoleta: el padre debe cargar la versión vigente. */
  onConflict?: () => void;
};

export function RoutineEditor({
  routine,
  submitLabel,
  onSaved,
  onCancel,
  onConflict,
}: RoutineEditorProps) {
  const [name, setName] = useState(routine?.name ?? "");
  const [exercises, setExercises] = useState<EditorExercise[]>(() =>
    (routine?.exercises ?? []).map(toEditorExercise),
  );
  const [activeExerciseKey, setActiveExerciseKey] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<EditorErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [staleRevision, setStaleRevision] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isEdit = routine !== undefined && routine !== null;
  const prefix = isEdit ? `rutina-${routine!.id}` : "rutina-nueva";
  const selectedExerciseIds = useMemo(
    () => exercises.map((entry) => entry.exerciseId),
    [exercises],
  );

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPickerOpen(true);
      }
      if (pickerOpen && event.key === "Escape") {
        event.preventDefault();
        setPickerOpen(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [pickerOpen]);

  const addExercise = (exercise: ExerciseItem) => {
    const entry: EditorExercise = {
      key: nextKey(),
      exerciseId: exercise.id,
      exercise,
      series: [emptySeries()],
    };
    setExercises((previous) => [...previous, entry]);
    setActiveExerciseKey(entry.key);
    setPickerOpen(false);
    setErrors({});
  };

  const removeExercise = (key: string) => {
    const removedIndex = exercises.findIndex((entry) => entry.key === key);
    const remaining = exercises.filter((entry) => entry.key !== key);
    setExercises(remaining);
    if (activeExerciseKey === key) {
      setActiveExerciseKey(
        remaining[Math.min(removedIndex, remaining.length - 1)]?.key ?? "",
      );
    }
    setErrors({});
  };

  const moveExercise = (key: string, direction: -1 | 1) => {
    setExercises((previous) => {
      const index = previous.findIndex((entry) => entry.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= previous.length) {
        return previous;
      }
      const next = [...previous];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  };

  const updateExercise = (key: string, update: (entry: EditorExercise) => EditorExercise) => {
    setExercises((previous) =>
      previous.map((entry) => (entry.key === key ? update(entry) : entry)),
    );
  };

  const addSeries = (key: string) => {
    updateExercise(key, (entry) => ({
      ...entry,
      series: [...entry.series, copySeries(entry.series.at(-1) ?? emptySeries())],
    }));
  };

  const removeSeries = (key: string, seriesKey: string) => {
    updateExercise(key, (entry) => ({
      ...entry,
      series: entry.series.filter((series) => series.key !== seriesKey),
    }));
  };

  const updateSeries = (
    key: string,
    seriesKey: string,
    update: (series: EditorSeries) => EditorSeries,
  ) => {
    updateExercise(key, (entry) => ({
      ...entry,
      series: entry.series.map((series) => (series.key === seriesKey ? update(series) : series)),
    }));
  };

  const reloadCurrent = () => {
    setStaleRevision(false);
    setServerError(null);
    onConflict?.();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateDraft(name, exercises);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      setServerError(null);
      return;
    }
    setErrors({});
    setServerError(null);
    setIsSaving(true);
    try {
      const input = buildInput(name, exercises);
      const result = isEdit
        ? await replaceRoutine(routine!.id, routine!.revision, input)
        : await createRoutine(input);
      onSaved(result.routine);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.code === "STALE_REVISION") {
          setStaleRevision(true);
          return;
        }
        if (error.fields && Object.keys(error.fields).length > 0) {
          setErrors(error.fields);
        } else {
          setServerError(error.message);
        }
      } else {
        setServerError("No se pudo guardar la Rutina. Inténtalo de nuevo.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const activeExerciseIndex = Math.max(
    0,
    exercises.findIndex((entry) => entry.key === activeExerciseKey),
  );
  const activeExercise = exercises[activeExerciseIndex];

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <FormField
        label="Nombre de la Rutina"
        htmlFor={`${prefix}-nombre`}
        error={fieldError(errors, "name")}
      >
        <input
          id={`${prefix}-nombre`}
          className={styles.input}
          type="text"
          autoComplete="off"
          aria-invalid={fieldError(errors, "name") ? true : undefined}
          aria-describedby={fieldError(errors, "name") ? `${prefix}-nombre-error` : undefined}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>

      {staleRevision && (
        <p className={styles.conflict} role="alert">
          La Rutina fue modificada por otra sesión. Tus cambios no se guardaron para no
          sobrescribir los ajenos.
          <button className={styles.conflictButton} type="button" onClick={reloadCurrent}>
            Cargar la versión actual
          </button>
        </p>
      )}

      <section className={styles.editorShell} aria-labelledby={`${prefix}-ejercicios-titulo`}>
        <aside className={styles.exerciseRail}>
          <div className={styles.railHeading}>
            <div>
              <p className={styles.railKicker}>Paso 1 de 2</p>
              <h2 id={`${prefix}-ejercicios-titulo`}>Ejercicios</h2>
            </div>
            <span className={styles.railCount}>{exercises.length}</span>
          </div>

          {exercises.length === 0 && (
            <p className={styles.emptyExercises}>
              Aún no hay Ejercicios. Añade el primero para empezar.
            </p>
          )}

          <ol className={styles.exerciseList}>
            {exercises.map((entry, index) => {
              const exerciseName = entry.exercise?.name ?? "Ejercicio sin elegir";
              const isActive = entry.key === activeExercise?.key;
              const hasError = Boolean(
                fieldError(errors, `exercises[${index}].exerciseId`) ||
                  fieldError(errors, `exercises[${index}].series`),
              );
              return (
                <li key={entry.key} className={styles.exerciseListItem}>
                  <button
                    type="button"
                    className={isActive ? styles.exerciseSelectActive : styles.exerciseSelect}
                    aria-current={isActive ? "step" : undefined}
                    onClick={() => setActiveExerciseKey(entry.key)}
                  >
                    <span className={styles.exerciseListNumber}>{index + 1}</span>
                    <span className={styles.exerciseListCopy}>
                      <strong>{exerciseName}</strong>
                      <small>
                        {entry.series.length} {entry.series.length === 1 ? "serie" : "series"}
                        {hasError && " · revisar"}
                      </small>
                    </span>
                  </button>
                  <div className={styles.railOrder}>
                    <button
                      type="button"
                      aria-label={`Subir ${exerciseName}`}
                      disabled={index === 0}
                      onClick={() => moveExercise(entry.key, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Bajar ${exerciseName}`}
                      disabled={index === exercises.length - 1}
                      onClick={() => moveExercise(entry.key, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>

          {pickerOpen && (
            <ExercisePicker
              selectedExerciseIds={selectedExerciseIds}
              onPick={addExercise}
              onClose={() => setPickerOpen(false)}
            />
          )}
          {!pickerOpen && (
            <button
              type="button"
              className={styles.addExercise}
              onClick={() => setPickerOpen(true)}
            >
              <span aria-hidden="true">＋ </span>Añadir ejercicio
            </button>
          )}
        </aside>

        <div className={styles.exerciseWorkspace}>
          {!activeExercise && (
            <div className={styles.workspaceEmpty}>
              <p className={styles.railKicker}>Paso 2 de 2</p>
              <h2>Empieza añadiendo un Ejercicio</h2>
              <p>Después podrás definir sus Series previstas aquí.</p>
            </div>
          )}

          {activeExercise && (() => {
            const mode = activeExercise.exercise?.recordingMode as RecordingMode | undefined;
            const isCardio = mode === "cardio_continuo";
            const seriesError = fieldError(errors, `exercises[${activeExerciseIndex}].series`);
            return (
              <article
                className={styles.focusCard}
                aria-label={activeExercise.exercise?.name ?? "Ejercicio sin elegir"}
              >
                <header className={styles.focusHeader}>
                  <div>
                    <p className={styles.railKicker}>
                      Paso 2 de 2 · Ejercicio {activeExerciseIndex + 1} de {exercises.length}
                    </p>
                    <h2>{activeExercise.exercise?.name ?? "Elige un Ejercicio"}</h2>
                    {mode && <p>{recordingModeLabels[mode]}</p>}
                  </div>
                  <button
                    type="button"
                    className={styles.removeExercise}
                    aria-label={`Quitar ${activeExercise.exercise?.name ?? "el Ejercicio"} de la Rutina`}
                    onClick={() => removeExercise(activeExercise.key)}
                  >
                    Quitar ejercicio
                  </button>
                </header>

                {fieldError(errors, `exercises[${activeExerciseIndex}].exerciseId`) && (
                  <p className={styles.fieldError} role="alert">
                    {fieldError(errors, `exercises[${activeExerciseIndex}].exerciseId`)}
                  </p>
                )}

                <div className={styles.focusTip}>
                  <strong>Cómo funciona:</strong> la primera Serie empieza vacía; cada nueva Serie copia los objetivos de la anterior.
                </div>

                <div className={styles.seriesBlock}>
                  <div className={styles.focusSeriesHeading}>
                    <div>
                      <h3>Series previstas</h3>
                      <p>{isCardio ? "El cardio continuo admite una única Serie." : "Ajusta solo lo que cambie entre Series."}</p>
                    </div>
                    {!isCardio && (
                      <button
                        type="button"
                        className={styles.addSeries}
                        onClick={() => addSeries(activeExercise.key)}
                      >
                        <span aria-hidden="true">＋ </span>Añadir serie
                      </button>
                    )}
                  </div>
                  {seriesError && (
                    <p className={styles.fieldError} role="alert">
                      {seriesError}
                    </p>
                  )}
                  <ol className={styles.focusSeriesList}>
                    {activeExercise.series.map((series, seriesIndex) => (
                      <li key={series.key} className={styles.focusSeriesRow}>
                        <span className={styles.seriesNumber}>Serie {seriesIndex + 1}</span>
                        {(mode ? allowedTargets[mode as RoutineRecordingMode] : []).map((target) => (
                          <label key={target} className={styles.seriesTarget}>
                            <span className={styles.seriesTargetLabel}>{targetLabels[target]}</span>
                            <input
                              className={styles.input}
                              type="number"
                              inputMode="decimal"
                              step={target === "carga" ? "0.01" : "1"}
                              min={target === "carga" ? 0 : 1}
                              value={series[target]}
                              aria-invalid={fieldError(errors, `exercises[${activeExerciseIndex}].series[${seriesIndex}].${target}`) ? true : undefined}
                              aria-describedby={
                                fieldError(errors, `exercises[${activeExerciseIndex}].series[${seriesIndex}].${target}`)
                                  ? `${prefix}-serie-${activeExerciseIndex}-${seriesIndex}-${target}-error`
                                  : undefined
                              }
                              onChange={(event) =>
                                updateSeries(activeExercise.key, series.key, (current) => ({
                                  ...current,
                                  [target]: event.target.value,
                                }))
                              }
                            />
                            {fieldError(errors, `exercises[${activeExerciseIndex}].series[${seriesIndex}].${target}`) && (
                              <span
                                id={`${prefix}-serie-${activeExerciseIndex}-${seriesIndex}-${target}-error`}
                                className={styles.fieldError}
                              >
                                {fieldError(errors, `exercises[${activeExerciseIndex}].series[${seriesIndex}].${target}`)}
                              </span>
                            )}
                          </label>
                        ))}
                        <button
                          type="button"
                          className={styles.removeSeries}
                          aria-label={`Quitar la Serie ${seriesIndex + 1} de ${activeExercise.exercise?.name ?? "este Ejercicio"}`}
                          disabled={activeExercise.series.length <= 1 || isCardio}
                          onClick={() => removeSeries(activeExercise.key, series.key)}
                        >
                          Quitar serie
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>
            );
          })()}
        </div>
      </section>

      {serverError && (
        <p className={styles.formError} role="alert">
          <span aria-hidden="true">⚠</span>
          {serverError}
        </p>
      )}

      <div className={styles.actions}>
        <button className={styles.submit} type="submit" disabled={isSaving}>
          {isSaving ? "Guardando…" : submitLabel}
        </button>
        <button
          className={styles.cancel}
          type="button"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
