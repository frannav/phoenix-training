import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { AppDatabase } from "../db/open-database";
import {
  exercise,
  planTraining,
  routine,
  trainingSession,
  trainingSessionExercise,
  trainingSessionSeries,
  type RecordingMode,
} from "../db/schema";
import { resolvePlanTrainingStartContent } from "../plans/plans";
import { resolveRoutineReferences } from "../routines/routines";

/**
 * Fila persistida de una Sesión, de cada aparición de Ejercicio y de cada
 * Serie, junto con el Ejercicio resuelto para presentarla sin consultas
 * adicionales.
 */
export type SessionRow = typeof trainingSession.$inferSelect;
export type SessionExerciseRow = typeof trainingSessionExercise.$inferSelect;
export type SessionSeriesRow = typeof trainingSessionSeries.$inferSelect;

type EnrichedOccurrence = SessionExerciseRow & {
  exercise: typeof exercise.$inferSelect;
  series: SessionSeriesRow[];
};

export type SessionAggregate = {
  session: SessionRow;
  exercises: EnrichedOccurrence[];
};

export type SeriesStatus = "pendiente" | "completada" | "omitida";

/** Estado de una Sesión: activa mientras se registra o finalizada como registro del Historial. */
export type SessionStatus = "activa" | "finalizada";

/** Origen de una Sesión: un Entrenamiento planificado, una Rutina o ninguno (libre). */
export type SessionOrigin = "libre" | "rutina" | "plan";

/** Magnitudes de una Serie: los tres campos de objetivo y resultado por Forma de registro. */
export type SeriesMagnitudes = {
  carga: number | null;
  repeticiones: number | null;
  duracion: number | null;
};

export type SeriesInput = {
  id?: string;
  status: SeriesStatus;
  goal: {
    carga?: number | null;
    repeticiones?: number | null;
    duracion?: number | null;
  } | null;
  result: {
    carga?: number | null;
    repeticiones?: number | null;
    duracion?: number | null;
  } | null;
  rpe?: number | null;
};

/**
 * Documento canónico de una Sesión tal como se entrega por la API. Contiene
 * la revisión entera del agregado y toda la información confirmada para
 * presentar y reanudar la Sesión sin consultas adicionales. La Sesión
 * conserva la referencia de su Origen de sesión y sus dos fechas por
 * separado: la Fecha realizada propia y la Fecha prevista del Entrenamiento
 * planificado de origen.
 */
export type SessionDocument = {
  id: string;
  revision: number;
  origin: SessionOrigin;
  status: SessionStatus;
  datePerformed: string;
  /** Fecha prevista del Entrenamiento planificado de origen; solo un origen «plan» la tiene. */
  plannedDate: string | null;
  /** Origen de sesión: Rutina desde la que se inició, o nulo. */
  routineId: string | null;
  /** Origen de sesión: Entrenamiento planificado desde el que se inició, o nulo. */
  planTrainingId: string | null;
  lastExerciseId: string | null;
  exercises: SessionExerciseDocument[];
  startedAt: string;
  updatedAt: string;
};

export type SessionSeriesDocument = {
  id: string;
  order: number;
  status: SeriesStatus;
  added: boolean;
  goal: SeriesMagnitudes;
  result: SeriesMagnitudes;
  rpe: number | null;
};

export type SessionExerciseDocument = {
  id: string;
  exerciseId: string;
  sortOrder: number;
  /** Aparición añadida durante la Sesión (`true`) o prevista del origen (`false`). */
  added: boolean;
  exercise: {
    id: string;
    name: string;
    recordingMode: RecordingMode;
    provenance: "catalogo" | "personalizado";
  };
  series: SessionSeriesDocument[];
};

export type SessionExerciseInput = {
  id?: string;
  exerciseId: string;
  series: SeriesInput[];
};

/** Entrada del cliente para iniciar una Sesión desde un origen (o libre). */
export type StartSessionInput =
  | { origin: "libre" }
  | { origin: "rutina"; routineId: string }
  | { origin: "plan"; planId: string; trainingId: string };

export type StartSessionOutcome =
  | { ok: true; session: SessionDocument }
  | { ok: false; reason: "active-exists"; sessionId: string }
  | { ok: false; reason: "routine-not-found" }
  | { ok: false; reason: "routine-not-available" }
  | { ok: false; reason: "plan-not-found" }
  | { ok: false; reason: "training-not-found" }
  | { ok: false; reason: "transition-impossible"; message: string };

export type ReplaceSessionOutcome =
  | { ok: true; session: SessionDocument }
  | {
      ok: false;
      reason:
        | "not-found"
        | "revision-conflict"
        | "invalid-exercises"
        | "unknown-child"
        | "validation";
      message?: string;
      fields?: Record<string, string[]>;
    };

export type FinalizeSessionOutcome =
  | { ok: true; session: SessionDocument }
  | {
      ok: false;
      reason: "not-found" | "revision-conflict" | "not-active" | "no-completed-series";
    };

export type DeleteSessionOutcome =
  | { ok: true }
  | { ok: false; reason: "not-found" | "revision-conflict" };

/** Filtros explícitos del Historial (spec «API y concurrencia»): origen y rango de Fecha realizada. */
export type SessionHistoryFilters = {
  origin?: string;
  from?: string;
  to?: string;
};

