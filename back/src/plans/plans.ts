import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../db/open-database";
import {
  exercise,
  plan,
  planTraining,
  planTrainingExercise,
  planTrainingSeriesGoal,
  planWeek,
  routine,
  type RecordingMode,
} from "../db/schema";
import { allowedTargetFields, fieldKey, targetLimitMessage } from "../domain/series-goals";
import {
  resolveRoutineReferences,
  type RoutineExerciseDocument,
} from "../routines/routines";

export type PlanStatus = "borrador" | "activo" | "completado";

/** Entrada del cliente para una Serie prevista: los objetivos son opcionales e independientes. */
export type PlanSeriesGoalInput = {
  id?: string;
  carga?: number | null;
  repeticiones?: number | null;
  duracion?: number | null;
};

/** Entrada del cliente para una aparición de Ejercicio de un Entrenamiento específico. */
export type PlanSpecificExerciseInput = {
  id?: string;
  exerciseId: string;
  series: PlanSeriesGoalInput[];
};

/**
 * Entrada del cliente para un Entrenamiento planificado: ocupa un día de su
 * semana y usa una Rutina mediante referencia viva o un Entrenamiento
 * específico independiente. La semana se deduce del anidamiento en `weeks`.
 */
export type PlanTrainingInput = {
  id?: string;
  day: number;
  source: "rutina" | "especifico";
  routineId?: string | null;
  specific: PlanSpecificExerciseInput[];
};

/** Entrada del cliente para una semana: sus Entrenamientos planificados. */
export type PlanWeekInput = {
  id?: string;
  trainings: PlanTrainingInput[];
};

/** Agregado completo que el cliente envía al crear o sustituir un Plan. */
export type PlanInput = {
  name: string;
  weeks: PlanWeekInput[];
};

/** Contenido resuelto de un Entrenamiento planificado: la misma forma que la Rutina. */
export type PlanExerciseDocument = RoutineExerciseDocument;

export type PlanTrainingDocument = {
  id: string;
  day: number;
  source: "rutina" | "especifico";
  routineId: string | null;
  /** Rutina de la referencia viva, resuelta por el servidor aunque esté archivada. */
  routine: { id: string; name: string; archived: boolean } | null;
  /** Contenido actual de la Rutina o del Entrenamiento específico. */
  content: PlanExerciseDocument[];
};

export type PlanWeekDocument = {
  id: string;
  order: number;
  trainings: PlanTrainingDocument[];
};

export type PlanDocument = {
  id: string;
  name: string;
  status: PlanStatus;
  revision: number;
  weeks: PlanWeekDocument[];
  createdAt: string;
  updatedAt: string;
};

export type PlanWriteOutcome =
  | { ok: true; planId: string }
  | { ok: false; fields: Record<string, string[]> };

export type PlanReplaceOutcome =
  | { ok: true }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "stale-revision"; currentRevision: number }
  | { ok: false; reason: "validation"; fields: Record<string, string[]> };

export type PlanDeleteOutcome =
  | { ok: true }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "not-draft" };

/** Fila persistida de los hijos de un Plan. */
export type PlanWeekRow = typeof planWeek.$inferSelect;
export type PlanTrainingRow = typeof planTraining.$inferSelect;
export type PlanTrainingExerciseRow = typeof planTrainingExercise.$inferSelect;
export type PlanTrainingSeriesGoalRow = typeof planTrainingSeriesGoal.$inferSelect;

export function createOpaquePlanId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Valida el agregado de un Plan borrador contra el estado. Un Plan necesita
 * al menos una semana y un Entrenamiento planificado; cada Entrenamiento
 * ocupa un día concreto de su semana y usa una Rutina propia disponible
 * (referencia viva) o un contenido específico que respeta las Formas de
 * registro y los límites de dominio.
 */
