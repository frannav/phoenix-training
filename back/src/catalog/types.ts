import type { RecordingMode } from "../db/schema";

/**
 * Tipos de los activos del catálogo: el manifiesto que fija el origen
 * auditado, el snapshot con los registros upstream y la revisión local que
 * relaciona cada identificador upstream con sus datos en español.
 */

export type CatalogManifest = {
  source: string;
  upstream: {
    repository: string;
    commit: string;
    dataFile: string;
    snapshotFile: string;
    sha256: string;
  };
  review: {
    revision: string;
    reviewedAt: string;
    reviewFile: string;
  };
};

/** Registro upstream tal y como aparece en `data/exercises.json`. */
export type UpstreamExerciseRecord = {
  id: string;
  name: string;
  category: string;
  body_part: string;
  equipment: string;
  instructions: Record<string, string>;
  instruction_steps: Record<string, string[]>;
  muscle_group: string;
  secondary_muscles: string[];
  target: string;
  media_id: string;
  image: string;
  gif_url: string;
  attribution: string;
  created_at: string;
};

export type ReviewExercise = {
  upstreamId: string;
  nameEs: string;
  recordingMode: RecordingMode;
  categoryEs: string;
  bodyPartEs: string;
  equipmentEs: string;
};

export type CatalogReview = {
  exercises: ReviewExercise[];
};

export type CatalogAssets = {
  manifest: CatalogManifest;
  snapshot: UpstreamExerciseRecord[];
  review: CatalogReview;
};