/**
 * Resumen de una Sesión finalizada para el listado del Historial: la Fecha
 * realizada, el Origen de sesión, la Fecha prevista cuando existe y los
 * recuentos que presentan el resumen sin abrir el detalle. El detalle se
 * consulta por identificador y conserva el documento canónico completo.
 */
export type SessionHistoryItem = {
  id: string;
  origin: SessionOrigin;
  datePerformed: string;
  plannedDate: string | null;
  startedAt: string;
  updatedAt: string;
  exerciseCount: number;
  completedSeries: number;
  omittedSeries: number;
};

export function createOpaqueSessionId(): string {
  return randomBytes(16).toString("hex");
}

/** Fecha de dominio `YYYY-MM-DD` a partir de un instante técnico. */
export function toDomainDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toSessionDocument(aggregate: SessionAggregate): SessionDocument {
  return {
    id: aggregate.session.id,
    revision: aggregate.session.revision,
    origin: aggregate.session.origin as SessionOrigin,
    status: aggregate.session.status as SessionStatus,
    datePerformed: aggregate.session.datePerformed,
    plannedDate: aggregate.session.plannedDate,
    routineId: aggregate.session.routineId,
    planTrainingId: aggregate.session.planTrainingId,
    lastExerciseId: aggregate.session.lastExerciseId,
    exercises: aggregate.exercises.map((occurrence) => ({
      id: occurrence.id,
      exerciseId: occurrence.exerciseId,
      sortOrder: occurrence.sortOrder,
      added: occurrence.added,
      exercise: {
        id: occurrence.exercise.id,
        name: occurrence.exercise.name,
        recordingMode: occurrence.exercise.recordingMode as RecordingMode,
        provenance: occurrence.exercise.accountId === null ? "catalogo" : "personalizado",
      },
      series: occurrence.series.map((seriesRow) => ({
        id: seriesRow.id,
        order: seriesRow.position,
        status: seriesRow.status as SeriesStatus,
        added: seriesRow.added,
        goal: {
          carga: seriesRow.goalCarga,
          repeticiones: seriesRow.goalRepeticiones,
          duracion: seriesRow.goalDuracion,
        },
        result: {
          carga: seriesRow.carga,
          repeticiones: seriesRow.repeticiones,
          duracion: seriesRow.duracion,
        },
        rpe: seriesRow.rpe,
      })),
    })),
    startedAt: aggregate.session.startedAt.toISOString(),
    updatedAt: aggregate.session.updatedAt.toISOString(),
  };
}

async function loadSessionAggregate(
  database: AppDatabase,
  { sessionId }: { sessionId: string },
): Promise<SessionAggregate | null> {
  const sessionRow = await database
    .select()
    .from(trainingSession)
    .where(eq(trainingSession.id, sessionId))
    .get();
  if (!sessionRow) {
    return null;
  }

  const rows = await database
    .select({ occurrence: trainingSessionExercise, exercise })
    .from(trainingSessionExercise)
    .innerJoin(exercise, eq(trainingSessionExercise.exerciseId, exercise.id))
    .where(eq(trainingSessionExercise.sessionId, sessionId))
    .orderBy(asc(trainingSessionExercise.sortOrder), asc(trainingSessionExercise.id))
    .all();

  const occurrenceIds = rows.map(({ occurrence }) => occurrence.id);
  const seriesRows =
    occurrenceIds.length === 0
      ? []
      : await database
          .select()
          .from(trainingSessionSeries)
          .where(inArray(trainingSessionSeries.sessionExerciseId, occurrenceIds))
          .orderBy(asc(trainingSessionSeries.position), asc(trainingSessionSeries.id))
          .all();
  const seriesByOccurrenceId = new Map<string, SessionSeriesRow[]>();
  for (const seriesRow of seriesRows) {
    const existing = seriesByOccurrenceId.get(seriesRow.sessionExerciseId) ?? [];
    existing.push(seriesRow);
    seriesByOccurrenceId.set(seriesRow.sessionExerciseId, existing);
  }

  return {
    session: sessionRow,
    exercises: rows.map(({ occurrence, exercise: exerciseRow }) => ({
      ...occurrence,
      exercise: exerciseRow,
      series: seriesByOccurrenceId.get(occurrence.id) ?? [],
    })),
  };
}

/**
 * Convierte el contenido vigente de un origen (Rutina o Entrenamiento
 * planificado) en apariciones previstas de la Sesión: los Ejercicios y sus
 * Series nacen como intención original — `added: false`, pendientes, con los
 * Objetivos copiados y sin Resultado ni RPE. La Sesión copia estos valores y
 * nunca vuelve a sincronizar con el origen.
 */
function previstaOccurrencesFromContent(
  content: Array<{
    exerciseId: string;
    series: Array<{ carga: number | null; repeticiones: number | null; duracion: number | null }>;
  }>,
): SessionExerciseInput[] {
  return content.map((entry) => ({
    exerciseId: entry.exerciseId,
    series: entry.series.map((series) => ({
      status: "pendiente",
      goal: {
        carga: series.carga,
        repeticiones: series.repeticiones,
        duracion: series.duracion,
      },
      result: null,
      rpe: null,
    })),
  }));
}

