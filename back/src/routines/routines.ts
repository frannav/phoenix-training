import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../db/open-database";
import {
  exercise,
  routine,
  routineExercise,
  routineSeriesGoal,
  type RecordingMode,
} from "../db/schema";

/** Ejercicio persistido tal como vive en la tabla compartida del catálogo y de los personalizados. */
type ExerciseRow = typeof exercise.$inferSelect;

/**
 * Rutina tal como vive en la tabla de cabecera. Los hijos (Ejercicios de la
 * Rutina y Objetivos de serie) se conservan en sus propias tablas.
 */
export type RoutineRow = typeof routine.$inferSelect;
export type RoutineExerciseRow = typeof routineExercise.$inferSelect;
export type RoutineSeriesGoalRow = typeof routineSeriesGoal.$inferSelect;

/** Entrada del cliente para una Serie prevista: los objetivos son opcionales e independientes. */
export type RoutineSeriesGoalInput = {
  id?: string;
  carga?: number | null;
  repeticiones?: number | null;
  duracion?: number | null;
};

/** Entrada del cliente para una aparición de Ejercicio en la Rutina. */
export type RoutineExerciseInput = {
  id?: string;
  exerciseId: string;
  series: RoutineSeriesGoalInput[];
};

/** Agregado completo que el cliente envía al crear o sustituir una Rutina. */
export type RoutineInput = {
  name: string;
  exercises: RoutineExerciseInput[];
};

export type RoutineSeriesGoalDocument = {
  id: string;
  order: number;
  carga: number | null;
  repeticiones: number | null;
  duracion: number | null;
};

export type RoutineExerciseDocument = {
  id: string;
  exerciseId: string;
  order: number;
  /** Ejercicio resuelto por el servidor, aunque esté retirado o archivado. */
  exercise: {
    id: string;
    name: string;
    recordingMode: RecordingMode;
    available: boolean;
    provenance: "catalogo" | "personalizado";
  };
  series: RoutineSeriesGoalDocument[];
};

export type RoutineDocument = {
  id: string;
  name: string;
  revision: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  exercises: RoutineExerciseDocument[];
};

export type RoutineWriteOutcome =
  | { ok: true; routineId: string }
  | { ok: false; fields: Record<string, string[]> };

export type RoutineReplaceOutcome =
  | { ok: true }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "stale-revision"; currentRevision: number }
  | { ok: false; reason: "validation"; fields: Record<string, string[]> };

export type RoutineTransitionOutcome =
  | { ok: true }
  | { ok: false; reason: "not-found" };

/** Objetivos admitidos por cada Forma de registro (spec «Series y Formas de registro»). */
const allowedTargetFields: Record<RecordingMode, Array<"carga" | "repeticiones" | "duracion">> = {
  fuerza_con_carga: ["carga", "repeticiones"],
  repeticiones_sin_carga: ["repeticiones"],
  tiempo_por_serie: ["duracion"],
  cardio_continuo: ["duracion"],
};

export function createOpaqueRoutineId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Clave de campo con rutas de hijo legibles (`exercises[0].series[1].carga`):
 * el contrato que el servidor devuelve en `fields` y que el cliente usa para
 * mostrar los errores junto al campo afectado.
 */
export function routineFieldKey(...segments: Array<string | number>): string {
  let key = "";
  for (const segment of segments) {
    if (typeof segment === "number" || /^\d+$/.test(segment)) {
      key += `[${segment}]`;
    } else {
      key += key.length === 0 ? segment : `.${segment}`;
    }
  }
  return key;
}

/**
 * Límites de dominio de cada objetivo (spec «Series y Formas de registro»):
 * la carga admite de 0 a 9999,99 kg con dos decimales como máximo; las
 * repeticiones, enteros de 1 a 9999; la duración, enteros de 1 a 359999
 * segundos. Devuelve el mensaje cuando el valor no cumple su límite.
 */
function targetLimitMessage(target: "carga" | "repeticiones" | "duracion", value: number): string | null {
  switch (target) {
    case "carga":
      if (!Number.isFinite(value)) {
        return "La carga debe ser un número.";
      }
      if (value < 0 || value > 9999.99) {
        return "La carga admite de 0 a 9999,99 kg.";
      }
      if (Number(value.toFixed(2)) !== value) {
        return "La carga admite como máximo dos decimales.";
      }
      return null;
    case "repeticiones":
      if (!Number.isInteger(value) || value < 1 || value > 9999) {
        return "Las repeticiones admiten enteros de 1 a 9999.";
      }
      return null;
    case "duracion":
      if (!Number.isInteger(value) || value < 1 || value > 359999) {
        return "La duración admite enteros de 1 a 359999 segundos.";
      }
      return null;
  }
}

