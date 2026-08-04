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
import { listRoutines, type RoutineItem } from "../../routines/api/routines-api";
import {
  createPlan,
  dayLabels,
  formatDomainDate,
  replacePlan,
  type PlanExerciseContent,
  type PlanInput,
  type PlanItem,
  type PlanRecordingMode,
  type PlanTraining,
} from "../api/plans-api";
import styles from "./PlanEditor.module.css";

type ResolvedExercise = {
  id: string;
  name: string;
  recordingMode: PlanRecordingMode;
  available: boolean;
  provenance: "catalogo" | "personalizado";
};

type ResolvedRoutine = {
  id: string;
  name: string;
  archived: boolean;
  content: PlanExerciseContent[];
};

type EditorSeries = {
  key: string;
  id?: string;
  carga: string;
  repeticiones: string;
  duracion: string;
};

type EditorExercise = {
  key: string;
  id?: string;
  exerciseId: string;
  exercise: ResolvedExercise | null;
  series: EditorSeries[];
};

type EditorTraining = {
  key: string;
  id?: string;
  weekKey: string;
  day: string;
  /** Fecha prevista y estado: solo existen en un Plan activo o completado. */
  plannedDate: string | null;
  status: "pendiente" | "omitido" | "realizado" | null;
  source: "rutina" | "especifico";
  routineId: string;
  routine: ResolvedRoutine | null;
  specific: EditorExercise[];
};

type EditorWeek = {
  key: string;
  id?: string;
  trainings: EditorTraining[];
};

type EditorErrors = Record<string, string[]>;

const targetLabels: Record<"carga" | "repeticiones" | "duracion", string> = {
  carga: "Carga (kg)",
  repeticiones: "Repeticiones",
  duracion: "Duración (seg)",
};