export async function validatePlanInput(
  database: AppDatabase,
  { accountId, input }: { accountId: string; input: PlanInput },
): Promise<{ ok: true } | { ok: false; fields: Record<string, string[]> }> {
  const fields: Record<string, string[]> = {};
  const addError = (key: string, message: string) => {
    const existing = fields[key] ?? [];
    existing.push(message);
    fields[key] = existing;
  };

  if (input.weeks.length === 0) {
    addError("weeks", "Un Plan necesita al menos una semana.");
  }

  const trainings = input.weeks.flatMap((week, weekIndex) =>
    week.trainings.map((training, trainingIndex) => ({ training, weekIndex, trainingIndex })),
  );
  if (trainings.length === 0) {
    addError("weeks", "Un Plan necesita al menos un Entrenamiento planificado.");
  }

  // Referencias vivas a Rutinas: resueltas en una sola consulta por identidad.
  const routineIds = [
    ...new Set(
      trainings
        .filter(({ training }) => training.source === "rutina")
        .map(({ training }) => training.routineId)
        .filter((routineId): routineId is string => Boolean(routineId)),
    ),
  ];
  const routineRows =
    routineIds.length === 0
      ? []
      : await database
          .select()
          .from(routine)
          .where(and(inArray(routine.id, routineIds), eq(routine.accountId, accountId)))
          .all();
  const routineById = new Map(routineRows.map((row) => [row.id, row]));

  // Ejercicios del contenido específico: resueltos en una sola consulta.
  const exerciseIds = [
    ...new Set(
      trainings
        .filter(({ training }) => training.source === "especifico")
        .flatMap(({ training }) => training.specific.map((entry) => entry.exerciseId)),
    ),
  ];
  const exerciseRows =
    exerciseIds.length === 0
      ? []
      : await database.select().from(exercise).where(inArray(exercise.id, exerciseIds)).all();
  const exerciseById = new Map(exerciseRows.map((row) => [row.id, row]));

  input.weeks.forEach((week, weekIndex) => {
    const daysInWeek = new Set<number>();
    week.trainings.forEach((training, trainingIndex) => {
      const key = (...segments: Array<string | number>) =>
        fieldKey("weeks", weekIndex, "trainings", trainingIndex, ...segments);

      if (daysInWeek.has(training.day)) {
        addError(key("day"), "Un día de la semana solo puede contener un Entrenamiento.");
      }
      daysInWeek.add(training.day);

      if (training.source === "rutina") {
        const routineId = training.routineId ?? null;
        if (!routineId || routineId.trim().length === 0) {
          addError(key("routineId"), "Elige la Rutina que usará este Entrenamiento.");
        } else {
          const routineRow = routineById.get(routineId);
          if (!routineRow) {
            addError(key("routineId"), "La Rutina no existe o no pertenece a tu Cuenta.");
          } else if (routineRow.archived) {
            addError(key("routineId"), "La Rutina no está disponible para usos nuevos.");
          }
        }
        if (training.specific.length > 0) {
          addError(key("specific"), "Un Entrenamiento con Rutina no puede incluir contenido específico.");
        }
        return;
      }

      // source === "especifico"
      if (training.routineId && training.routineId.trim().length > 0) {
        addError(key("routineId"), "Un Entrenamiento específico no referencia una Rutina.");
      }
      if (training.specific.length === 0) {
        addError(key("specific"), "Un Entrenamiento específico necesita al menos un Ejercicio.");
      }
      validateSpecificContent(exerciseById, accountId, training.specific, key, addError);
    });
  });

  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true };
}

