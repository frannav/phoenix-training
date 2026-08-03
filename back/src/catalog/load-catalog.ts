import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isRecordingMode } from "../db/schema";
import type { AppDatabase } from "../db/open-database";
import { applyCatalogUpdate, planCatalogUpdate } from "./catalog-diff";
import type {
  CatalogAssets,
  CatalogManifest,
  CatalogReview,
  UpstreamExerciseRecord,
} from "./types";

/**
 * Activos del catálogo ya verificados y listos para la carga versionada.
 * `snapshotText` conserva el texto exacto del fichero para poder comprobar el
 * checksum fijado en el manifiesto.
 */
export type LoadedCatalogAssets = {
  manifest: CatalogManifest;
  snapshotText: string;
  snapshot: UpstreamExerciseRecord[];
  review: CatalogReview;
};

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function verifySnapshotChecksum(
  snapshotText: string,
  expectedSha256: string,
): boolean {
  return sha256Hex(snapshotText) === expectedSha256;
}

export function parseSnapshot(snapshotText: string): UpstreamExerciseRecord[] {
  const parsed: unknown = JSON.parse(snapshotText);
  if (!Array.isArray(parsed)) {
    throw new Error("El snapshot del catálogo debe ser un array JSON.");
  }
  return parsed as UpstreamExerciseRecord[];
}

/**
 * Invariantes de la carga versionada: el snapshot solo se publica para los
 * identificadores incluidos en la revisión, y cada entrada revisada aporta
 * nombre español, instrucciones españolas no vacías, Forma de registro
 * explícita y taxonomía mínima.
 */
export function validateCatalogAssets(assets: LoadedCatalogAssets): string[] {
  const problems: string[] = [];

  const manifest = assets.manifest;
  if (!manifest.source || manifest.source.length === 0) {
    problems.push("El manifiesto no declara la fuente del catálogo.");
  }
  if (!manifest.upstream?.commit) {
    problems.push("El manifiesto no fija el commit upstream auditado.");
  }
  if (!/^[0-9a-f]{64}$/.test(manifest.upstream?.sha256 ?? "")) {
    problems.push("El manifiesto no fija un checksum SHA-256 válido.");
  }
  if (!manifest.review?.revision) {
    problems.push("El manifiesto no declara la revisión de origen.");
  }

  const snapshotIds = assets.snapshot.map((record) => record.id);
  if (new Set(snapshotIds).size !== snapshotIds.length) {
    problems.push("El snapshot contiene identificadores upstream duplicados.");
  }
  const snapshotById = new Map(assets.snapshot.map((record) => [record.id, record]));

  const reviewedIds = assets.review.exercises.map((entry) => entry.upstreamId);
  if (new Set(reviewedIds).size !== reviewedIds.length) {
    problems.push("La revisión contiene identificadores upstream duplicados.");
  }

  for (const entry of assets.review.exercises) {
    if (!entry.nameEs || entry.nameEs.trim().length === 0) {
      problems.push(`El Ejercicio ${entry.upstreamId} no tiene nombre revisado.`);
    }
    if (!isRecordingMode(entry.recordingMode)) {
      problems.push(
        `El Ejercicio ${entry.upstreamId} no tiene una Forma de registro válida.`,
      );
    }
    if (!entry.categoryEs || entry.categoryEs.trim().length === 0) {
      problems.push(`El Ejercicio ${entry.upstreamId} no tiene taxonomía de búsqueda.`);
    }
    const record = snapshotById.get(entry.upstreamId);
    if (!record) {
      problems.push(
        `El Ejercicio ${entry.upstreamId} no existe en el snapshot upstream.`,
      );
      continue;
    }
    const instructionsEs = record.instructions?.es ?? "";
    if (instructionsEs.trim().length === 0) {
      problems.push(
        `El Ejercicio ${entry.upstreamId} no tiene instrucciones en español.`,
      );
    }
  }

  return problems;
}

/**
 * Carga versionada del catálogo: comprueba el checksum del snapshot frente al
 * manifiesto, valida invariantes y aplica el diff de altas, cambios y
 * retiradas dentro de una transacción. Idempotente frente a una revisión ya
 * cargada.
 */
export async function loadCatalog(
  database: AppDatabase,
  assets: LoadedCatalogAssets,
  now: Date = new Date(),
): Promise<{ added: number; changed: number; retired: number }> {
  if (!verifySnapshotChecksum(assets.snapshotText, assets.manifest.upstream.sha256)) {
    throw new Error(
      "El checksum del snapshot no coincide con el fijado en el manifiesto.",
    );
  }

  const problems = validateCatalogAssets(assets);
  if (problems.length > 0) {
    throw new Error(`El catálogo no cumple los invariantes:\n- ${problems.join("\n- ")}`);
  }

  const diff = await planCatalogUpdate(database, {
    manifest: assets.manifest,
    snapshot: assets.snapshot,
    review: assets.review,
  });
  await applyCatalogUpdate(database, diff, {
    manifest: assets.manifest,
    snapshot: assets.snapshot,
    review: assets.review,
  }, now);

  return {
    added: diff.added.length,
    changed: diff.changed.length,
    retired: diff.retired.length,
  };
}

export function defaultCatalogAssetsDirectory(): string {
  return fileURLToPath(new URL("../../catalog", import.meta.url));
}

export async function readCatalogAssets(
  directory = defaultCatalogAssetsDirectory(),
): Promise<LoadedCatalogAssets> {
  const [manifestText, snapshotText, reviewText] = await Promise.all([
    readFile(`${directory}/manifest.json`, "utf8"),
    readFile(`${directory}/snapshot.json`, "utf8"),
    readFile(`${directory}/review.json`, "utf8"),
  ]);

  return {
    manifest: JSON.parse(manifestText) as CatalogManifest,
    snapshotText,
    snapshot: parseSnapshot(snapshotText),
    review: JSON.parse(reviewText) as CatalogReview,
  };
}