/**
 * Valida el agregado de una Rutina contra el estado: cada Ejercicio debe
 * existir y pertenecer a la Cuenta o al catálogo compartido, estar disponible
 * para usos nuevos, respetar la Forma de registro publicada (objetivos
 * admitidos y cardinalidad de Series) y cumplir los límites de dominio.
 */
export async function validateRoutineInput(
  database: AppDatabase,
  { accountId, input }: { accountId: string; input: RoutineInput },
): Promise<{ ok: true } | { ok: false; fields: Record<string, string[]> }> {
  const fields: Record<string, string[]> = {};
  const addError = (key: string, message: string) => {
    const existing = fields[key] ?? [];
    existing.push(message);
    fields[key] = existing;
  };

  const ids = [...new Set(input.exercises.map((entry) => entry.exerciseId))];
  const rows =
    ids.length === 0 ? [] : await database.select().from(exercise).where(inArray(exercise.id, ids)).all();
  const byId = new Map(rows.map((row) => [row.id, row]));

  input.exercises.forEach((entry, index) => {
    const row = byId.get(entry.exerciseId);
    const visible = row !== undefined && (row.accountId === null || row.accountId === accountId);
    if (!visible) {
      addError(
        routineFieldKey("exercises", index, "exerciseId"),
        "El Ejercicio no existe o no pertenece a tu Cuenta.",
      );
      return;
    }
    const exerciseRow = row!;
    if (!exerciseRow.available) {
      addError(
        routineFieldKey("exercises", index, "exerciseId"),
        "El Ejercicio no está disponible para usos nuevos.",
      );
      return;
    }

    const mode = exerciseRow.recordingMode as RecordingMode;
    const allowed = allowedTargetFields[mode];
    if (mode === "cardio_continuo" && entry.series.length !== 1) {
      addError(
        routineFieldKey("exercises", index, "series"),
        "El cardio continuo admite exactamente una Serie por aparición.",
      );
    } else if (entry.series.length === 0) {
      addError(
        routineFieldKey("exercises", index, "series"),
        "Cada Ejercicio necesita al menos una Serie prevista.",
      );
    }

    entry.series.forEach((seriesInput, seriesIndex) => {
      const entries: Array<[keyof RoutineSeriesGoalInput, number | null | undefined]> = [
        ["carga", seriesInput.carga],
        ["repeticiones", seriesInput.repeticiones],
        ["duracion", seriesInput.duracion],
      ];
      for (const [target, value] of entries) {
        if (value === null || value === undefined) {
          continue;
        }
        if (!allowed.includes(target as "carga" | "repeticiones" | "duracion")) {
          addError(
            routineFieldKey("exercises", index, "series", seriesIndex, target),
            "Objetivo no admitido por la Forma de registro del Ejercicio.",
          );
          continue;
        }
        const limitMessage = targetLimitMessage(target as "carga" | "repeticiones" | "duracion", value);
        if (limitMessage) {
          addError(routineFieldKey("exercises", index, "series", seriesIndex, target), limitMessage);
        }
      }
    });
  });

  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true };
}

/**
 * Crea una Rutina privada de la Cuenta autenticada dentro de una transacción:
 * cabecera con revisión 1 e hijos con identidad opaca asignada por el
 * servidor. La validación del agregado ocurre antes de escribir.
 */
export async function createRoutine(
  database: AppDatabase,
  {
    accountId,
    input,
    now,
  }: { accountId: string; input: RoutineInput; now: Date },
): Promise<RoutineWriteOutcome> {
  const validation = await validateRoutineInput(database, { accountId, input });
  if (!validation.ok) {
    return { ok: false, fields: validation.fields };
  }

  const routineId = createOpaqueRoutineId();
  await database.transaction(async (tx) => {
    await tx.insert(routine).values({
      id: routineId,
      accountId,
      name: input.name,
      revision: 1,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });

    let position = 0;
    for (const entry of input.exercises) {
      const exerciseChildId = createOpaqueRoutineId();
      await tx.insert(routineExercise).values({
        id: exerciseChildId,
        routineId,
        exerciseId: entry.exerciseId,
        position: position++,
      });

      let seriesPosition = 0;
      for (const seriesInput of entry.series) {
        await tx.insert(routineSeriesGoal).values({
          id: createOpaqueRoutineId(),
          routineExerciseId: exerciseChildId,
          position: seriesPosition++,
          carga: seriesInput.carga ?? null,
          repeticiones: seriesInput.repeticiones ?? null,
          duracion: seriesInput.duracion ?? null,
        });
      }
    }
  });

  return { ok: true, routineId };
}