function validateSpecificContent(
  exerciseById: Map<string, typeof exercise.$inferSelect>,
  accountId: string,
  entries: PlanSpecificExerciseInput[],
  key: (...segments: Array<string | number>) => string,
  addError: (key: string, message: string) => void,
): void {
  entries.forEach((entry, index) => {
    const row = exerciseById.get(entry.exerciseId);
    const visible = row !== undefined && (row.accountId === null || row.accountId === accountId);
    if (!visible) {
      addError(
        key("specific", index, "exerciseId"),
        "El Ejercicio no existe o no pertenece a tu Cuenta.",
      );
      return;
    }
    const exerciseRow = row!;
    if (!exerciseRow.available) {
      addError(
        key("specific", index, "exerciseId"),
        "El Ejercicio no está disponible para usos nuevos.",
      );
      return;
    }

    const mode = exerciseRow.recordingMode as RecordingMode;
    const allowed = allowedTargetFields[mode];
    if (mode === "cardio_continuo" && entry.series.length !== 1) {
      addError(
        key("specific", index, "series"),
        "El cardio continuo admite exactamente una Serie por aparición.",
      );
    } else if (entry.series.length === 0) {
      addError(
        key("specific", index, "series"),
        "Cada Ejercicio necesita al menos una Serie prevista.",
      );
    }

    entry.series.forEach((seriesInput, seriesIndex) => {
      const targets: Array<["carga" | "repeticiones" | "duracion", number | null | undefined]> = [
        ["carga", seriesInput.carga],
        ["repeticiones", seriesInput.repeticiones],
        ["duracion", seriesInput.duracion],
      ];
      for (const [target, value] of targets) {
        if (value === null || value === undefined) {
          continue;
        }
        if (!allowed.includes(target)) {
          addError(
            key("specific", index, "series", seriesIndex, target),
            "Objetivo no admitido por la Forma de registro del Ejercicio.",
          );
          continue;
        }
        const limitMessage = targetLimitMessage(target, value);
        if (limitMessage) {
          addError(key("specific", index, "series", seriesIndex, target), limitMessage);
        }
      }
    });
  });
}

/**
 * Crea un Plan borrador privado de la Cuenta autenticada dentro de una
 * transacción: cabecera con revisión 1, semanas e hijos con identidad opaca
 * asignada por el servidor. La validación del agregado ocurre antes de
 * escribir.
 */
export async function createPlan(
  database: AppDatabase,
  {
    accountId,
    input,
    now,
  }: { accountId: string; input: PlanInput; now: Date },
): Promise<PlanWriteOutcome> {
  const validation = await validatePlanInput(database, { accountId, input });
  if (!validation.ok) {
    return { ok: false, fields: validation.fields };
  }

  const planId = createOpaquePlanId();
  await database.transaction(async (tx) => {
    await tx.insert(plan).values({
      id: planId,
      accountId,
      name: input.name,
      status: "borrador",
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });

    let weekPosition = 0;
    for (const week of input.weeks) {
      const weekId = createOpaquePlanId();
      await tx.insert(planWeek).values({
        id: weekId,
        planId,
        position: weekPosition++,
      });
      for (const training of week.trainings) {
        insertTraining(tx, {
          planId,
          weekId,
          training,
        });
      }
    }
  });

  return { ok: true, planId };
}

type PlanTx = AppDatabase;

function insertTraining(
  tx: PlanTx,
  {
    planId,
    weekId,
    training,
  }: { planId: string; weekId: string; training: PlanTrainingInput },
): void {
  const trainingId = createOpaquePlanId();
  tx.insert(planTraining)
    .values({
      id: trainingId,
      planId,
      weekId,
      day: training.day,
      source: training.source,
      routineId: training.source === "rutina" ? (training.routineId ?? null) : null,
    })
    .run();

  if (training.source !== "especifico") {
    return;
  }
  let exercisePosition = 0;
  for (const entry of training.specific) {
    const exerciseChildId = createOpaquePlanId();
    tx.insert(planTrainingExercise)
      .values({
        id: exerciseChildId,
        planTrainingId: trainingId,
        exerciseId: entry.exerciseId,
        position: exercisePosition++,
      })
      .run();

    let seriesPosition = 0;
    for (const seriesInput of entry.series) {
      tx.insert(planTrainingSeriesGoal)
        .values({
          id: createOpaquePlanId(),
          planTrainingExerciseId: exerciseChildId,
          position: seriesPosition++,
          carga: seriesInput.carga ?? null,
          repeticiones: seriesInput.repeticiones ?? null,
          duracion: seriesInput.duracion ?? null,
        })
        .run();
    }
  }
}

/**
 * Sustituye el agregado completo de un Plan propio dentro de una transacción.
 * Exige la revisión leída: una revisión obsoleta devuelve conflicto y no
 * mezcla ni sobrescribe cambios. Semanas, Entrenamientos, Ejercicios
 * específicos y Objetivos de serie existentes conservan su identidad y los
 * nuevos la reciben del servidor.
 */
