import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
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
  const exercisesQuery = useQuery({
    queryKey: ["exercises", "picker", { q }],
    queryFn: () => listExercises({ q }),
    retry: false,
  });

  const applySearch = () => {
    setQ(search.trim());
  };

  return (
    <div className={styles.pickerPanel} role="region" aria-label="Añadir Ejercicio a la Rutina">
      <div className={styles.pickerSearch} role="search">
        <label className={styles.visuallyHidden} htmlFor="rutina-picker-busqueda">
          Buscar Ejercicios disponibles
        </label>
        <input
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
              <span className={styles.pickerName}>{exercise.name}</span>
              <span className={styles.pickerMeta}>
                {recordingModeLabels[exercise.recordingMode]} · {exercise.category}
              </span>
              <button
                className={styles.pickerAdd}
                type="button"
                disabled={selectedExerciseIds.includes(exercise.id)}
                onClick={() => onPick(exercise)}
              >
                Añadir
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className={styles.pickerClose} type="button" onClick={onClose}>
        Cerrar selector
      </button>
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

  const addExercise = (exercise: ExerciseItem) => {
    const entry: EditorExercise = {
      key: nextKey(),
      exerciseId: exercise.id,
      exercise,
      series: [emptySeries()],
    };
    setExercises((previous) => [...previous, entry]);
    setPickerOpen(false);
    setErrors({});
  };

  const removeExercise = (key: string) => {
    setExercises((previous) => previous.filter((entry) => entry.key !== key));
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
    updateExercise(key, (entry) => ({ ...entry, series: [...entry.series, emptySeries()] }));
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

      <section className={styles.exercisesSection} aria-labelledby={`${prefix}-ejercicios-titulo`}>
        <h2 id={`${prefix}-ejercicios-titulo`} className={styles.sectionHeading}>
          Ejercicios de la Rutina
        </h2>

        {exercises.length === 0 && (
          <p className={styles.emptyExercises}>
            Todavía no has añadido Ejercicios. Usa «Añadir ejercicio» para empezar.
          </p>
        )}

        {exercises.map((entry, index) => {
          const mode = entry.exercise?.recordingMode as RecordingMode | undefined;
          const isCardio = mode === "cardio_continuo";
          const seriesError = fieldError(errors, `exercises[${index}].series`);
          return (
            <article key={entry.key} className={styles.exerciseCard} aria-label={entry.exercise?.name ?? "Ejercicio sin elegir"}>
              <div className={styles.exerciseHeader}>
                <div className={styles.exerciseIdentity}>
                  <h3 className={styles.exerciseName}>
                    {entry.exercise?.name ?? "Elige un Ejercicio"}
                  </h3>
                  {mode && (
                    <p className={styles.exerciseMeta}>{recordingModeLabels[mode]}</p>
                  )}
                </div>
                <div className={styles.exerciseOrder}>
                  <button
                    type="button"
                    aria-label={`Subir ${entry.exercise?.name ?? "el Ejercicio"}`}
                    disabled={index === 0}
                    onClick={() => moveExercise(entry.key, -1)}
                  >
                    ↑
                  </button>
                  <span className={styles.orderBadge}>{index + 1}</span>
                  <button
                    type="button"
                    aria-label={`Bajar ${entry.exercise?.name ?? "el Ejercicio"}`}
                    disabled={index === exercises.length - 1}
                    onClick={() => moveExercise(entry.key, 1)}
                  >
                    ↓
                  </button>
                </div>
              </div>

              {fieldError(errors, `exercises[${index}].exerciseId`) && (
                <p className={styles.fieldError} role="alert">
                  {fieldError(errors, `exercises[${index}].exerciseId`)}
                </p>
              )}

              <div className={styles.seriesBlock}>
                <h4 className={styles.seriesHeading}>
                  Series previstas
                  {isCardio && <span className={styles.cardioNote}> · cardio continuo: una Serie</span>}
                </h4>
                {seriesError && (
                  <p className={styles.fieldError} role="alert">
                    {seriesError}
                  </p>
                )}
                <ol className={styles.seriesList}>
                  {entry.series.map((series, seriesIndex) => (
                    <li key={series.key} className={styles.seriesRow}>
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
                            aria-invalid={fieldError(errors, `exercises[${index}].series[${seriesIndex}].${target}`) ? true : undefined}
                            aria-describedby={
                              fieldError(errors, `exercises[${index}].series[${seriesIndex}].${target}`)
                                ? `${prefix}-serie-${index}-${seriesIndex}-${target}-error`
                                : undefined
                            }
                            onChange={(event) =>
                              updateSeries(entry.key, series.key, (current) => ({
                                ...current,
                                [target]: event.target.value,
                              }))
                            }
                          />
                          {fieldError(errors, `exercises[${index}].series[${seriesIndex}].${target}`) && (
                            <span
                              id={`${prefix}-serie-${index}-${seriesIndex}-${target}-error`}
                              className={styles.fieldError}
                            >
                              {fieldError(errors, `exercises[${index}].series[${seriesIndex}].${target}`)}
                            </span>
                          )}
                        </label>
                      ))}
                      <button
                        type="button"
                        className={styles.removeSeries}
                        aria-label={`Quitar la Serie ${seriesIndex + 1} de ${entry.exercise?.name ?? "este Ejercicio"}`}
                        disabled={entry.series.length <= 1 || isCardio}
                        onClick={() => removeSeries(entry.key, series.key)}
                      >
                        Quitar serie
                      </button>
                    </li>
                  ))}
                </ol>
                {!isCardio && (
                  <button
                    type="button"
                    className={styles.addSeries}
                    onClick={() => addSeries(entry.key)}
                  >
                    Añadir serie
                  </button>
                )}
              </div>

              <div className={styles.exerciseActions}>
                <button
                  type="button"
                  className={styles.removeExercise}
                  aria-label={`Quitar ${entry.exercise?.name ?? "el Ejercicio"} de la Rutina`}
                  onClick={() => removeExercise(entry.key)}
                >
                  Quitar Ejercicio
                </button>
              </div>
            </article>
          );
        })}

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
            Añadir ejercicio
          </button>
        )}
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