const allowedTargets: Record<PlanRecordingMode, Array<"carga" | "repeticiones" | "duracion">> = {
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

function emptyWeek(): EditorWeek {
  return { key: nextKey(), trainings: [] };
}

function toEditorSeries(series: PlanExerciseContent["series"][number]): EditorSeries {
  return {
    key: nextKey(),
    id: series.id,
    carga: series.carga === null ? "" : String(series.carga),
    repeticiones: series.repeticiones === null ? "" : String(series.repeticiones),
    duracion: series.duracion === null ? "" : String(series.duracion),
  };
}

/** Copia de un Ejercicio del contenido resuelto conservando su identidad (Entrenamiento específico existente). */
function toEditorExercise(entry: PlanExerciseContent): EditorExercise {
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

/**
 * Copia independiente del contenido de una Rutina al personalizar un día:
 * no conserva las identidades de la Rutina, de modo que el Entrenamiento
 * específico nace con identidades propias asignadas por el servidor.
 */
function copiedEditorExercise(entry: PlanExerciseContent): EditorExercise {
  return {
    key: nextKey(),
    exerciseId: entry.exerciseId,
    exercise: {
      id: entry.exercise.id,
      name: entry.exercise.name,
      recordingMode: entry.exercise.recordingMode,
      available: entry.exercise.available,
      provenance: entry.exercise.provenance,
    },
    series: entry.series.map((series) => ({
      key: nextKey(),
      carga: series.carga === null ? "" : String(series.carga),
      repeticiones: series.repeticiones === null ? "" : String(series.repeticiones),
      duracion: series.duracion === null ? "" : String(series.duracion),
    })),
  };
}

function toEditorTraining(training: PlanTraining, weekKey: string): EditorTraining {
  return {
    key: nextKey(),
    id: training.id,
    weekKey,
    day: String(training.day),
    plannedDate: training.plannedDate,
    status: training.status,
    source: training.source,
    routineId: training.source === "rutina" ? (training.routineId ?? "") : "",
    routine:
      training.source === "rutina" && training.routine
        ? {
            id: training.routine.id,
            name: training.routine.name,
            archived: training.routine.archived,
            content: training.content,
          }
        : null,
    specific: training.source === "especifico" ? training.content.map(toEditorExercise) : [],
  };
}

function toEditorWeek(week: PlanItem["weeks"][number]): EditorWeek {
  return {
    key: nextKey(),
    id: week.id,
    trainings: week.trainings.map((training) => toEditorTraining(training, week.id)),
  };
}

function routineToResolved(routine: RoutineItem): ResolvedRoutine {
  return {
    id: routine.id,
    name: routine.name,
    archived: routine.archived,
    content: routine.exercises as PlanExerciseContent[],
  };
}

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
function validateDraft(name: string, weeks: EditorWeek[]): EditorErrors {
  const errors: EditorErrors = {};
  const addError = (key: string, message: string) => {
    const existing = errors[key] ?? [];
    existing.push(message);
    errors[key] = existing;
  };

  if (name.trim().length === 0) {
    addError("name", "Escribe un nombre para el Plan.");
  }

  const trainingCount = weeks.reduce((total, week) => total + week.trainings.length, 0);
  if (weeks.length === 0) {
    addError("weeks", "Un Plan necesita al menos una semana.");
  }
  if (trainingCount === 0) {
    addError("weeks", "Un Plan necesita al menos un Entrenamiento planificado.");
  }

  weeks.forEach((week, weekIndex) => {
    const daysInWeek = new Set<string>();
    week.trainings.forEach((training, trainingIndex) => {
      const key = (...segments: Array<string | number>) =>
        `weeks[${weekIndex}].trainings[${trainingIndex}]` +
        segments
          .map((segment) => (typeof segment === "number" ? `[${segment}]` : `.${segment}`))
          .join("");

      if (daysInWeek.has(training.day)) {
        addError(key("day"), "Un día de la semana solo puede contener un Entrenamiento.");
      }
      daysInWeek.add(training.day);

      if (training.source === "rutina") {
        if (training.routineId.trim().length === 0) {
          addError(key("routineId"), "Elige la Rutina que usará este Entrenamiento.");
        }
        return;
      }

      if (training.specific.length === 0) {
        addError(key("specific"), "Un Entrenamiento específico necesita al menos un Ejercicio.");
      }
      training.specific.forEach((entry, entryIndex) => {
        const mode = entry.exercise?.recordingMode;
        if (!mode) {
          addError(key("specific", entryIndex, "exerciseId"), "Elige un Ejercicio para esta entrada.");
          return;
        }
        if (mode === "cardio_continuo" && entry.series.length !== 1) {
          addError(
            key("specific", entryIndex, "series"),
            "El cardio continuo admite exactamente una Serie por aparición.",
          );
        } else if (mode !== "cardio_continuo" && entry.series.length === 0) {
          addError(
            key("specific", entryIndex, "series"),
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
                key("specific", entryIndex, "series", seriesIndex, target),
                "Introduce un número válido.",
              );
              continue;
            }
            if (parsed === null) {
              continue;
            }
            if (!allowed.includes(target)) {
              addError(
                key("specific", entryIndex, "series", seriesIndex, target),
                "Objetivo no admitido por la Forma de registro del Ejercicio.",
              );
              continue;
            }
            const limit = targetError(target, parsed);
            if (limit) {
              addError(key("specific", entryIndex, "series", seriesIndex, target), limit);
            }
          }
        });
      });
    });
  });

  return errors;
}