export async function replacePlan(
  database: AppDatabase,
  {
    accountId,
    planId,
    input,
    revision,
    now,
  }: {
    accountId: string;
    planId: string;
    input: PlanInput;
    revision: number;
    now: Date;
  },
): Promise<PlanReplaceOutcome> {
  const validation = await validatePlanInput(database, { accountId, input });
  if (!validation.ok) {
    return { ok: false, reason: "validation" as const, fields: validation.fields };
  }

  // La sustitución es una transacción síncrona y atómica: lee la revisión
  // vigente dentro de la transacción, la compara con la enviada y escribe el
  // agregado completo en una sola sección sin ceder el bucle de eventos. El
  // callback debe ser síncrono: el driver bun-sqlite cierra la transacción en
  // el primer `await` del callback. Así, dos escrituras concurrentes con la
  // misma revisión se serializan: la segunda lee la revisión ya incrementada
  // y devuelve conflicto sin mezclar ni sobrescribir los hijos.
  let outcome: PlanReplaceOutcome = { ok: false, reason: "not-found" };
  await database.transaction((tx) => {
    const current = tx
      .select()
      .from(plan)
      .where(and(eq(plan.id, planId), eq(plan.accountId, accountId)))
      .get();
    if (!current) {
      outcome = { ok: false, reason: "not-found" };
      return;
    }
    if (current.revision !== revision) {
      outcome = { ok: false, reason: "stale-revision", currentRevision: current.revision };
      return;
    }

    // CAS de la cabecera dentro de la transacción: la actualización exige la
    // revisión esperada y no solo el identificador. Si otra escritura ganó
    // entre la lectura y esta actualización, no coincide y la sustitución se
    // abandona antes de tocar los hijos: no hay nada que deshacer.
    const updated = tx
      .update(plan)
      .set({ name: input.name, revision: current.revision + 1, updatedAt: now })
      .where(and(eq(plan.id, planId), eq(plan.revision, revision)))
      .returning()
      .get();
    if (!updated) {
      const fresh = tx
        .select()
        .from(plan)
        .where(and(eq(plan.id, planId), eq(plan.accountId, accountId)))
        .get();
      outcome = {
        ok: false,
        reason: "stale-revision",
        currentRevision: fresh?.revision ?? revision,
      };
      return;
    }

    // Hijos vigentes: semanas, Entrenamientos, Ejercicios específicos y
    // Objetivos de serie con su identidad, agrupados para la conservación.
    const currentWeeks = tx.select().from(planWeek).where(eq(planWeek.planId, planId)).all();
    const currentWeekIds = new Set(currentWeeks.map((week) => week.id));
    const currentTrainings = tx
      .select()
      .from(planTraining)
      .where(eq(planTraining.planId, planId))
      .all();
    const trainingsByWeekId = new Map<string, Set<string>>();
    for (const training of currentTrainings) {
      const existing = trainingsByWeekId.get(training.weekId) ?? new Set<string>();
      existing.add(training.id);
      trainingsByWeekId.set(training.weekId, existing);
    }
    const currentSpecific =
      currentTrainings.length === 0
        ? []
        : tx
            .select()
            .from(planTrainingExercise)
            .where(
              inArray(
                planTrainingExercise.planTrainingId,
                currentTrainings.map((training) => training.id),
              ),
            )
            .all();
    const exercisesByTrainingId = new Map<string, Set<string>>();
    for (const entry of currentSpecific) {
      const existing = exercisesByTrainingId.get(entry.planTrainingId) ?? new Set<string>();
      existing.add(entry.id);
      exercisesByTrainingId.set(entry.planTrainingId, existing);
    }
    const currentSeries =
      currentSpecific.length === 0
        ? []
        : tx
            .select()
            .from(planTrainingSeriesGoal)
            .where(
              inArray(
                planTrainingSeriesGoal.planTrainingExerciseId,
                currentSpecific.map((entry) => entry.id),
              ),
            )
            .all();
    const seriesByExerciseId = new Map<string, Set<string>>();
    for (const seriesGoal of currentSeries) {
      const existing = seriesByExerciseId.get(seriesGoal.planTrainingExerciseId) ?? new Set<string>();
      existing.add(seriesGoal.id);
      seriesByExerciseId.set(seriesGoal.planTrainingExerciseId, existing);
    }

    // La edición sustituye el agregado completo: se borran los hijos y se
    // reinsertan con las identidades conservadas de los existentes. Borrar
    // las semanas propaga el borrado en cascada a sus Entrenamientos.
    tx.delete(planWeek).where(eq(planWeek.planId, planId)).run();

    const usedWeekIds = new Set<string>();
    const usedTrainingIds = new Set<string>();
    const usedExerciseIds = new Set<string>();
    const usedSeriesIds = new Set<string>();
    let weekPosition = 0;
    for (const week of input.weeks) {
      let weekId = week.id ?? "";
      if (
        weekId.length === 0 ||
        !currentWeekIds.has(weekId) ||
        usedWeekIds.has(weekId)
      ) {
        weekId = createOpaquePlanId();
      }
      usedWeekIds.add(weekId);
      tx.insert(planWeek)
        .values({ id: weekId, planId, position: weekPosition++ })
        .run();

      const existingTrainings = trainingsByWeekId.get(weekId) ?? new Set<string>();
      for (const training of week.trainings) {
        let trainingId = training.id ?? "";
        if (
          trainingId.length === 0 ||
          !existingTrainings.has(trainingId) ||
          usedTrainingIds.has(trainingId)
        ) {
          trainingId = createOpaquePlanId();
        }
        usedTrainingIds.add(trainingId);
        tx.insert(planTraining)
          .values({
            id: trainingId,
            planId,
            weekId,
            day: training.day,
            source: training.source,
            routineId: training.source === "rutina" ? (training.routineId ?? null) : null,
          })
          .run();

        if (training.source !== "especifico") {
          continue;
        }
        const existingExercises = exercisesByTrainingId.get(trainingId) ?? new Set<string>();
        let exercisePosition = 0;
        for (const entry of training.specific) {
          let exerciseChildId = entry.id ?? "";
          if (
            exerciseChildId.length === 0 ||
            !existingExercises.has(exerciseChildId) ||
            usedExerciseIds.has(exerciseChildId)
          ) {
            exerciseChildId = createOpaquePlanId();
          }
          usedExerciseIds.add(exerciseChildId);
          tx.insert(planTrainingExercise)
            .values({
              id: exerciseChildId,
              planTrainingId: trainingId,
              exerciseId: entry.exerciseId,
              position: exercisePosition++,
            })
            .run();

          const existingSeries = seriesByExerciseId.get(exerciseChildId) ?? new Set<string>();
          let seriesPosition = 0;
          for (const seriesInput of entry.series) {
            let seriesGoalId = seriesInput.id ?? "";
            if (
              seriesGoalId.length === 0 ||
              !existingSeries.has(seriesGoalId) ||
              usedSeriesIds.has(seriesGoalId)
            ) {
              seriesGoalId = createOpaquePlanId();
            }
            usedSeriesIds.add(seriesGoalId);
            tx.insert(planTrainingSeriesGoal)
              .values({
                id: seriesGoalId,
                planTrainingExerciseId: exerciseChildId,
                position: seriesPosition++,
                carga: seriesInput.carga ?? null,
                repeticiones: seriesInput.repeticiones ?? null,
                duracion: seriesInput.duracion ?? null,
              })
              .run();
          }
        }
      }
    }

    outcome = { ok: true };
  });

  return outcome;
}