/**
 * Sustituye el agregado completo de una Rutina propia dentro de una
 * transacción. Exige la revisión leída: una revisión obsoleta devuelve
 * conflicto y no mezcla ni sobrescribe cambios. Los hijos existentes
 * conservan su identidad y los nuevos la reciben del servidor.
 */
export async function replaceRoutine(
  database: AppDatabase,
  {
    accountId,
    routineId,
    input,
    revision,
    now,
  }: {
    accountId: string;
    routineId: string;
    input: RoutineInput;
    revision: number;
    now: Date;
  },
): Promise<RoutineReplaceOutcome> {
  const validation = await validateRoutineInput(database, { accountId, input });
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
  let outcome: RoutineReplaceOutcome = { ok: false, reason: "not-found" };
  await database.transaction((tx) => {
    const current = tx
      .select()
      .from(routine)
      .where(and(eq(routine.id, routineId), eq(routine.accountId, accountId)))
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
      .update(routine)
      .set({ name: input.name, revision: current.revision + 1, updatedAt: now })
      .where(and(eq(routine.id, routineId), eq(routine.revision, revision)))
      .returning()
      .get();
    if (!updated) {
      const fresh = tx
        .select()
        .from(routine)
        .where(and(eq(routine.id, routineId), eq(routine.accountId, accountId)))
        .get();
      outcome = {
        ok: false,
        reason: "stale-revision",
        currentRevision: fresh?.revision ?? revision,
      };
      return;
    }

    const currentExercises = tx
      .select()
      .from(routineExercise)
      .where(eq(routineExercise.routineId, routineId))
      .all();
    const currentExerciseById = new Map(currentExercises.map((entry) => [entry.id, entry]));
    const currentSeries =
      currentExercises.length === 0
        ? []
        : tx
            .select()
            .from(routineSeriesGoal)
            .where(
              inArray(
                routineSeriesGoal.routineExerciseId,
                currentExercises.map((entry) => entry.id),
              ),
            )
            .all();
    const seriesByExerciseId = new Map<string, Set<string>>();
    for (const seriesGoal of currentSeries) {
      const existing = seriesByExerciseId.get(seriesGoal.routineExerciseId) ?? new Set<string>();
      existing.add(seriesGoal.id);
      seriesByExerciseId.set(seriesGoal.routineExerciseId, existing);
    }

    // La edición sustituye el agregado completo: se borran los hijos y se
    // reinsertan con las identidades conservadas de los existentes.
    tx.delete(routineExercise).where(eq(routineExercise.routineId, routineId)).run();

    const usedExerciseIds = new Set<string>();
    const usedSeriesIds = new Set<string>();
    let position = 0;
    for (const entry of input.exercises) {
      let exerciseChildId = entry.id ?? "";
      if (
        exerciseChildId.length === 0 ||
        !currentExerciseById.has(exerciseChildId) ||
        usedExerciseIds.has(exerciseChildId)
      ) {
        exerciseChildId = createOpaqueRoutineId();
      }
      usedExerciseIds.add(exerciseChildId);
      tx.insert(routineExercise)
        .values({
          id: exerciseChildId,
          routineId,
          exerciseId: entry.exerciseId,
          position: position++,
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
          seriesGoalId = createOpaqueRoutineId();
        }
        usedSeriesIds.add(seriesGoalId);
        tx.insert(routineSeriesGoal)
          .values({
            id: seriesGoalId,
            routineExerciseId: exerciseChildId,
            position: seriesPosition++,
            carga: seriesInput.carga ?? null,
            repeticiones: seriesInput.repeticiones ?? null,
            duracion: seriesInput.duracion ?? null,
          })
          .run();
      }
    }

    outcome = { ok: true };
  });

  return outcome;
}

/**
 * Archiva o restaura una Rutina propia. Archivar la retira de los usos
 * nuevos sin cambiar su identidad ni su contenido; restaurar la recupera
 * para los usos nuevos. La transición es explícita e idempotente.
 */
export async function setRoutineArchived(
  database: AppDatabase,
  {
    accountId,
    routineId,
    archived,
    now,
  }: { accountId: string; routineId: string; archived: boolean; now: Date },
): Promise<RoutineTransitionOutcome> {
  const updated = await database
    .update(routine)
    .set({ archived, updatedAt: now })
    .where(and(eq(routine.id, routineId), eq(routine.accountId, accountId)))
    .returning()
    .get();
  return updated ? { ok: true } : { ok: false, reason: "not-found" };
}

