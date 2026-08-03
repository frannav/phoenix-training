import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { AppDatabase } from "../db/open-database";
import { exercise, trainingSession, trainingSessionExercise, type RecordingMode } from "../db/schema";

/**
 * Fila persistida de una Sesión y de cada aparición de Ejercicio, junto con
 * el Ejercicio resuelto para presentarla sin consultas adicionales.
 */
export type SessionRow = typeof trainingSession.$inferSelect;
export type SessionExerciseRow = typeof trainingSessionExercise.$inferSelect;

type EnrichedOccurrence = SessionExerciseRow & { exercise: typeof exercise.$inferSelect };

export type SessionAggregate = {
  session: SessionRow;
  exercises: EnrichedOccurrence[];
};

/**
 * Documento canónico de una Sesión tal como se entrega por la API. Contiene
 * la revisión entera del agregado y toda la información confirmada para
 * presentar y reanudar la Sesión sin consultas adicionales.
 */
export type SessionDocument = {
  id: string;
  revision: number;
  origin: "libre";
  status: "activa";
  datePerformed: string;
  lastExerciseId: string | null;
  exercises: SessionExerciseDocument[];
  startedAt: string;
  updatedAt: string;
};

export type SessionExerciseDocument = {
  id: string;
  exerciseId: string;
  sortOrder: number;
  exercise: {
    id: string;
    name: string;
    recordingMode: RecordingMode;
    provenance: "catalogo" | "personalizado";
  };
};

export type SessionExerciseInput = {
  id?: string;
  exerciseId: string;
};

export type StartSessionOutcome =
  | { ok: true; session: SessionDocument }
  | { ok: false; reason: "active-exists"; sessionId: string };

export type ReplaceSessionOutcome =
  | { ok: true; session: SessionDocument }
  | {
      ok: false;
      reason: "not-found" | "revision-conflict" | "invalid-exercises" | "unknown-child";
      message?: string;
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
    origin: aggregate.session.origin as "libre",
    status: aggregate.session.status as "activa",
    datePerformed: aggregate.session.datePerformed,
    lastExerciseId: aggregate.session.lastExerciseId,
    exercises: aggregate.exercises.map((occurrence) => ({
      id: occurrence.id,
      exerciseId: occurrence.exerciseId,
      sortOrder: occurrence.sortOrder,
      exercise: {
        id: occurrence.exercise.id,
        name: occurrence.exercise.name,
        recordingMode: occurrence.exercise.recordingMode as RecordingMode,
        provenance: occurrence.exercise.accountId === null ? "catalogo" : "personalizado",
      },
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

  return {
    session: sessionRow,
    exercises: rows.map(({ occurrence, exercise: exerciseRow }) => ({
      ...occurrence,
      exercise: exerciseRow,
    })),
  };
}

/**
 * Inicia una Sesión libre de la Cuenta autenticada. La comprobación de que no
 * exista otra Sesión activa ocurre dentro de la misma transacción y el índice
 * parcial de unicidad la respalda en la base de datos: un segundo inicio
 * devuelve el identificador de la Sesión existente en lugar de crear otra.
 */
export async function startFreeSession(
  database: AppDatabase,
  { accountId, now }: { accountId: string; now: Date },
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

    const row = {
      id: createOpaqueSessionId(),
      accountId,
      origin: "libre" as const,
      status: "activa" as const,
      revision: 1,
      datePerformed: toDomainDate(now),
      lastExerciseId: null,
      startedAt: now,
      updatedAt: now,
    };

    try {
      const inserted = await tx.insert(trainingSession).values(row).returning().get();
      return { ok: true, session: toSessionDocument({ session: inserted, exercises: [] }) };
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
 * Sustituye el agregado completo de una Sesión activa propia en una sola
 * transacción: conserva los identificadores de las apariciones existentes,
 * asigna identificadores opacos a las nuevas y registra como último Ejercicio
 * confirmado el de la última aparición. Una revisión obsoleta produce un
 * conflicto recuperable sin mezclar ni duplicar cambios.
 */
export async function replaceSession(
  database: AppDatabase,
  {
    accountId,
    sessionId,
    expectedRevision,
    exercises,
    now,
  }: {
    accountId: string;
    sessionId: string;
    expectedRevision: number;
    exercises: SessionExerciseInput[];
    now: Date;
  },
): Promise<ReplaceSessionOutcome> {
  return database.transaction(async (tx) => {
    const sessionRow = await tx
      .select()
      .from(trainingSession)
      .where(
        and(eq(trainingSession.id, sessionId), eq(trainingSession.accountId, accountId)),
      )
      .get();
    if (!sessionRow) {
      return { ok: false, reason: "not-found" } as const;
    }
    if (sessionRow.revision !== expectedRevision) {
      return { ok: false, reason: "revision-conflict" } as const;
    }

    const current = await tx
      .select()
      .from(trainingSessionExercise)
      .where(eq(trainingSessionExercise.sessionId, sessionId))
      .all();
    const currentById = new Map(current.map((occurrence) => [occurrence.id, occurrence]));

    const seenIds = new Set<string>();
    const newExerciseIds = new Set<string>();
    const next: {
      id: string;
      sessionId: string;
      exerciseId: string;
      sortOrder: number;
      createdAt: Date;
    }[] = [];

    for (let index = 0; index < exercises.length; index += 1) {
      const input = exercises[index]!;
      if (input.id !== undefined) {
        const existing = currentById.get(input.id);
        if (!existing || seenIds.has(input.id)) {
          return { ok: false, reason: "unknown-child" } as const;
        }
        seenIds.add(input.id);
        next.push({
          id: existing.id,
          sessionId,
          exerciseId: existing.exerciseId,
          sortOrder: index,
          createdAt: existing.createdAt,
        });
      } else {
        newExerciseIds.add(input.exerciseId);
        next.push({
          id: createOpaqueSessionId(),
          sessionId,
          exerciseId: input.exerciseId,
          sortOrder: index,
          createdAt: now,
        });
      }
    }

    // Los usos nuevos solo admiten Ejercicios disponibles para la Cuenta: el
    // catálogo compartido o un personalizado propio. Un Ejercicio ajeno se
    // comporta como no disponible, sin inferir su existencia.
    if (newExerciseIds.size > 0) {
      const resolved = await tx
        .select({ id: exercise.id })
        .from(exercise)
        .where(
          and(
            eq(exercise.available, true),
            or(isNull(exercise.accountId), eq(exercise.accountId, accountId)),
            inArray(exercise.id, [...newExerciseIds]),
          ),
        )
        .all();
      const resolvedIds = new Set(resolved.map((entry) => entry.id));
      for (const exerciseId of newExerciseIds) {
        if (!resolvedIds.has(exerciseId)) {
          return {
            ok: false,
            reason: "invalid-exercises",
            message: "Uno de los Ejercicios no está disponible para tu Cuenta.",
          } as const;
        }
      }
    }

    await tx
      .delete(trainingSessionExercise)
      .where(eq(trainingSessionExercise.sessionId, sessionId));
    if (next.length > 0) {
      await tx.insert(trainingSessionExercise).values(next);
    }

    const lastExerciseId = next.length > 0 ? next[next.length - 1]!.exerciseId : null;
    await tx
      .update(trainingSession)
      .set({ revision: sessionRow.revision + 1, lastExerciseId, updatedAt: now })
      .where(eq(trainingSession.id, sessionId));

    const aggregate = await loadSessionAggregate(tx, { sessionId });
    return { ok: true, session: toSessionDocument(aggregate!) };
  });
}