/**
 * Elimina por completo un Plan propio. Solo un borrador puede eliminarse en
 * el MVP: los Planes activos y completados conservan su estructura y
 * calendario. Eliminar el Plan no elimina las Rutinas ni Ejercicios que
 * referencia: las claves foráneas no propagan borrados a otras Cuentas.
 */
export async function deletePlan(
  database: AppDatabase,
  { accountId, planId }: { accountId: string; planId: string },
): Promise<PlanDeleteOutcome> {
  const current = await database
    .select({ id: plan.id, status: plan.status })
    .from(plan)
    .where(and(eq(plan.id, planId), eq(plan.accountId, accountId)))
    .get();
  if (!current) {
    return { ok: false, reason: "not-found" };
  }
  if (current.status !== "borrador") {
    return { ok: false, reason: "not-draft" };
  }
  await database
    .delete(plan)
    .where(and(eq(plan.id, planId), eq(plan.accountId, accountId)));
  return { ok: true };
}

type PlanFetched = {
  planRows: Array<typeof plan.$inferSelect>;
  weekRows: PlanWeekRow[];
  trainingRows: PlanTrainingRow[];
  specificRows: PlanTrainingExerciseRow[];
  seriesRows: PlanTrainingSeriesGoalRow[];
  exerciseRowsById: Map<string, typeof exercise.$inferSelect>;
  routineReferences: Map<string, { id: string; name: string; archived: boolean; exercises: RoutineExerciseDocument[] }>;
};

