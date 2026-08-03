import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { normalizeSearchText } from "../catalog/normalize-search-text";
import type { AppDatabase } from "../db/open-database";
import { exercise, type RecordingMode } from "../db/schema";

/**
 * Ejercicio persistido tal como vive en la tabla compartida del catálogo y
 * de los personalizados.
 */
export type ExerciseRow = typeof exercise.$inferSelect;

/**
 * Documento canónico de un Ejercicio tal como se entrega por la API. La
 * misma forma sirve para crear, editar, archivar, restaurar, resolver una
 * referencia por identificador y listar.
 */
export type ExerciseDocument = {
  id: string;
  name: string;
  instructions: string;
  recordingMode: RecordingMode;
  category: string;
  bodyPart: string | null;
  equipment: string | null;
  provenance: "catalogo" | "personalizado";
  available: boolean;
};

export type ExerciseInput = {
  name: string;
  instructions: string;
  recordingMode: RecordingMode;
  category: string;
  bodyPart?: string | null;
  equipment?: string | null;
};

export type ExerciseUpdate = {
  name?: string;
  instructions?: string;
  recordingMode?: RecordingMode;
  category?: string;
  bodyPart?: string | null;
  equipment?: string | null;
};

export type ExerciseMutationOutcome =
  | { ok: true; exercise: ExerciseRow }
  | { ok: false; reason: "not-found" | "recording-mode-immutable" };

export function createOpaqueExerciseId(): string {
  return randomBytes(16).toString("hex");
}

/** Texto opcional: una cadena vacía o de espacios se normaliza a ausente. */
function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value && value.length > 0 ? value : null;
}

export function toExerciseDocument(row: ExerciseRow): ExerciseDocument {
  return {
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    recordingMode: row.recordingMode as RecordingMode,
    category: row.category,
    bodyPart: row.bodyPart,
    equipment: row.equipment,
    provenance: row.accountId === null ? "catalogo" : "personalizado",
    available: row.available,
  };
}

/**
 * Crea un Ejercicio personalizado privado de la Cuenta autenticada. La
 * identidad es opaca y el personalizado no tiene identidad externa; la
 * Forma de registro queda fijada en este momento y no cambia después.
 */
export async function createCustomExercise(
  database: AppDatabase,
  {
    accountId,
    input,
    now,
  }: { accountId: string; input: ExerciseInput; now: Date },
): Promise<ExerciseRow> {
  const row: ExerciseRow = {
    id: createOpaqueExerciseId(),
    accountId,
    source: null,
    upstreamId: null,
    sourceRevision: null,
    name: input.name,
    nameNormalized: normalizeSearchText(input.name),
    instructions: input.instructions,
    recordingMode: input.recordingMode,
    category: input.category,
    bodyPart: optionalText(input.bodyPart) ?? null,
    equipment: optionalText(input.equipment) ?? null,
    available: true,
    createdAt: now,
    updatedAt: now,
  };
  await database.insert(exercise).values(row);
  return row;
}

/**
 * El personalizado editable de una Cuenta: solo sus propios Ejercicios
 * personalizados. El catálogo compartido y los personalizados ajenos se
 * comportan como inexistentes para la mutación.
 */
export async function findOwnCustomExercise(
  database: AppDatabase,
  { accountId, exerciseId }: { accountId: string; exerciseId: string },
): Promise<ExerciseRow | null> {
  const row = await database
    .select()
    .from(exercise)
    .where(and(eq(exercise.id, exerciseId), eq(exercise.accountId, accountId)))
    .get();
  return row ?? null;
}

/**
 * Sustituye los datos compatibles de un Ejercicio personalizado propio. La
 * Forma de registro es inmutable una vez publicado o utilizado: un cambio
 * se rechaza como transición imposible y la corrección incompatible se
 * resuelve creando otro Ejercicio.
 */
export async function updateCustomExercise(
  database: AppDatabase,
  {
    accountId,
    exerciseId,
    update,
    now,
  }: {
    accountId: string;
    exerciseId: string;
    update: ExerciseUpdate;
    now: Date;
  },
): Promise<ExerciseMutationOutcome> {
  const current = await findOwnCustomExercise(database, { accountId, exerciseId });
  if (!current) {
    return { ok: false, reason: "not-found" };
  }
  if (update.recordingMode !== undefined && update.recordingMode !== current.recordingMode) {
    return { ok: false, reason: "recording-mode-immutable" };
  }

  const next: Partial<typeof exercise.$inferInsert> = { updatedAt: now };
  if (update.name !== undefined) {
    next.name = update.name;
    next.nameNormalized = normalizeSearchText(update.name);
  }
  if (update.instructions !== undefined) {
    next.instructions = update.instructions;
  }
  if (update.category !== undefined) {
    next.category = update.category;
  }
  if (update.bodyPart !== undefined) {
    next.bodyPart = optionalText(update.bodyPart) ?? null;
  }
  if (update.equipment !== undefined) {
    next.equipment = optionalText(update.equipment) ?? null;
  }

  const updated = await database
    .update(exercise)
    .set(next)
    .where(and(eq(exercise.id, exerciseId), eq(exercise.accountId, accountId)))
    .returning()
    .get();
  return { ok: true, exercise: updated };
}

/**
 * Archiva o restaura un Ejercicio personalizado propio. Archivar lo retira
 * de usos nuevos sin cambiar su identidad ni romper las referencias
 * existentes; restaurar vuelve a ofrecerlo. La operación es idempotente.
 */
export async function setCustomExerciseAvailability(
  database: AppDatabase,
  {
    accountId,
    exerciseId,
    available,
    now,
  }: {
    accountId: string;
    exerciseId: string;
    available: boolean;
    now: Date;
  },
): Promise<ExerciseMutationOutcome> {
  const current = await findOwnCustomExercise(database, { accountId, exerciseId });
  if (!current) {
    return { ok: false, reason: "not-found" };
  }
  const updated = await database
    .update(exercise)
    .set({ available, updatedAt: now })
    .where(and(eq(exercise.id, exerciseId), eq(exercise.accountId, accountId)))
    .returning()
    .get();
  return { ok: true, exercise: updated };
}

/**
 * Resuelve cualquier Ejercicio visible para la Cuenta —el catálogo
 * compartido o un personalizado propio— aunque esté retirado o archivado,
 * para conservar el contexto histórico de las referencias existentes. Un
 * personalizado ajeno se comporta como inexistente.
 */
export async function findExerciseForAccount(
  database: AppDatabase,
  { accountId, exerciseId }: { accountId: string; exerciseId: string },
): Promise<ExerciseRow | null> {
  const row = await database
    .select()
    .from(exercise)
    .where(
      and(
        eq(exercise.id, exerciseId),
        or(isNull(exercise.accountId), eq(exercise.accountId, accountId)),
      ),
    )
    .get();
  return row ?? null;
}

/** Personalizados propios archivados, para gestionar su restauración. */
export async function listArchivedCustomExercises(
  database: AppDatabase,
  { accountId }: { accountId: string },
): Promise<ExerciseRow[]> {
  return database
    .select()
    .from(exercise)
    .where(and(eq(exercise.accountId, accountId), eq(exercise.available, false)))
    .orderBy(asc(exercise.name), asc(exercise.id))
    .all();
}
