import { randomBytes } from "node:crypto";
import { and, desc, eq, lte } from "drizzle-orm";
import type { AppDatabase } from "../db/open-database";
import { exercise, recordedMax } from "../db/schema";
import { findExerciseForAccount } from "./custom-exercises";

/**
 * RM registrado persistido tal como vive en su tabla, junto con el nombre
 * del Ejercicio que referencia. El nombre se une desde la tabla compartida
 * de Ejercicios porque el RM puede referenciar un Ejercicio retirado de los
 * usos nuevos sin perder su contexto.
 */
export type RecordedMaxWithExercise = {
  rm: typeof recordedMax.$inferSelect;
  exerciseName: string;
};

/**
 * Documento canónico de un RM tal como se entrega por la API: Ejercicio
 * (identidad y nombre), carga, repeticiones y fecha. La misma forma sirve
 * para registrar, listar, consultar, editar, eliminar y resolver la vigencia.
 */
export type RecordedMaxDocument = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  load: number;
  repetitions: number;
  date: string;
};

export type RecordedMaxInput = {
  exerciseId: string;
  load: number;
  repetitions: number;
  date: string;
};

export type RecordedMaxUpdate = {
  load?: number;
  repetitions?: number;
  date?: string;
};

export type RecordedMaxCreateOutcome =
  | { ok: true; rm: RecordedMaxDocument }
  | { ok: false; reason: "exercise-not-found" };

export type RecordedMaxMutationOutcome =
  | { ok: true; rm: RecordedMaxDocument }
  | { ok: false; reason: "not-found" };

export function createOpaqueRecordedMaxId(): string {
  return randomBytes(16).toString("hex");
}

/** Fecha de dominio YYYY-MM-DD que corresponde a un día real del calendario. */
export function isDomainDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

export function toRecordedMaxDocument(row: RecordedMaxWithExercise): RecordedMaxDocument {
  return {
    id: row.rm.id,
    exerciseId: row.rm.exerciseId,
    exerciseName: row.exerciseName,
    load: row.rm.load,
    repetitions: row.rm.repetitions,
    date: row.rm.date,
  };
}

/**
 * Registra un RM expreso de la Cuenta autenticada. El Ejercicio de destino
 * puede ser del catálogo o un personalizado propio, incluso si ya no está
 * disponible para usos nuevos; un Ejercicio ajeno o inexistente se rechaza
 * en el límite del caso de uso. La identidad es opaca y la carga admite de
 * 0 a 9999,99 kg con como máximo dos decimales, validados en el límite HTTP.
 */
export async function createRecordedMax(
  database: AppDatabase,
  {
    accountId,
    input,
    now,
  }: {
    accountId: string;
    input: RecordedMaxInput;
    now: Date;
  },
): Promise<RecordedMaxCreateOutcome> {
  const target = await findExerciseForAccount(database, {
    accountId,
    exerciseId: input.exerciseId,
  });
  if (!target) {
    return { ok: false, reason: "exercise-not-found" };
  }

  const row: typeof recordedMax.$inferInsert = {
    id: createOpaqueRecordedMaxId(),
    accountId,
    exerciseId: input.exerciseId,
    load: input.load,
    repetitions: input.repetitions,
    date: input.date,
    createdAt: now,
    updatedAt: now,
  };
  await database.insert(recordedMax).values(row);

  return {
    ok: true,
    rm: {
      id: row.id!,
      exerciseId: input.exerciseId,
      exerciseName: target.name,
      load: input.load,
      repetitions: input.repetitions,
      date: input.date,
    },
  };
}

/** El RM propio de una Cuenta junto al nombre de su Ejercicio. */
export async function findOwnRecordedMax(
  database: AppDatabase,
  { accountId, recordedMaxId }: { accountId: string; recordedMaxId: string },
): Promise<RecordedMaxWithExercise | null> {
  const row = await database
    .select({ rm: recordedMax, exerciseName: exercise.name })
    .from(recordedMax)
    .innerJoin(exercise, eq(recordedMax.exerciseId, exercise.id))
    .where(and(eq(recordedMax.id, recordedMaxId), eq(recordedMax.accountId, accountId)))
    .get();
  return row ?? null;
}