async function fetchPlanAggregates(
  database: AppDatabase,
  { accountId, planIds }: { accountId: string; planIds: string[] },
): Promise<PlanFetched> {
  const weekRows =
    planIds.length === 0
      ? []
      : await database
          .select()
          .from(planWeek)
          .where(inArray(planWeek.planId, planIds))
          .orderBy(asc(planWeek.position), asc(planWeek.id))
          .all();
  const trainingRows =
    planIds.length === 0
      ? []
      : await database
          .select()
          .from(planTraining)
          .where(inArray(planTraining.planId, planIds))
          .orderBy(asc(planTraining.day), asc(planTraining.id))
          .all();
  const specificRows =
    trainingRows.length === 0
      ? []
      : await database
          .select()
          .from(planTrainingExercise)
          .where(
            inArray(
              planTrainingExercise.planTrainingId,
              trainingRows.map((training) => training.id),
            ),
          )
          .orderBy(asc(planTrainingExercise.position), asc(planTrainingExercise.id))
          .all();
  const seriesRows =
    specificRows.length === 0
      ? []
      : await database
          .select()
          .from(planTrainingSeriesGoal)
          .where(
            inArray(
              planTrainingSeriesGoal.planTrainingExerciseId,
              specificRows.map((entry) => entry.id),
            ),
          )
          .orderBy(asc(planTrainingSeriesGoal.position), asc(planTrainingSeriesGoal.id))
          .all();

  const exerciseIds = [...new Set(specificRows.map((entry) => entry.exerciseId))];
  const exerciseRowsById = new Map<string, typeof exercise.$inferSelect>();
  if (exerciseIds.length > 0) {
    const rows = await database.select().from(exercise).where(inArray(exercise.id, exerciseIds)).all();
    for (const row of rows) {
      exerciseRowsById.set(row.id, row);
    }
  }

  const routineIds = [
    ...new Set(trainingRows.flatMap((training) => (training.source === "rutina" ? [training.routineId] : [])).filter((id): id is string => id !== null)),
  ];
  const routineReferences = await resolveRoutineReferences(database, { accountId, routineIds });

  return { planRows: [], weekRows, trainingRows, specificRows, seriesRows, exerciseRowsById, routineReferences };
}

function buildSpecificDocuments(fetched: PlanFetched): Map<string, RoutineExerciseDocument[]> {
  const seriesByExerciseId = new Map<string, PlanTrainingSeriesGoalRow[]>();
  for (const seriesGoal of fetched.seriesRows) {
    const existing = seriesByExerciseId.get(seriesGoal.planTrainingExerciseId) ?? [];
    existing.push(seriesGoal);
    seriesByExerciseId.set(seriesGoal.planTrainingExerciseId, existing);
  }

  const entriesByTrainingId = new Map<string, PlanTrainingExerciseRow[]>();
  for (const entry of fetched.specificRows) {
    const existing = entriesByTrainingId.get(entry.planTrainingId) ?? [];
    existing.push(entry);
    entriesByTrainingId.set(entry.planTrainingId, existing);
  }

  const contentByTrainingId = new Map<string, RoutineExerciseDocument[]>();
  for (const [trainingId, entries] of entriesByTrainingId) {
    entries.sort((a, b) => a.position - b.position);
    const documents = entries.map((entry, index) => {
      const exerciseRow = fetched.exerciseRowsById.get(entry.exerciseId);
      const series = (seriesByExerciseId.get(entry.id) ?? []).map((seriesGoal, seriesIndex) => ({
        id: seriesGoal.id,
        order: seriesIndex,
        carga: seriesGoal.carga,
        repeticiones: seriesGoal.repeticiones,
        duracion: seriesGoal.duracion,
      }));
      return {
        id: entry.id,
        exerciseId: entry.exerciseId,
        order: index,
        exercise: exerciseRow
          ? {
              id: exerciseRow.id,
              name: exerciseRow.name,
              recordingMode: exerciseRow.recordingMode as RecordingMode,
              available: exerciseRow.available,
              provenance: exerciseRow.accountId === null ? ("catalogo" as const) : ("personalizado" as const),
            }
          : {
              // Imposible con claves foráneas; la lectura nunca rompe el Plan.
              id: entry.exerciseId,
              name: "Ejercicio no disponible",
              recordingMode: "fuerza_con_carga" as RecordingMode,
              available: false,
              provenance: "catalogo" as const,
            },
        series,
      } satisfies RoutineExerciseDocument;
    });
    contentByTrainingId.set(trainingId, documents);
  }
  return contentByTrainingId;
}