/**
 * Inicia una Sesión de la Cuenta autenticada desde un origen (Entrenamiento
 * planificado pendiente, Rutina) o libre. La comprobación de que no exista
 * otra Sesión activa ocurre en la misma transacción y el índice parcial de
 * unicidad la respalda en la base de datos: un segundo inicio devuelve el
 * identificador de la Sesión existente en lugar de crear otra.
 *
 * La Sesión conserva la referencia de su Origen de sesión y copia los
 * objetivos vigentes del origen en el instante del inicio (intención
 * original, `added: false`); los cambios posteriores de la Rutina o del Plan
 * nunca modifican lo copiado. Desde un Entrenamiento planificado conserva
 * además la Fecha prevista por separado de su Fecha realizada.
 */
export async function startSession(
  database: AppDatabase,
  {
    accountId,
    input,
    now,
  }: { accountId: string; input: StartSessionInput; now: Date },
): Promise<StartSessionOutcome> {
  return database.transaction(async (tx) => {
    const existing = await tx
      .select({ id: trainingSession.id })
      .from(trainingSession)
      .where(
        and(eq(trainingSession.accountId, accountId), eq(trainingSession.status, "activa")),
      )
      .get();
    if (existing) {
      return { ok: false, reason: "active-exists", sessionId: existing.id } as const;
    }

    // Origen y contenido copiado como intención original. La validación de
    // cada origen ocurre antes de escribir la Sesión.
    let origin: SessionOrigin = "libre";
    let routineId: string | null = null;
    let planTrainingId: string | null = null;
    let plannedDate: string | null = null;
    let occurrences: SessionExerciseInput[] = [];

    if (input.origin === "rutina") {
      const routineRow = await tx
        .select()
        .from(routine)
        .where(and(eq(routine.id, input.routineId), eq(routine.accountId, accountId)))
        .get();
      if (!routineRow) {
        return { ok: false, reason: "routine-not-found" } as const;
      }
      if (routineRow.archived) {
        return { ok: false, reason: "routine-not-available" } as const;
      }
      origin = "rutina";
      routineId = routineRow.id;
      const reference = (
        await resolveRoutineReferences(database, {
          accountId,
          routineIds: [routineRow.id],
        })
      ).get(routineRow.id);
      occurrences = previstaOccurrencesFromContent(
        (reference?.exercises ?? []).map((entry) => ({
          exerciseId: entry.exerciseId,
          series: entry.series.map((series) => ({
            carga: series.carga,
            repeticiones: series.repeticiones,
            duracion: series.duracion,
          })),
        })),
      );
    } else if (input.origin === "plan") {
      const planSource = await resolvePlanTrainingStartContent(database, {
        accountId,
        planId: input.planId,
        trainingId: input.trainingId,
      });
      if (!planSource.ok) {
        return planSource as StartSessionOutcome;
      }
      if (planSource.planStatus !== "activo") {
        return {
          ok: false,
          reason: "transition-impossible",
          message: "Solo un Entrenamiento de un Plan activo puede iniciar una Sesión.",
        } as const;
      }
      if (planSource.trainingStatus !== "pendiente") {
        return {
          ok: false,
          reason: "transition-impossible",
          message:
            "El Entrenamiento ya no está pendiente y no puede iniciar una nueva Sesión.",
        } as const;
      }
      origin = "plan";
      planTrainingId = planSource.trainingId;
      plannedDate = planSource.plannedDate;
      occurrences = previstaOccurrencesFromContent(planSource.content);
    }

    const row = {
      id: createOpaqueSessionId(),
      accountId,
      origin,
      status: "activa" as const,
      revision: 1,
      datePerformed: toDomainDate(now),
      plannedDate,
      routineId,
      planTrainingId,
      lastExerciseId: null,
      startedAt: now,
      updatedAt: now,
    };

    try {
      const inserted = await tx.insert(trainingSession).values(row).returning().get();
      for (let index = 0; index < occurrences.length; index += 1) {
        const occurrence = occurrences[index]!;
        const occurrenceId = createOpaqueSessionId();
        await tx.insert(trainingSessionExercise).values({
          id: occurrenceId,
          sessionId: inserted.id,
          exerciseId: occurrence.exerciseId,
          sortOrder: index,
          added: false,
          createdAt: now,
        });
        let seriesPosition = 0;
        for (const series of occurrence.series) {
          await tx.insert(trainingSessionSeries).values({
            id: createOpaqueSessionId(),
            sessionExerciseId: occurrenceId,
            status: series.status,
            position: seriesPosition++,
            added: false,
            goalCarga: series.goal?.carga ?? null,
            goalRepeticiones: series.goal?.repeticiones ?? null,
            goalDuracion: series.goal?.duracion ?? null,
            carga: null,
            repeticiones: null,
            duracion: null,
            rpe: null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      const aggregate = await loadSessionAggregate(database, { sessionId: inserted.id });
      return { ok: true, session: toSessionDocument(aggregate!) };
    } catch (error) {
      // Dos inicios concurrentes: el índice parcial de unicidad respalda la
      // transacción y el perdedor obtiene el mismo conflicto recuperable.
      if (String(error).includes("UNIQUE constraint failed")) {
        const winner = await tx
          .select({ id: trainingSession.id })
          .from(trainingSession)
          .where(
            and(eq(trainingSession.accountId, accountId), eq(trainingSession.status, "activa")),
          )
          .get();
        return {
          ok: false,
          reason: "active-exists",
          sessionId: winner?.id ?? row.id,
        } as const;
      }
      throw error;
    }
  });
}

/**
 * Sesión activa confirmada de la Cuenta autenticada, o ausencia inequívoca
 * (`null`). Nunca acepta un identificador de Cuenta del cliente: la propiedad
 * se deriva exclusivamente de la sesión de autenticación.
 */
export async function getActiveSession(
  database: AppDatabase,
  { accountId }: { accountId: string },
): Promise<SessionDocument | null> {
  const sessionRow = await database
    .select()
    .from(trainingSession)
    .where(
      and(eq(trainingSession.accountId, accountId), eq(trainingSession.status, "activa")),
    )
    .get();
  if (!sessionRow) {
    return null;
  }
  const aggregate = await loadSessionAggregate(database, { sessionId: sessionRow.id });
  return aggregate ? toSessionDocument(aggregate) : null;
}

/**
 * Resuelve una Sesión propia por identificador. Una Sesión ajena o
 * inexistente se comporta como ausente para quien la consulta.
 */
export async function getSessionForAccount(
  database: AppDatabase,
  { accountId, sessionId }: { accountId: string; sessionId: string },
): Promise<SessionDocument | null> {
  const sessionRow = await database
    .select()
    .from(trainingSession)
    .where(
      and(eq(trainingSession.id, sessionId), eq(trainingSession.accountId, accountId)),
    )
    .get();
  if (!sessionRow) {
    return null;
  }
  const aggregate = await loadSessionAggregate(database, { sessionId: sessionRow.id });
  return aggregate ? toSessionDocument(aggregate) : null;
}

/**
 * Lista el Historial de la Cuenta autenticada: solo Sesiones finalizadas,
 * ordenadas de la Fecha realizada más reciente a la más antigua (empate por
 * inicio e identificador para que el desplazamiento del cursor sea estable).
 * Aplica los filtros explícitos —origen y rango de Fecha realizada— y el
 * desplazamiento del cursor opaco; el límite máximo lo fija el límite HTTP
 * (50). El resumen de cada Sesión cuenta sus apariciones y Series sin abrir
 * el detalle, que se consulta por identificador.
 */
export async function listSessionHistory(
  database: AppDatabase,
  {
    accountId,
    filters,
    limit,
    offset,
  }: {
    accountId: string;
    filters: SessionHistoryFilters;
    limit: number;
    offset: number;
  },
): Promise<SessionHistoryItem[]> {
  const conditions = [
    eq(trainingSession.accountId, accountId),
    eq(trainingSession.status, "finalizada"),
  ];
  if (filters.origin !== undefined) {
    conditions.push(eq(trainingSession.origin, filters.origin));
  }
  if (filters.from !== undefined) {
    // Las fechas de dominio YYYY-MM-DD se comparan lexicográficamente.
    conditions.push(gte(trainingSession.datePerformed, filters.from));
  }
  if (filters.to !== undefined) {
    conditions.push(lte(trainingSession.datePerformed, filters.to));
  }

  const rows = await database
    .select()
    .from(trainingSession)
    .where(and(...conditions))
    .orderBy(
      desc(trainingSession.datePerformed),
      desc(trainingSession.startedAt),
      desc(trainingSession.id),
    )
    .limit(limit)
    .offset(offset)
    .all();

  if (rows.length === 0) {
    return [];
  }

  const sessionIds = rows.map((row) => row.id);
  const stats = await database
    .select({
      sessionId: trainingSessionExercise.sessionId,
      exerciseCount: sql<number>`COUNT(DISTINCT ${trainingSessionExercise.id})`,
      completedSeries: sql<number>`COALESCE(SUM(CASE WHEN ${trainingSessionSeries.status} = 'completada' THEN 1 ELSE 0 END), 0)`,
      omittedSeries: sql<number>`COALESCE(SUM(CASE WHEN ${trainingSessionSeries.status} = 'omitida' THEN 1 ELSE 0 END), 0)`,
    })
    .from(trainingSessionExercise)
    .leftJoin(
      trainingSessionSeries,
      eq(trainingSessionSeries.sessionExerciseId, trainingSessionExercise.id),
    )
    .where(inArray(trainingSessionExercise.sessionId, sessionIds))
    .groupBy(trainingSessionExercise.sessionId)
    .all();
  const statsBySessionId = new Map(stats.map((entry) => [entry.sessionId, entry]));

  return rows.map((row) => {
    const stat = statsBySessionId.get(row.id);
    return {
      id: row.id,
      origin: row.origin as SessionOrigin,
      datePerformed: row.datePerformed,
      plannedDate: row.plannedDate,
      startedAt: row.startedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      exerciseCount: stat?.exerciseCount ?? 0,
      completedSeries: stat?.completedSeries ?? 0,
      omittedSeries: stat?.omittedSeries ?? 0,
    };
  });
}

/**
 * Campos de objetivo y de resultado admitidos por cada Forma de registro
 * (spec «Series y Formas de registro»): los mismos campos que una Serie
 * completada exige y que una Serie pendiente u omitida conserva como
 * objetivos opcionales.
 */
const seriesFieldsPerMode: Record<RecordingMode, Array<"carga" | "repeticiones" | "duracion">> = {
  fuerza_con_carga: ["carga", "repeticiones"],
  repeticiones_sin_carga: ["repeticiones"],
  tiempo_por_serie: ["duracion"],
  cardio_continuo: ["duracion"],
};

const seriesMagnitudeNames = ["carga", "repeticiones", "duracion"] as const;

/**
 * Clave de campo con rutas de hijo legibles (`exercises[0].series[1].carga`):
 * el contrato que el servidor devuelve en `fields` y que el cliente usa para
 * mostrar los errores junto al campo afectado.
 */
export function sessionFieldKey(...segments: Array<string | number>): string {
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
 * Límites de dominio de cada magnitud (spec «Series y Formas de registro»):
 * la carga admite de 0 a 9999,99 kg con dos decimales como máximo; las
 * repeticiones, enteros de 1 a 9999; la duración, enteros de 1 a 359999
 * segundos. Devuelve el mensaje cuando el valor no cumple su límite.
 */
function seriesLimitMessage(target: "carga" | "repeticiones" | "duracion", value: number): string | null {
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

/** Mensaje del campo obligatorio al completar la Serie según su Forma de registro. */
const requiredResultMessages: Record<"carga" | "repeticiones" | "duracion", string> = {
  carga: "La carga es obligatoria para completar la Serie.",
  repeticiones: "Las repeticiones son obligatorias para completar la Serie.",
  duracion: "La duración es obligatoria para completar la Serie.",
};

/**
 * Límites del RPE opcional de una Serie completada: de 1 a 10 en pasos de
 * 0,5. Los valores inválidos se rechazan sin redondear ni corregir.
 */
function rpeLimitMessage(value: number): string | null {
  if (!Number.isFinite(value)) {
    return "El RPE debe ser un número.";
  }
  if (value < 1 || value > 10) {
    return "El RPE admite de 1 a 10.";
  }
  if (!Number.isInteger(value * 2)) {
    return "El RPE admite pasos de 0,5.";
  }
  return null;
}

/**
 * Valida una Serie contra su Forma de registro y su estado: una Serie
 * completada exige atómicamente todos los valores de su Forma y puede tener
 * RPE; una pendiente u omitida no admite resultado ni RPE; los objetivos son
 * opcionales e independientes y respetan los mismos límites.
 */
function validateSeriesInput(
  addError: (key: string, message: string) => void,
  baseKey: string,
  mode: RecordingMode,
  series: SeriesInput,
): void {
  const allowed = seriesFieldsPerMode[mode];

  if (series.status === "completada") {
    for (const field of allowed) {
      const value = series.result?.[field];
      if (value === null || value === undefined) {
        addError(`${baseKey}.${field}`, requiredResultMessages[field]);
        continue;
      }
      const limitMessage = seriesLimitMessage(field, value);
      if (limitMessage) {
        addError(`${baseKey}.${field}`, limitMessage);
      }
    }
    for (const field of seriesMagnitudeNames) {
      if (!allowed.includes(field) && series.result?.[field] !== null && series.result?.[field] !== undefined) {
        addError(
          `${baseKey}.${field}`,
          "Magnitud no admitida por la Forma de registro del Ejercicio.",
        );
      }
    }
    if (series.rpe !== null && series.rpe !== undefined) {
      const rpeMessage = rpeLimitMessage(series.rpe);
      if (rpeMessage) {
        addError(`${baseKey}.rpe`, rpeMessage);
      }
    }
  } else {
    for (const field of seriesMagnitudeNames) {
      if (series.result?.[field] !== null && series.result?.[field] !== undefined) {
        addError(
          `${baseKey}.${field}`,
          "Una Serie pendiente u omitida no admite Resultado de serie.",
        );
      }
    }
    if (series.rpe !== null && series.rpe !== undefined) {
      addError(`${baseKey}.rpe`, "El RPE solo existe en una Serie completada.");
    }
  }

  for (const field of seriesMagnitudeNames) {
    const value = series.goal?.[field];
    if (value === null || value === undefined) {
      continue;
    }
    if (!allowed.includes(field)) {
      addError(
        `${baseKey}.${field}`,
        "Objetivo no admitido por la Forma de registro del Ejercicio.",
      );
      continue;
    }
    const limitMessage = seriesLimitMessage(field, value);
    if (limitMessage) {
      addError(`${baseKey}.${field}`, limitMessage);
    }
  }
}

/**
 * Sustituye el agregado completo de una Sesión activa propia en una sola
 * transacción: conserva los identificadores de las apariciones y de las
 * Series existentes, asigna identificadores opacos a los nuevos y registra
 * como último Ejercicio confirmado el de la última aparición. Una revisión
 * obsoleta produce un conflicto recuperable sin mezclar ni duplicar hijos.
 *
 * La transición es una transacción síncrona y atómica: valida primero el
 * agregado entero (Forma de registro, límites, estados y cardinalidad de
 * cardio continuo) y solo después escribe, de modo que ninguna entrada
 * inválida persiste ni incrementa la revisión.
 */
export async function replaceSession(
  database: AppDatabase,
  {
    accountId,
    sessionId,
    expectedRevision,
    datePerformed,
    exercises,
    now,
  }: {
    accountId: string;
    sessionId: string;
    expectedRevision: number;
    /** Fecha realizada corregida (YYYY-MM-DD); sin valor conserva la vigente. */
    datePerformed?: string;
    exercises: SessionExerciseInput[];
    now: Date;
  },
): Promise<ReplaceSessionOutcome> {
  let outcome: ReplaceSessionOutcome = { ok: false, reason: "not-found" };
  let succeeded = false;

  await database.transaction((tx) => {
    const sessionRow = tx
      .select()
      .from(trainingSession)
      .where(and(eq(trainingSession.id, sessionId), eq(trainingSession.accountId, accountId)))
      .get();
    if (!sessionRow) {
      outcome = { ok: false, reason: "not-found" };
      return;
    }
    if (sessionRow.revision !== expectedRevision) {
      outcome = { ok: false, reason: "revision-conflict" };
      return;
    }
    // Una Sesión finalizada se corrige con las invariantes del Historial: sin
    // Series pendientes y con al menos una Serie completada (spec «Sesiones
    // de entrenamiento»). La sustitución nunca cambia el estado ni el Origen.
    const finalized = sessionRow.status === "finalizada";

    const currentOccurrences = tx
      .select()
      .from(trainingSessionExercise)
      .where(eq(trainingSessionExercise.sessionId, sessionId))
      .all();
    const currentOccurrenceById = new Map(currentOccurrences.map((entry) => [entry.id, entry]));
    const currentSeries =
      currentOccurrences.length === 0
        ? []
        : tx
            .select()
            .from(trainingSessionSeries)
            .where(
              inArray(
                trainingSessionSeries.sessionExerciseId,
                currentOccurrences.map((entry) => entry.id),
              ),
            )
            .all();
    const seriesByOccurrenceId = new Map<string, Map<string, SessionSeriesRow>>();
    for (const seriesRow of currentSeries) {
      const existing = seriesByOccurrenceId.get(seriesRow.sessionExerciseId) ?? new Map();
      existing.set(seriesRow.id, seriesRow);
      seriesByOccurrenceId.set(seriesRow.sessionExerciseId, existing);
    }

    // Resuelve el Ejercicio de cada aparición —las existentes conservan el
    // suyo aunque ya no esté disponible— para validar la Forma de registro.
    const allExerciseIds = [
      ...new Set([
        ...currentOccurrences.map((entry) => entry.exerciseId),
        ...exercises.filter((entry) => entry.id === undefined).map((entry) => entry.exerciseId),
      ]),
    ];
    const exerciseRowsById = new Map<string, typeof exercise.$inferSelect>();
    if (allExerciseIds.length > 0) {
      for (const row of tx.select().from(exercise).where(inArray(exercise.id, allExerciseIds)).all()) {
        exerciseRowsById.set(row.id, row);
      }
    }

    const fields: Record<string, string[]> = {};
    const addError = (key: string, message: string) => {
      const existing = fields[key] ?? [];
      existing.push(message);
      fields[key] = existing;
    };

    const usedOccurrenceIds = new Set<string>();
    const nextOccurrences: (typeof trainingSessionExercise.$inferInsert)[] = [];
    const nextSeries: (typeof trainingSessionSeries.$inferInsert)[] = [];

    let failed: ReplaceSessionOutcome | null = null;

    outer: for (let index = 0; index < exercises.length; index += 1) {
      const input = exercises[index]!;
      let occurrenceId: string;
      let mode: RecordingMode;
      let occurrenceAdded = true;

      if (input.id !== undefined) {
        const existing = currentOccurrenceById.get(input.id);
        if (!existing || usedOccurrenceIds.has(input.id)) {
          failed = { ok: false, reason: "unknown-child" };
          break;
        }
        usedOccurrenceIds.add(input.id);
        occurrenceId = existing.id;
        occurrenceAdded = existing.added;
        mode = (exerciseRowsById.get(existing.exerciseId)?.recordingMode ?? "fuerza_con_carga") as RecordingMode;
        nextOccurrences.push({
          id: existing.id,
          sessionId,
          exerciseId: existing.exerciseId,
          sortOrder: index,
          added: existing.added,
          createdAt: existing.createdAt,
        });
      } else {
        const row = exerciseRowsById.get(input.exerciseId);
        const visible =
          row !== undefined &&
          row.available &&
          (row.accountId === null || row.accountId === accountId);
        if (!visible) {
          addError(
            sessionFieldKey("exercises", index, "exerciseId"),
            "El Ejercicio no está disponible para tu Cuenta.",
          );
          continue;
        }
        occurrenceId = createOpaqueSessionId();
        mode = row!.recordingMode as RecordingMode;
        nextOccurrences.push({
          id: occurrenceId,
          sessionId,
          exerciseId: input.exerciseId,
          sortOrder: index,
          added: true,
          createdAt: now,
        });
      }

      if (mode === "cardio_continuo" && input.series.length !== 1) {
        addError(
          sessionFieldKey("exercises", index, "series"),
          "El cardio continuo admite exactamente una Serie por aparición del Ejercicio.",
        );
      }

      const existingSeries = seriesByOccurrenceId.get(occurrenceId) ?? new Map<string, SessionSeriesRow>();
      const usedSeriesIds = new Set<string>();

      for (let seriesIndex = 0; seriesIndex < input.series.length; seriesIndex += 1) {
        const seriesInput = input.series[seriesIndex]!;
        const baseKey = sessionFieldKey("exercises", index, "series", seriesIndex);
        validateSeriesInput(addError, baseKey, mode, seriesInput);
        // Invariante del Historial: una Sesión finalizada nunca admite Series
        // pendientes; una Serie solo se corrige entre completada y omitida.
        if (finalized && seriesInput.status === "pendiente") {
          addError(
            sessionFieldKey("exercises", index, "series", seriesIndex, "status"),
            "Una Sesión finalizada no admite Series pendientes.",
          );
        }

        let seriesId: string;
        let added: boolean;
        let createdAt: Date;
        if (seriesInput.id !== undefined) {
          const existing = existingSeries.get(seriesInput.id);
          if (!existing || usedSeriesIds.has(seriesInput.id)) {
            failed = { ok: false, reason: "unknown-child" };
            break outer;
          }
          usedSeriesIds.add(seriesInput.id);
          seriesId = existing.id;
          added = existing.added;
          createdAt = existing.createdAt;
        } else {
          seriesId = createOpaqueSessionId();
          added = true;
          createdAt = now;
        }

        nextSeries.push({
          id: seriesId,
          sessionExerciseId: occurrenceId,
          status: seriesInput.status,
          position: seriesIndex,
          added,
          goalCarga: seriesInput.goal?.carga ?? null,
          goalRepeticiones: seriesInput.goal?.repeticiones ?? null,
          goalDuracion: seriesInput.goal?.duracion ?? null,
          carga: seriesInput.result?.carga ?? null,
          repeticiones: seriesInput.result?.repeticiones ?? null,
          duracion: seriesInput.result?.duracion ?? null,
          rpe: seriesInput.rpe ?? null,
          createdAt,
          updatedAt: now,
        });
      }

      // Conservación de la intención original: las Series previstas de un
      // Ejercicio del origen no se eliminan individualmente; se resuelven
      // mediante omisión. Las Series añadidas conservan las reglas de la
      // Sesión libre (pueden eliminarse).
      if (!failed && !occurrenceAdded) {
        for (const [seriesId, seriesRow] of existingSeries) {
          if (!seriesRow.added && !usedSeriesIds.has(seriesId)) {
            addError(
              sessionFieldKey("exercises", index, "series"),
              "Las Series previstas no pueden eliminarse; omítelas en su lugar.",
            );
          }
        }
      }
    }

    // Conservación de la intención original: un Ejercicio procedente del
    // origen no se elimina de la Sesión; sus Series previstas se resuelven
    // mediante omisión.
    if (!failed) {
      for (const current of currentOccurrences) {
        if (current.added || usedOccurrenceIds.has(current.id)) {
          continue;
        }
        failed = {
          ok: false,
          reason: "validation",
          fields: {
            exercises: ["Los Ejercicios del origen no pueden eliminarse de la Sesión."],
          },
        };
        break;
      }
    }

    // Invariante del Historial: una Sesión finalizada no puede quedar sin al
    // menos una Serie completada (spec «Sesiones de entrenamiento»).
    if (!failed && finalized) {
      const hasCompleted = nextSeries.some((series) => series.status === "completada");
      if (!hasCompleted) {
        addError("exercises", "Una Sesión finalizada necesita al menos una Serie completada.");
      }
    }

    if (failed) {
      outcome = failed;
      return;
    }
    if (Object.keys(fields).length > 0) {
      outcome = { ok: false, reason: "validation", fields };
      return;
    }

    // CAS de la cabecera dentro de la transacción: la actualización exige la
    // revisión esperada y no solo el identificador. Si otra escritura ganó
    // entre la lectura y esta actualización, no coincide y la sustitución se
    // abandona antes de tocar los hijos: no hay nada que deshacer.
    const lastExerciseId = nextOccurrences.length > 0 ? nextOccurrences[nextOccurrences.length - 1]!.exerciseId : null;
    const updated = tx
      .update(trainingSession)
      .set({
        revision: sessionRow.revision + 1,
        lastExerciseId,
        updatedAt: now,
        ...(datePerformed === undefined ? {} : { datePerformed }),
      })
      .where(and(eq(trainingSession.id, sessionId), eq(trainingSession.revision, expectedRevision)))
      .returning()
      .get();
    if (!updated) {
      outcome = { ok: false, reason: "revision-conflict" };
      return;
    }

    // La sustitución reemplaza el agregado completo: se borran los hijos
    // (las Series se eliminan en cascada) y se reinsertan con las
    // identidades conservadas de los existentes y las nuevas asignadas.
    tx.delete(trainingSessionExercise).where(eq(trainingSessionExercise.sessionId, sessionId)).run();
    if (nextOccurrences.length > 0) {
      tx.insert(trainingSessionExercise).values(nextOccurrences).run();
    }
    if (nextSeries.length > 0) {
      tx.insert(trainingSessionSeries).values(nextSeries).run();
    }

    succeeded = true;
  });

  if (!succeeded) {
    return outcome;
  }
  const aggregate = await loadSessionAggregate(database, { sessionId });
  return { ok: true, session: toSessionDocument(aggregate!) };
}

/**
 * Finaliza una Sesión activa propia en una sola transacción: exige al menos
 * una Serie completada (invariante del Historial) y convierte todas las
 * Series pendientes en omitidas conservando sus objetivos. La transición es
 * una acción explícita — nunca un valor libre del PUT — y respeta la
 * concurrencia optimista: una revisión obsoleta produce un conflicto
 * recuperable sin tocar los hijos.
 */
export async function finalizeSession(
  database: AppDatabase,
  {
    accountId,
    sessionId,
    expectedRevision,
    now,
  }: {
    accountId: string;
    sessionId: string;
    expectedRevision: number;
    now: Date;
  },
): Promise<FinalizeSessionOutcome> {
  let outcome: FinalizeSessionOutcome = { ok: false, reason: "not-found" };
  let succeeded = false;

  await database.transaction((tx) => {
    const sessionRow = tx
      .select()
      .from(trainingSession)
      .where(and(eq(trainingSession.id, sessionId), eq(trainingSession.accountId, accountId)))
      .get();
    if (!sessionRow) {
      outcome = { ok: false, reason: "not-found" };
      return;
    }
    if (sessionRow.revision !== expectedRevision) {
      outcome = { ok: false, reason: "revision-conflict" };
      return;
    }
    if (sessionRow.status !== "activa") {
      outcome = { ok: false, reason: "not-active" };
      return;
    }

    const occurrences = tx
      .select()
      .from(trainingSessionExercise)
      .where(eq(trainingSessionExercise.sessionId, sessionId))
      .all();
    const seriesRows =
      occurrences.length === 0
        ? []
        : tx
            .select()
            .from(trainingSessionSeries)
            .where(
              inArray(
                trainingSessionSeries.sessionExerciseId,
                occurrences.map((entry) => entry.id),
              ),
            )
            .all();

    if (!seriesRows.some((series) => series.status === "completada")) {
      outcome = { ok: false, reason: "no-completed-series" };
      return;
    }

    // CAS de la cabecera antes de tocar los hijos: la actualización exige la
    // revisión esperada y la transición a «finalizada» libera la unicidad de
    // la Sesión activa de la Cuenta.
    const updated = tx
      .update(trainingSession)
      .set({ status: "finalizada", revision: sessionRow.revision + 1, updatedAt: now })
      .where(and(eq(trainingSession.id, sessionId), eq(trainingSession.revision, expectedRevision)))
      .returning()
      .get();
    if (!updated) {
      outcome = { ok: false, reason: "revision-conflict" };
      return;
    }

    const pendingIds = seriesRows
      .filter((series) => series.status === "pendiente")
      .map((series) => series.id);
    if (pendingIds.length > 0) {
      tx.update(trainingSessionSeries)
        .set({ status: "omitida", updatedAt: now })
        .where(inArray(trainingSessionSeries.id, pendingIds))
        .run();
    }

    // El Entrenamiento planificado de origen pasa a realizado únicamente
    // cuando la Sesión finaliza (ticket 28): un día pendiente con una Sesión
    // finalizada deja de poder iniciar otra y queda cerrado ante las
    // ediciones. La guarda sobre el estado pendiente evita sobrescribir un
    // día omitido de un Plan que se cerró entre tanto.
    if (sessionRow.planTrainingId) {
      tx.update(planTraining)
        .set({ status: "realizado" })
        .where(
          and(
            eq(planTraining.id, sessionRow.planTrainingId),
            eq(planTraining.status, "pendiente"),
          ),
        )
        .run();
    }

    succeeded = true;
  });

  if (!succeeded) {
    return outcome;
  }
  const aggregate = await loadSessionAggregate(database, { sessionId });
  return { ok: true, session: toSessionDocument(aggregate!) };
}

/**
 * Elimina una Sesión propia —activa o finalizada— en una sola transacción;
 * los hijos (apariciones y Series) se eliminan en cascada por la clave
 * foránea. La unicidad de la Sesión activa queda liberada para una nueva.
 *
 * Eliminar una Sesión finalizada vinculada devuelve su Entrenamiento
 * planificado a pendiente (spec «Planes de entrenamiento»): en un Plan
 * activo el día vuelve a poder iniciar otra Sesión y, en un Plan completado,
 * el estado del Plan se conserva y el inicio sigue bloqueado por el estado
 * del Plan. La guarda sobre «realizado» evita tocar un día omitido o un
 * Entrenamiento que cambió entre tanto; una Sesión libre o iniciada desde
 * una Rutina no altera ningún Plan. La eliminación exige la revisión leída:
 * una revisión obsoleta produce un conflicto recuperable y no borra un
 * agregado que cambió en otra pestaña.
 */
export async function deleteSession(
  database: AppDatabase,
  {
    accountId,
    sessionId,
    expectedRevision,
  }: {
    accountId: string;
    sessionId: string;
    expectedRevision: number;
  },
): Promise<DeleteSessionOutcome> {
  let outcome: DeleteSessionOutcome = { ok: false, reason: "not-found" };
  let deleted = false;

  await database.transaction((tx) => {
    const sessionRow = tx
      .select()
      .from(trainingSession)
      .where(and(eq(trainingSession.id, sessionId), eq(trainingSession.accountId, accountId)))
      .get();
    if (!sessionRow) {
      outcome = { ok: false, reason: "not-found" };
      return;
    }
    if (sessionRow.revision !== expectedRevision) {
      outcome = { ok: false, reason: "revision-conflict" };
      return;
    }

    // Eliminar una Sesión finalizada originada en un Entrenamiento
    // planificado devuelve el día a pendiente para que el progreso del Plan
    // se recalcule al leer. Un Entrenamiento de un Plan completado conserva
    // su calendario cerrado: el estado del Plan no cambia y no se reactiva.
    if (sessionRow.status === "finalizada" && sessionRow.planTrainingId) {
      tx.update(planTraining)
        .set({ status: "pendiente" })
        .where(
          and(
            eq(planTraining.id, sessionRow.planTrainingId),
            eq(planTraining.status, "realizado"),
          ),
        )
        .run();
    }

    // La comprobación de revisión ya ocurrió en esta misma transacción
    // síncrona; el borrado por identificador elimina el agregado y sus hijos
    // en cascada sin dejar la unicidad de la Sesión activa ocupada.
    tx.delete(trainingSession).where(eq(trainingSession.id, sessionId)).run();
    deleted = true;
  });

  return deleted ? { ok: true } : outcome;
}