/**
 * Lista los RM de la Cuenta autenticada, del más reciente al más antiguo por
 * su fecha. El nombre del Ejercicio se resuelve aunque el Ejercicio haya
 * dejado de estar disponible para usos nuevos.
 */
export async function listRecordedMaxes(
  database: AppDatabase,
  { accountId }: { accountId: string },
): Promise<RecordedMaxDocument[]> {
  const rows = await database
    .select({ rm: recordedMax, exerciseName: exercise.name })
    .from(recordedMax)
    .innerJoin(exercise, eq(recordedMax.exerciseId, exercise.id))
    .where(eq(recordedMax.accountId, accountId))
    .orderBy(desc(recordedMax.date), desc(recordedMax.createdAt))
    .all();
  return rows.map(toRecordedMaxDocument);
}

/**
 * Edita la carga, repeticiones o fecha de un RM propio. El Ejercicio es
 * inmutable: un RM pertenece al Ejercicio para el que se registró.
 */
export async function updateRecordedMax(
  database: AppDatabase,
  {
    accountId,
    recordedMaxId,
    update,
    now,
  }: {
    accountId: string;
    recordedMaxId: string;
    update: RecordedMaxUpdate;
    now: Date;
  },
): Promise<RecordedMaxMutationOutcome> {
  const current = await findOwnRecordedMax(database, { accountId, recordedMaxId });
  if (!current) {
    return { ok: false, reason: "not-found" };
  }

  const next: Partial<typeof recordedMax.$inferInsert> = { updatedAt: now };
  if (update.load !== undefined) {
    next.load = update.load;
  }
  if (update.repetitions !== undefined) {
    next.repetitions = update.repetitions;
  }
  if (update.date !== undefined) {
    next.date = update.date;
  }

  await database
    .update(recordedMax)
    .set(next)
    .where(and(eq(recordedMax.id, recordedMaxId), eq(recordedMax.accountId, accountId)));

  return {
    ok: true,
    rm: {
      id: current.rm.id,
      exerciseId: current.rm.exerciseId,
      exerciseName: current.exerciseName,
      load: update.load ?? current.rm.load,
      repetitions: update.repetitions ?? current.rm.repetitions,
      date: update.date ?? current.rm.date,
    },
  };
}

/** Elimina un RM propio y devuelve su documento canónico. */
export async function deleteRecordedMax(
  database: AppDatabase,
  { accountId, recordedMaxId }: { accountId: string; recordedMaxId: string },
): Promise<RecordedMaxMutationOutcome> {
  const current = await findOwnRecordedMax(database, { accountId, recordedMaxId });
  if (!current) {
    return { ok: false, reason: "not-found" };
  }

  await database
    .delete(recordedMax)
    .where(and(eq(recordedMax.id, recordedMaxId), eq(recordedMax.accountId, accountId)));

  return { ok: true, rm: toRecordedMaxDocument(current) };
}

/**
 * RM vigente de un Ejercicio para un número de repeticiones en una fecha: el
 * registro más reciente de esa fecha o anterior. Cuando dos RM comparten
 * fecha, gana el registrado más tarde (created_at descendente) como
 * desempate determinista; editar un RM no cambia su posición en el empate.
 * Si no existe ningún RM vigente, el resultado es null: la ausencia es un
 * resultado normal de la consulta, no un recurso inexistente.
 */
export async function effectiveRecordedMax(
  database: AppDatabase,
  {
    accountId,
    exerciseId,
    repetitions,
    date,
  }: {
    accountId: string;
    exerciseId: string;
    repetitions: number;
    date: string;
  },
): Promise<RecordedMaxDocument | null> {
  const row = await database
    .select({ rm: recordedMax, exerciseName: exercise.name })
    .from(recordedMax)
    .innerJoin(exercise, eq(recordedMax.exerciseId, exercise.id))
    .where(
      and(
        eq(recordedMax.accountId, accountId),
        eq(recordedMax.exerciseId, exerciseId),
        eq(recordedMax.repetitions, repetitions),
        lte(recordedMax.date, date),
      ),
    )
    .orderBy(desc(recordedMax.date), desc(recordedMax.createdAt))
    .limit(1)
    .get();
  return row ? toRecordedMaxDocument(row) : null;
}