function buildInput(name: string, weeks: EditorWeek[]): PlanInput {
  return {
    name: name.trim(),
    weeks: weeks.map((week) => ({
      id: week.id,
      trainings: week.trainings.map((training) => ({
        id: training.id,
        day: Number(training.day),
        source: training.source,
        routineId: training.source === "rutina" ? (training.routineId || null) : null,
        specific:
          training.source === "especifico"
            ? training.specific.map((entry) => ({
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
              }))
            : [],
      })),
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

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setQ(search.trim());
  };

  return (
    <div className={styles.pickerPanel} role="region" aria-label="Añadir Ejercicio al Entrenamiento">
      <form className={styles.pickerSearch} onSubmit={applySearch} role="search">
        <label className={styles.visuallyHidden} htmlFor="plan-picker-busqueda">
          Buscar Ejercicios disponibles
        </label>
        <input
          id="plan-picker-busqueda"
          className={styles.pickerInput}
          type="search"
          placeholder="Buscar por nombre (p. ej. «press»)"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className={styles.pickerButton} type="submit">
          Buscar
        </button>
      </form>

      {exercisesQuery.isPending && <p className={styles.pickerStatus}>Buscando Ejercicios…</p>}
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

type PlanEditorProps = {
  plan?: PlanItem | null;
  submitLabel: string;
  onSaved: (plan: PlanItem) => void;
  onCancel: () => void;
  /** La revisión enviada quedó obsoleta: el padre debe cargar la versión vigente. */
  onConflict?: () => void;
  /** Un Plan activo solo edita pendientes: pide al padre omitir un día. */
  onRequestOmit?: (training: { id: string; day: number; plannedDate: string | null }) => void;
  /** Pide al padre devolver a pendiente un día omitido de un Plan activo. */
  onRequestRestore?: (training: { id: string; day: number; plannedDate: string | null }) => void;
  /** Pide al padre iniciar una Sesión desde un Entrenamiento planificado pendiente. */
  onRequestStart?: (training: { id: string; day: number; plannedDate: string | null }) => void;
  /** El padre está iniciando una Sesión: deshabilita los botones de inicio. */
  startPending?: boolean;
};

export function PlanEditor({
  plan,
  submitLabel,
  onSaved,
  onCancel,
  onConflict,
  onRequestOmit,
  onRequestRestore,
  onRequestStart,
  startPending,
}: PlanEditorProps) {
  const [name, setName] = useState(plan?.name ?? "");
  const [weeks, setWeeks] = useState<EditorWeek[]>(() =>
    plan ? plan.weeks.map(toEditorWeek) : [emptyWeek()],
  );
  const [errors, setErrors] = useState<EditorErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [staleRevision, setStaleRevision] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pickerTraining, setPickerTraining] = useState<string | null>(null);

  const isEdit = plan !== undefined && plan !== null;
  const prefix = isEdit ? `plan-${plan!.id}` : "plan-nuevo";
  const isActive = plan?.status === "activo";

  const routinesQuery = useQuery({
    queryKey: ["routines"],
    queryFn: listRoutines,
    retry: false,
  });
  const availableRoutines = (routinesQuery.data?.items ?? []).filter((routine) => !routine.archived);

  const selectedExerciseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const week of weeks) {
      for (const training of week.trainings) {
        for (const entry of training.specific) {
          ids.add(entry.exerciseId);
        }
      }
    }
    return [...ids];
  }, [weeks]);

  const updateTraining = (key: string, update: (training: EditorTraining) => EditorTraining) => {
    setWeeks((previous) =>
      previous.map((week) => ({
        ...week,
        trainings: week.trainings.map((training) =>
          training.key === key ? update(training) : training,
        ),
      })),
    );
  };

  const addWeek = () => {
    setWeeks((previous) => [...previous, emptyWeek()]);
    setErrors({});
  };

  const removeWeek = (weekKey: string) => {
    setWeeks((previous) => {
      if (previous.length <= 1) {
        return previous;
      }
      return previous.filter((week) => week.key !== weekKey);
    });
    setErrors({});
  };

  const freeDayInWeek = (week: EditorWeek): number | null => {
    const used = new Set(week.trainings.map((training) => Number(training.day)));
    for (let day = 0; day <= 6; day += 1) {
      if (!used.has(day)) {
        return day;
      }
    }
    return null;
  };

  const addTraining = (weekKey: string) => {
    setWeeks((previous) =>
      previous.map((week) => {
        if (week.key !== weekKey) {
          return week;
        }
        const day = freeDayInWeek(week);
        if (day === null) {
          return week;
        }
        return {
          ...week,
          trainings: [
            ...week.trainings,
            {
              key: nextKey(),
              weekKey,
              day: String(day),
              plannedDate: null,
              status: "pendiente" as const,
              source: "rutina" as const,
              routineId: "",
              routine: null,
              specific: [],
            },
          ],
        };
      }),
    );
    setErrors({});
  };

  const removeTraining = (key: string) => {
    setWeeks((previous) =>
      previous.map((week) => ({
        ...week,
        trainings: week.trainings.filter((training) => training.key !== key),
      })),
    );
    setErrors({});
  };

  const moveTrainingToWeek = (trainingKey: string, targetWeekKey: string) => {
    setWeeks((previous) => {
      let moved: EditorTraining | undefined;
      const next = previous.map((week) => ({
        ...week,
        trainings: week.trainings.filter((training) => {
          if (training.key === trainingKey) {
            moved = training;
            return false;
          }
          return true;
        }),
      }));
      if (!moved) {
        return previous;
      }
      return next.map((week) =>
        week.key === targetWeekKey
          ? { ...week, trainings: [...week.trainings, { ...moved!, weekKey: targetWeekKey }] }
          : week,
      );
    });
    setErrors({});
  };

  const pickRoutine = (training: EditorTraining, routineId: string) => {
    const routine = availableRoutines.find((item) => item.id === routineId);
    updateTraining(training.key, (current) => ({
      ...current,
      routineId,
      routine: routine ? routineToResolved(routine) : current.routine,
    }));
    setErrors({});
  };

  const personalize = (training: EditorTraining) => {
    if (training.source !== "rutina" || !training.routine) {
      return;
    }
    const copiedContent = training.routine.content;
    updateTraining(training.key, (current) => ({
      ...current,
      source: "especifico",
      routineId: "",
      routine: null,
      specific: copiedContent.map(copiedEditorExercise),
    }));
    setErrors({});
  };

  const addSpecificExercise = (trainingKey: string, exercise: ExerciseItem) => {
    updateTraining(trainingKey, (training) => ({
      ...training,
      specific: [
        ...training.specific,
        {
          key: nextKey(),
          exerciseId: exercise.id,
          exercise: {
            id: exercise.id,
            name: exercise.name,
            recordingMode: exercise.recordingMode,
            available: exercise.available,
            provenance: exercise.provenance,
          },
          series: [emptySeries()],
        },
      ],
    }));
    setPickerTraining(null);
    setErrors({});
  };

  const removeSpecificExercise = (trainingKey: string, exerciseKey: string) => {
    updateTraining(trainingKey, (training) => ({
      ...training,
      specific: training.specific.filter((entry) => entry.key !== exerciseKey),
    }));
    setErrors({});
  };

  const moveSpecificExercise = (trainingKey: string, exerciseKey: string, direction: -1 | 1) => {
    updateTraining(trainingKey, (training) => {
      const index = training.specific.findIndex((entry) => entry.key === exerciseKey);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= training.specific.length) {
        return training;
      }
      const next = [...training.specific];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return { ...training, specific: next };
    });
  };

  const updateSpecificExercise = (
    trainingKey: string,
    exerciseKey: string,
    update: (entry: EditorExercise) => EditorExercise,
  ) => {
    updateTraining(trainingKey, (training) => ({
      ...training,
      specific: training.specific.map((entry) =>
        entry.key === exerciseKey ? update(entry) : entry,
      ),
    }));
  };

  const addSeries = (trainingKey: string, exerciseKey: string) => {
    updateSpecificExercise(trainingKey, exerciseKey, (entry) => ({
      ...entry,
      series: [...entry.series, emptySeries()],
    }));
  };

  const removeSeries = (trainingKey: string, exerciseKey: string, seriesKey: string) => {
    updateSpecificExercise(trainingKey, exerciseKey, (entry) => ({
      ...entry,
      series: entry.series.filter((series) => series.key !== seriesKey),
    }));
  };

  const reloadCurrent = () => {
    setStaleRevision(false);
    setServerError(null);
    onConflict?.();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateDraft(name, weeks);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      setServerError(null);
      return;
    }
    setErrors({});
    setServerError(null);
    setIsSaving(true);
    try {
      const input = buildInput(name, weeks);
      const result = isEdit
        ? await replacePlan(plan!.id, plan!.revision, input)
        : await createPlan(input);
      onSaved(result.plan);
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
        setServerError("No se pudo guardar el Plan. Inténtalo de nuevo.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const weekOptions = weeks.map((week, index) => (
    <option key={week.key} value={week.key}>
      Semana {index + 1}
    </option>
  ));

  const routineOptions = useMemo(() => {
    const referencedIds = new Set<string>();
    for (const week of weeks) {
      for (const training of week.trainings) {
        if (training.source === "rutina" && training.routineId) {
          referencedIds.add(training.routineId);
        }
      }
    }
    const options = availableRoutines.map((routine) => ({ id: routine.id, name: routine.name }));
    for (const id of referencedIds) {
      if (!options.some((option) => option.id === id)) {
        options.push({ id, name: "Rutina archivada" });
      }
    }
    return options;
  }, [availableRoutines, weeks]);

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <FormField
        label="Nombre del Plan"
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
          El Plan fue modificado por otra sesión. Tus cambios no se guardaron para no
          sobrescribir los ajenos.
          <button className={styles.conflictButton} type="button" onClick={reloadCurrent}>
            Cargar la versión actual
          </button>
        </p>
      )}

      <section className={styles.weeksSection} aria-labelledby={`${prefix}-semanas-titulo`}>
        <h2 id={`${prefix}-semanas-titulo`} className={styles.sectionHeading}>
          Semanas y Entrenamientos planificados
        </h2>
        {fieldError(errors, "weeks") && (
          <p className={styles.fieldError} role="alert">
            {fieldError(errors, "weeks")}
          </p>
        )}

        {weeks.map((week, weekIndex) => (
          <article key={week.key} className={styles.weekCard} aria-label={`Semana ${weekIndex + 1}`}>
            <div className={styles.weekHeader}>
              <h3 className={styles.weekTitle}>Semana {weekIndex + 1}</h3>
              {!isActive && (
                <button
                  type="button"
                  className={styles.removeWeek}
                  disabled={weeks.length <= 1}
                  onClick={() => removeWeek(week.key)}
                >
                  Quitar semana
                </button>
              )}
            </div>

            {week.trainings.length === 0 && (
              <p className={styles.emptyTrainings}>
                Esta semana todavía no tiene Entrenamientos planificados.
              </p>
            )}

            {week.trainings.map((training, trainingIndex) => {
              const isClosed =
                isActive &&
                (training.status === "omitido" || training.status === "realizado");
              // Identificador persistido del Entrenamiento pendiente: solo un
              // día pendiente con identidad puede iniciar una Sesión (una
              // entrada recién añadida sin guardar todavía no existe en el
              // servidor). Se captura en una constante para conservar el
              // estrechamiento dentro del manejador del botón.
              const startTrainingId =
                isActive &&
                onRequestStart !== undefined &&
                training.status === "pendiente"
                  ? training.id
                  : undefined;
              if (isClosed) {
                const plannedLabel =
                  training.plannedDate === null ? "" : formatDomainDate(training.plannedDate);
                const contentLabel =
                  training.source === "rutina"
                    ? (training.routine?.name ?? "Rutina")
                    : training.specific
                        .map((entry) => entry.exercise?.name ?? "Ejercicio")
                        .join(" · ");
                const realized = training.status === "realizado";
                return (
                  <article
                    key={training.key}
                    className={styles.closedTraining}
                    aria-label={`${dayLabels[Number(training.day)]} ${realized ? "realizado" : "omitido"}`}
                  >
                    <div className={styles.closedTrainingHeader}>
                      <div className={styles.closedTrainingDay}>
                        <span className={styles.closedDayLabel}>{dayLabels[Number(training.day)]}</span>
                        {plannedLabel !== "" && (
                          <span className={styles.closedDate}>Prevista · {plannedLabel}</span>
                        )}
                      </div>
                      <span className={styles.closedStatus}>
                        <span className={styles.statusDot} aria-hidden="true" />
                        {realized ? "Realizado" : "Omitido"}
                      </span>
                    </div>
                    <p className={styles.closedContent}>{contentLabel}</p>
                    {!realized && onRequestRestore && (
                      <button
                        type="button"
                        className={styles.restoreTraining}
                        onClick={() =>
                          onRequestRestore({
                            id: training.id ?? "",
                            day: Number(training.day),
                            plannedDate: training.plannedDate,
                          })
                        }
                      >
                        Devolver a pendiente
                      </button>
                    )}
                  </article>
                );
              }

              const trainingErrors = (keySuffix: Array<string | number>) =>
                fieldError(
                  errors,
                  `weeks[${weekIndex}].trainings[${trainingIndex}]${keySuffix
                    .map((segment) => (typeof segment === "number" ? `[${segment}]` : `.${segment}`))
                    .join("")}`,
                );
              const routineError = trainingErrors(["routineId"]);
              const specificError = trainingErrors(["specific"]);
              return (
                <article
                  key={training.key}
                  className={styles.trainingCard}
                  aria-label={`Entrenamiento ${trainingIndex + 1} de la semana ${weekIndex + 1}`}
                >
                  <div className={styles.trainingHeader}>
                    <div className={styles.trainingPlacement}>
                      <label className={styles.placementField}>
                        <span className={styles.placementLabel}>Día de la semana</span>
                        <select
                          className={styles.select}
                          value={training.day}
                          aria-label={`Día del Entrenamiento ${trainingIndex + 1}`}
                          onChange={(event) =>
                            updateTraining(training.key, (current) => ({
                              ...current,
                              day: event.target.value,
                            }))
                          }
                        >
                          {dayLabels.map((label, day) => (
                            <option key={day} value={String(day)}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.placementField}>
                        <span className={styles.placementLabel}>Semana</span>
                        <select
                          className={styles.select}
                          value={training.weekKey}
                          aria-label={`Semana del Entrenamiento ${trainingIndex + 1}`}
                          onChange={(event) => moveTrainingToWeek(training.key, event.target.value)}
                        >
                          {weekOptions}
                        </select>
                      </label>
                    </div>
                    <button
                      type="button"
                      className={styles.removeTraining}
                      aria-label={`Quitar el Entrenamiento ${trainingIndex + 1} de la semana ${weekIndex + 1}`}
                      onClick={() => removeTraining(training.key)}
                    >
                      Quitar entrenamiento
                    </button>
                  </div>

                  {isActive && training.plannedDate !== null && (
                    <p className={styles.pendingDate}>
                      Prevista · {formatDomainDate(training.plannedDate)}
                    </p>
                  )}

                  {isActive && (onRequestOmit || startTrainingId !== undefined) && (
                    <div className={styles.trainingActions}>
                      {onRequestStart && startTrainingId !== undefined && (
                        <button
                          type="button"
                          className={styles.startTraining}
                          disabled={startPending}
                          onClick={() =>
                            onRequestStart({
                              id: startTrainingId,
                              day: Number(training.day),
                              plannedDate: training.plannedDate,
                            })
                          }
                        >
                          {startPending ? "Iniciando…" : "Iniciar"}
                        </button>
                      )}
                      {onRequestOmit && (
                        <button
                          type="button"
                          className={styles.omitTraining}
                          onClick={() =>
                            onRequestOmit({
                              id: training.id ?? "",
                              day: Number(training.day),
                              plannedDate: training.plannedDate,
                            })
                          }
                        >
                          Omitir este día
                        </button>
                      )}
                    </div>
                  )}

                  <div className={styles.sourceToggle} role="group" aria-label="Contenido del Entrenamiento">
                    <label className={styles.sourceOption}>
                      <input
                        type="radio"
                        name={`${training.key}-source`}
                        checked={training.source === "rutina"}
                        onChange={() =>
                          updateTraining(training.key, (current) => ({
                            ...current,
                            source: "rutina",
                          }))
                        }
                      />
                      Usar Rutina
                    </label>
                    <label className={styles.sourceOption}>
                      <input
                        type="radio"
                        name={`${training.key}-source`}
                        checked={training.source === "especifico"}
                        onChange={() =>
                          updateTraining(training.key, (current) => ({
                            ...current,
                            source: "especifico",
                          }))
                        }
                      />
                      Entrenamiento específico
                    </label>
                  </div>

                  {training.source === "rutina" ? (
                    <div className={styles.routineBlock}>
                      <label className={styles.placementField}>
                        <span className={styles.placementLabel}>Rutina</span>
                        <select
                          className={styles.select}
                          value={training.routineId}
                          aria-label="Rutina"
                          onChange={(event) => pickRoutine(training, event.target.value)}
                        >
                          <option value="">Elige una Rutina…</option>
                          {routineOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {routineError && (
                        <p className={styles.fieldError} role="alert">
                          {routineError}
                        </p>
                      )}
                      {training.routine && (
                        <div className={styles.routinePreview}>
                          <p className={styles.routineName}>
                            {training.routine.name}
                            {training.routine.archived && (
                              <span className={styles.archivedNote}> · archivada</span>
                            )}
                          </p>
                          <p className={styles.routineContent}>
                            {training.routine.content
                              .map((entry) => `${entry.exercise.name} (${entry.series.length} Serie${entry.series.length === 1 ? "" : "s"})`)
                              .join(" · ")}
                          </p>
                          <button
                            type="button"
                            className={styles.personalize}
                            onClick={() => personalize(training)}
                          >
                            Personalizar solo este día
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={styles.specificBlock}>
                      {specificError && (
                        <p className={styles.fieldError} role="alert">
                          {specificError}
                        </p>
                      )}
                      {training.specific.length === 0 && (
                        <p className={styles.emptySpecific}>
                          Todavía no has añadido Ejercicios. Usa «Añadir ejercicio» para empezar.
                        </p>
                      )}
                      {training.specific.map((entry, entryIndex) => {
                        const mode = entry.exercise?.recordingMode as RecordingMode | undefined;
                        const isCardio = mode === "cardio_continuo";
                        const seriesError = trainingErrors(["specific", entryIndex, "series"]);
                        return (
                          <article
                            key={entry.key}
                            className={styles.specificExercise}
                            aria-label={entry.exercise?.name ?? "Ejercicio sin elegir"}
                          >
                            <div className={styles.specificExerciseHeader}>
                              <div>
                                <h4 className={styles.specificExerciseName}>
                                  {entry.exercise?.name ?? "Elige un Ejercicio"}
                                </h4>
                                {mode && <p className={styles.specificExerciseMeta}>{recordingModeLabels[mode]}</p>}
                              </div>
                              <div className={styles.specificExerciseOrder}>
                                <button
                                  type="button"
                                  aria-label={`Subir ${entry.exercise?.name ?? "el Ejercicio"}`}
                                  disabled={entryIndex === 0}
                                  onClick={() => moveSpecificExercise(training.key, entry.key, -1)}
                                >
                                  ↑
                                </button>
                                <span className={styles.orderBadge}>{entryIndex + 1}</span>
                                <button
                                  type="button"
                                  aria-label={`Bajar ${entry.exercise?.name ?? "el Ejercicio"}`}
                                  disabled={entryIndex === training.specific.length - 1}
                                  onClick={() => moveSpecificExercise(training.key, entry.key, 1)}
                                >
                                  ↓
                                </button>
                              </div>
                            </div>

                            {trainingErrors(["specific", entryIndex, "exerciseId"]) && (
                              <p className={styles.fieldError} role="alert">
                                {trainingErrors(["specific", entryIndex, "exerciseId"])}
                              </p>
                            )}

                            <h5 className={styles.seriesHeading}>
                              Series previstas
                              {isCardio && (
                                <span className={styles.cardioNote}> · cardio continuo: una Serie</span>
                              )}
                            </h5>
                            {seriesError && (
                              <p className={styles.fieldError} role="alert">
                                {seriesError}
                              </p>
                            )}
                            <ol className={styles.seriesList}>
                              {entry.series.map((series, seriesIndex) => (
                                <li key={series.key} className={styles.seriesRow}>
                                  <span className={styles.seriesNumber}>Serie {seriesIndex + 1}</span>
                                  {(mode ? allowedTargets[mode as PlanRecordingMode] : []).map((target) => (
                                    <label key={target} className={styles.seriesTarget}>
                                      <span className={styles.seriesTargetLabel}>{targetLabels[target]}</span>
                                      <input
                                        className={styles.input}
                                        type="number"
                                        inputMode="decimal"
                                        step={target === "carga" ? "0.01" : "1"}
                                        min={target === "carga" ? 0 : 1}
                                        value={series[target]}
                                        aria-invalid={
                                          trainingErrors(["specific", entryIndex, "series", seriesIndex, target])
                                            ? true
                                            : undefined
                                        }
                                        onChange={(event) =>
                                          updateSpecificExercise(training.key, entry.key, (current) => ({
                                            ...current,
                                            series: current.series.map((currentSeries) =>
                                              currentSeries.key === series.key
                                                ? { ...currentSeries, [target]: event.target.value }
                                                : currentSeries,
                                            ),
                                          }))
                                        }
                                      />
                                      {trainingErrors(["specific", entryIndex, "series", seriesIndex, target]) && (
                                        <span className={styles.fieldError}>
                                          {trainingErrors(["specific", entryIndex, "series", seriesIndex, target])}
                                        </span>
                                      )}
                                    </label>
                                  ))}
                                  <button
                                    type="button"
                                    className={styles.removeSeries}
                                    aria-label={`Quitar la Serie ${seriesIndex + 1} de ${entry.exercise?.name ?? "este Ejercicio"}`}
                                    disabled={entry.series.length <= 1 || isCardio}
                                    onClick={() => removeSeries(training.key, entry.key, series.key)}
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
                                onClick={() => addSeries(training.key, entry.key)}
                              >
                                Añadir serie
                              </button>
                            )}

                            <button
                              type="button"
                              className={styles.removeExercise}
                              aria-label={`Quitar ${entry.exercise?.name ?? "el Ejercicio"} del Entrenamiento`}
                              onClick={() => removeSpecificExercise(training.key, entry.key)}
                            >
                              Quitar Ejercicio
                            </button>
                          </article>
                        );
                      })}

                      {pickerTraining === training.key && (
                        <ExercisePicker
                          selectedExerciseIds={selectedExerciseIds}
                          onPick={(exercise) => addSpecificExercise(training.key, exercise)}
                          onClose={() => setPickerTraining(null)}
                        />
                      )}
                      {pickerTraining !== training.key && (
                        <button
                          type="button"
                          className={styles.addExercise}
                          onClick={() => setPickerTraining(training.key)}
                        >
                          Añadir ejercicio
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}

            <button
              type="button"
              className={styles.addTraining}
              disabled={week.trainings.length >= 7}
              onClick={() => addTraining(week.key)}
            >
              Añadir entrenamiento
            </button>
          </article>
        ))}

        {!isActive && (
          <button type="button" className={styles.addWeek} onClick={addWeek}>
            Añadir semana
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
        <button className={styles.cancel} type="button" onClick={onCancel} disabled={isSaving}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