type RoutineFetched = {
  routineRows: RoutineRow[];
  exerciseChildRows: RoutineExerciseRow[];
  seriesRows: RoutineSeriesGoalRow[];
  exerciseRowsById: Map<string, ExerciseRow>;
};

async function fetchRoutineAggregates(
  database: AppDatabase,
  routineIds: string[],
): Promise<RoutineFetched> {
  const exerciseChildRows =
    routineIds.length === 0
      ? []
      : await database
          .select()
          .from(routineExercise)
          .where(inArray(routineExercise.routineId, routineIds))
          .orderBy(asc(routineExercise.position))
          .all();
  const seriesRows =
    exerciseChildRows.length === 0
      ? []
      : await database
          .select()
          .from(routineSeriesGoal)
          .where(
            inArray(
              routineSeriesGoal.routineExerciseId,
              exerciseChildRows.map((entry) => entry.id),
            ),
          )
          .orderBy(asc(routineSeriesGoal.position), asc(routineSeriesGoal.id))
          .all();
  const exerciseIds = [...new Set(exerciseChildRows.map((entry) => entry.exerciseId))];
  const exerciseRowsById = new Map<string, ExerciseRow>();
  if (exerciseIds.length > 0) {
    const rows = await database.select().from(exercise).where(inArray(exercise.id, exerciseIds)).all();
    for (const row of rows) {
      exerciseRowsById.set(row.id, row);
    }
  }
  return { routineRows: [], exerciseChildRows, seriesRows, exerciseRowsById };
}

function buildDocuments(fetched: RoutineFetched): RoutineDocument[] {
  const seriesByExerciseId = new Map<string, RoutineSeriesGoalRow[]>();
  for (const seriesGoal of fetched.seriesRows) {
    const existing = seriesByExerciseId.get(seriesGoal.routineExerciseId) ?? [];
    existing.push(seriesGoal);
    seriesByExerciseId.set(seriesGoal.routineExerciseId, existing);
  }
  const exercisesByRoutineId = new Map<string, RoutineExerciseRow[]>();
  for (const entry of fetched.exerciseChildRows) {
    const existing = exercisesByRoutineId.get(entry.routineId) ?? [];
    existing.push(entry);
    exercisesByRoutineId.set(entry.routineId, existing);
  }

  return fetched.routineRows.map((routineRow) => {
    const children = exercisesByRoutineId.get(routineRow.id) ?? [];
    return {
      id: routineRow.id,
      name: routineRow.name,
      revision: routineRow.revision,
      archived: routineRow.archived,
      createdAt: routineRow.createdAt.toISOString(),
      updatedAt: routineRow.updatedAt.toISOString(),
      exercises: children.map((entry, index) => {
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
                // Imposible con claves foráneas; la lectura nunca rompe la Rutina.
                id: entry.exerciseId,
                name: "Ejercicio no disponible",
                recordingMode: "fuerza_con_carga" as RecordingMode,
                available: false,
                provenance: "catalogo" as const,
              },
          series,
        };
      }),
    };
  });
}

/** Documento canónico de una Rutina propia, con su contenido completo. */
export async function getRoutineDocument(
  database: AppDatabase,
  { accountId, routineId }: { accountId: string; routineId: string },
): Promise<RoutineDocument | null> {
  const routineRow = await database
    .select()
    .from(routine)
    .where(and(eq(routine.id, routineId), eq(routine.accountId, accountId)))
    .get();
  if (!routineRow) {
    return null;
  }
  const fetched = await fetchRoutineAggregates(database, [routineRow.id]);
  return buildDocuments({ ...fetched, routineRows: [routineRow] })[0] ?? null;
}

/** Listado completo de las Rutinas de la Cuenta: el agregado entero por Rutina. */
export async function listRoutineDocuments(
  database: AppDatabase,
  { accountId }: { accountId: string },
): Promise<RoutineDocument[]> {
  const routineRows = await database
    .select()
    .from(routine)
    .where(eq(routine.accountId, accountId))
    .orderBy(asc(routine.name), asc(routine.id))
    .all();
  if (routineRows.length === 0) {
    return [];
  }
  const fetched = await fetchRoutineAggregates(
    database,
    routineRows.map((row) => row.id),
  );
  return buildDocuments({ ...fetched, routineRows });
}