function buildPlanDocuments(fetched: PlanFetched): PlanDocument[] {
  const trainingsByWeekId = new Map<string, PlanTrainingRow[]>();
  for (const training of fetched.trainingRows) {
    const existing = trainingsByWeekId.get(training.weekId) ?? [];
    existing.push(training);
    trainingsByWeekId.set(training.weekId, existing);
  }
  const weeksByPlanId = new Map<string, PlanWeekRow[]>();
  for (const week of fetched.weekRows) {
    const existing = weeksByPlanId.get(week.planId) ?? [];
    existing.push(week);
    weeksByPlanId.set(week.planId, existing);
  }
  const specificContent = buildSpecificDocuments(fetched);

  return fetched.planRows.map((planRow) => {
    const weeks = (weeksByPlanId.get(planRow.id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((week, index) => {
        const trainings = (trainingsByWeekId.get(week.id) ?? [])
          .sort((a, b) => a.day - b.day)
          .map((training) => {
            const routineReference =
              training.source === "rutina" && training.routineId
                ? fetched.routineReferences.get(training.routineId)
                : undefined;
            return {
              id: training.id,
              day: training.day,
              source: training.source as "rutina" | "especifico",
              routineId: training.source === "rutina" ? training.routineId : null,
              routine: routineReference
                ? { id: routineReference.id, name: routineReference.name, archived: routineReference.archived }
                : null,
              content:
                training.source === "rutina"
                  ? (routineReference?.exercises ?? [])
                  : (specificContent.get(training.id) ?? []),
            } satisfies PlanTrainingDocument;
          });
        return {
          id: week.id,
          order: index,
          trainings,
        } satisfies PlanWeekDocument;
      });

    return {
      id: planRow.id,
      name: planRow.name,
      status: planRow.status as PlanStatus,
      revision: planRow.revision,
      weeks,
      createdAt: planRow.createdAt.toISOString(),
      updatedAt: planRow.updatedAt.toISOString(),
    } satisfies PlanDocument;
  });
}

/** Documento canónico de un Plan propio, con su contenido completo. */
export async function getPlanDocument(
  database: AppDatabase,
  { accountId, planId }: { accountId: string; planId: string },
): Promise<PlanDocument | null> {
  const planRow = await database
    .select()
    .from(plan)
    .where(and(eq(plan.id, planId), eq(plan.accountId, accountId)))
    .get();
  if (!planRow) {
    return null;
  }
  const fetched = await fetchPlanAggregates(database, { accountId, planIds: [planRow.id] });
  return buildPlanDocuments({ ...fetched, planRows: [planRow] })[0] ?? null;
}

/** Listado completo de los Planes de la Cuenta: el agregado entero por Plan. */
export async function listPlanDocuments(
  database: AppDatabase,
  { accountId }: { accountId: string },
): Promise<PlanDocument[]> {
  const planRows = await database
    .select()
    .from(plan)
    .where(eq(plan.accountId, accountId))
    .orderBy(asc(plan.name), asc(plan.id))
    .all();
  if (planRows.length === 0) {
    return [];
  }
  const fetched = await fetchPlanAggregates(
    database,
    { accountId, planIds: planRows.map((row) => row.id) },
  );
  return buildPlanDocuments({ ...fetched, planRows });
}
