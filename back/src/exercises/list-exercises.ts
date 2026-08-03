import { and, asc, eq, isNull, like, or } from "drizzle-orm";
import type { AppDatabase } from "../db/open-database";
import { normalizeSearchText } from "../catalog/normalize-search-text";
import { exercise } from "../db/schema";

export type ExerciseListFilters = {
  /** Cuenta autenticada: los personalizados propios se combinan con el catálogo. */
  accountId: string;
  q?: string;
  recordingMode?: string;
  category?: string;
  limit: number;
  offset: number;
};

export type ExerciseListItem = {
  id: string;
  name: string;
  instructions: string;
  recordingMode: string;
  category: string;
  bodyPart: string | null;
  equipment: string | null;
  provenance: "catalogo" | "personalizado";
  available: boolean;
};

/**
 * Lista los Ejercicios disponibles: los compartidos del catálogo y los
 * personalizados de la Cuenta autenticada. La búsqueda por nombre usa el
 * texto normalizado calculado durante la carga versionada; ninguna petición
 * consulta ni traduce contenido upstream.
 */
export async function listExercises(
  database: AppDatabase,
  filters: ExerciseListFilters,
): Promise<ExerciseListItem[]> {
  const conditions = [
    eq(exercise.available, true),
    or(isNull(exercise.accountId), eq(exercise.accountId, filters.accountId)),
  ];

  if (filters.q && filters.q.trim().length > 0) {
    const normalized = normalizeSearchText(filters.q.trim());
    conditions.push(like(exercise.nameNormalized, `%${normalized}%`));
  }
  if (filters.recordingMode) {
    conditions.push(eq(exercise.recordingMode, filters.recordingMode));
  }
  if (filters.category) {
    conditions.push(eq(exercise.category, filters.category));
  }

  const rows = await database
    .select({
      id: exercise.id,
      name: exercise.name,
      instructions: exercise.instructions,
      recordingMode: exercise.recordingMode,
      category: exercise.category,
      bodyPart: exercise.bodyPart,
      equipment: exercise.equipment,
      accountId: exercise.accountId,
      available: exercise.available,
    })
    .from(exercise)
    .where(and(...conditions))
    .orderBy(asc(exercise.name), asc(exercise.id))
    .limit(filters.limit)
    .offset(filters.offset);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    recordingMode: row.recordingMode,
    category: row.category,
    bodyPart: row.bodyPart,
    equipment: row.equipment,
    provenance: row.accountId === null ? ("catalogo" as const) : ("personalizado" as const),
    available: row.available,
  }));
}
