import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { catalogManifest, exercise, isRecordingMode } from "../db/schema";
import type { AppDatabase } from "../db/open-database";
import { normalizeSearchText } from "./normalize-search-text";
import type { CatalogAssets, ReviewExercise, UpstreamExerciseRecord } from "./types";

/**
 * Preparación de la revisión: une cada entrada de la revisión con las
 * instrucciones en español del snapshot upstream y el nombre normalizado para
 * búsqueda. La Forma de registro y la taxonomía provienen únicamente de la
 * revisión local; ninguna petición traduce ni infiere contenido.
 */
export type PreparedReviewEntry = ReviewExercise & {
  instructionsEs: string;
  nameNormalized: string;
};

export function prepareReview(assets: CatalogAssets): PreparedReviewEntry[] {
  const snapshotById = new Map<string, UpstreamExerciseRecord>(
    assets.snapshot.map((record) => [record.id, record]),
  );

  return assets.review.exercises.map((entry) => {
    const record = snapshotById.get(entry.upstreamId);
    if (!record) {
      throw new Error(
        `La revisión referencia un identificador upstream desconocido: ${entry.upstreamId}`,
      );
    }
    return {
      ...entry,
      instructionsEs: record.instructions.es ?? "",
      nameNormalized: normalizeSearchText(entry.nameEs),
    };
  });
}

type AvailableExerciseRow = {
  id: string;
  upstreamId: string | null;
  name: string;
  nameNormalized: string;
  instructions: string;
  recordingMode: string;
  category: string;
  bodyPart: string | null;
  equipment: string | null;
};

export function visibleFieldChanges(
  existing: AvailableExerciseRow,
  entry: PreparedReviewEntry,
): string[] {
  const changes: string[] = [];
  if (existing.name !== entry.nameEs) changes.push("name");
  if (existing.instructions !== entry.instructionsEs) changes.push("instructions");
  if (existing.category !== entry.categoryEs) changes.push("category");
  if (existing.bodyPart !== entry.bodyPartEs) changes.push("bodyPart");
  if (existing.equipment !== entry.equipmentEs) changes.push("equipment");
  return changes;
}

export type CatalogDiff = {
  /** Ejercicios nuevos: reciben una identidad interna opaca distinta. */
  added: PreparedReviewEntry[];
  /** Cambios compatibles: actualizan los datos visibles conservando la identidad. */
  changed: {
    id: string;
    upstreamId: string;
    fields: string[];
    entry: PreparedReviewEntry;
  }[];
  /** Retiradas de usos nuevos; nunca se elimina la fila ni la identidad. */
  retired: {
    id: string;
    upstreamId: string;
    reason: "ausente" | "forma-incompatible";
  }[];
};

/**
 * Calcula el diff revisable entre el catálogo persistido y los activos de la
 * siguiente revisión. Una Forma de registro distinta nunca se aplica en la
 * misma identidad: retira la anterior y añade una identidad nueva.
 */
export async function planCatalogUpdate(
  database: AppDatabase,
  assets: CatalogAssets,
): Promise<CatalogDiff> {
  const prepared = prepareReview(assets);
  const current = await database
    .select({
      id: exercise.id,
      upstreamId: exercise.upstreamId,
      name: exercise.name,
      nameNormalized: exercise.nameNormalized,
      instructions: exercise.instructions,
      recordingMode: exercise.recordingMode,
      category: exercise.category,
      bodyPart: exercise.bodyPart,
      equipment: exercise.equipment,
    })
    .from(exercise)
    .where(and(eq(exercise.source, assets.manifest.source), eq(exercise.available, true)));

  const currentByUpstream = new Map<string, AvailableExerciseRow>();
  for (const row of current) {
    if (row.upstreamId !== null) {
      currentByUpstream.set(row.upstreamId, row);
    }
  }

  const diff: CatalogDiff = { added: [], changed: [], retired: [] };
  const reviewedUpstreamIds = new Set<string>();

  for (const entry of prepared) {
    reviewedUpstreamIds.add(entry.upstreamId);
    const existing = currentByUpstream.get(entry.upstreamId);

    if (!existing) {
      diff.added.push(entry);
      continue;
    }

    if (existing.recordingMode !== entry.recordingMode) {
      diff.retired.push({
        id: existing.id,
        upstreamId: entry.upstreamId,
        reason: "forma-incompatible",
      });
      diff.added.push(entry);
      continue;
    }

    const fields = visibleFieldChanges(existing, entry);
    if (fields.length > 0) {
      diff.changed.push({ id: existing.id, upstreamId: entry.upstreamId, fields, entry });
    }
  }

  for (const row of current) {
    if (row.upstreamId !== null && !reviewedUpstreamIds.has(row.upstreamId)) {
      diff.retired.push({ id: row.id, upstreamId: row.upstreamId, reason: "ausente" });
    }
  }

  return diff;
}

export function createOpaqueExerciseId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Aplica el diff revisado dentro de una transacción: retira antes de publicar
 * identidades nuevas, conserva la identidad de los cambios compatibles y
 * nunca borra filas. Actualiza el manifiesto al estado cargado.
 */
export async function applyCatalogUpdate(
  database: AppDatabase,
  diff: CatalogDiff,
  assets: CatalogAssets,
  now: Date,
): Promise<void> {
  const revision = assets.manifest.review.revision;

  await database.transaction(async (tx) => {
    for (const retired of diff.retired) {
      await tx
        .update(exercise)
        .set({ available: false, updatedAt: now })
        .where(eq(exercise.id, retired.id));
    }

    for (const change of diff.changed) {
      const { entry } = change;
      await tx
        .update(exercise)
        .set({
          name: entry.nameEs,
          nameNormalized: entry.nameNormalized,
          instructions: entry.instructionsEs,
          category: entry.categoryEs,
          bodyPart: entry.bodyPartEs,
          equipment: entry.equipmentEs,
          sourceRevision: revision,
          updatedAt: now,
        })
        .where(eq(exercise.id, change.id));
    }

    for (const entry of diff.added) {
      await tx.insert(exercise).values({
        id: createOpaqueExerciseId(),
        accountId: null,
        source: assets.manifest.source,
        upstreamId: entry.upstreamId,
        sourceRevision: revision,
        name: entry.nameEs,
        nameNormalized: entry.nameNormalized,
        instructions: entry.instructionsEs,
        recordingMode: entry.recordingMode,
        category: entry.categoryEs,
        bodyPart: entry.bodyPartEs,
        equipment: entry.equipmentEs,
        available: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    await tx
      .insert(catalogManifest)
      .values({
        id: assets.manifest.source,
        source: assets.manifest.source,
        upstreamCommit: assets.manifest.upstream.commit,
        snapshotSha256: assets.manifest.upstream.sha256,
        reviewRevision: revision,
        reviewedAt: assets.manifest.review.reviewedAt,
        importedAt: now,
      })
      .onConflictDoUpdate({
        target: catalogManifest.id,
        set: {
          upstreamCommit: assets.manifest.upstream.commit,
          snapshotSha256: assets.manifest.upstream.sha256,
          reviewRevision: revision,
          reviewedAt: assets.manifest.review.reviewedAt,
          importedAt: now,
        },
      });
  });
}

export { isRecordingMode };
