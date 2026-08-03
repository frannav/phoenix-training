import { apiGet, apiPost, apiPut } from "../../../shared/http/api-client";

export type RecordingMode =
  | "fuerza_con_carga"
  | "repeticiones_sin_carga"
  | "tiempo_por_serie"
  | "cardio_continuo";

/**
 * Documento canónico de un Ejercicio. La misma forma se entrega al listar,
 * crear, editar, archivar, restaurar y resolver una referencia existente.
 */
export type ExerciseItem = {
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

export type ExerciseListResponse = {
  items: ExerciseItem[];
  nextCursor: string | null;
};

export const recordingModeLabels: Record<RecordingMode, string> = {
  fuerza_con_carga: "Fuerza con carga",
  repeticiones_sin_carga: "Repeticiones sin carga",
  tiempo_por_serie: "Tiempo por serie",
  cardio_continuo: "Cardio continuo",
};

export type ExerciseListParams = {
  q?: string;
  recordingMode?: RecordingMode | "";
  category?: string;
  cursor?: string | null;
  limit?: number;
};

export type ExerciseFormValues = {
  name: string;
  instructions: string;
  recordingMode: RecordingMode;
  category: string;
  bodyPart: string;
  equipment: string;
};

export async function listExercises(
  params: ExerciseListParams = {},
): Promise<ExerciseListResponse> {
  const search = new URLSearchParams();
  if (params.q && params.q.trim().length > 0) search.set("q", params.q.trim());
  if (params.recordingMode) search.set("recordingMode", params.recordingMode);
  if (params.category) search.set("category", params.category);
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return apiGet<ExerciseListResponse>(`/api/exercises${query ? `?${query}` : ""}`);
}

export async function listExerciseCategories(): Promise<{ categories: string[] }> {
  return apiGet<{ categories: string[] }>("/api/exercises/categories");
}

export async function listArchivedExercises(): Promise<{ items: ExerciseItem[] }> {
  return apiGet<{ items: ExerciseItem[] }>("/api/exercises/archived");
}

export async function getExercise(id: string): Promise<{ exercise: ExerciseItem }> {
  return apiGet<{ exercise: ExerciseItem }>(`/api/exercises/${id}`);
}

export async function createExercise(
  values: ExerciseFormValues,
): Promise<{ exercise: ExerciseItem }> {
  return apiPost<{ exercise: ExerciseItem }>("/api/exercises", values);
}

export async function updateExercise(
  id: string,
  values: ExerciseFormValues,
): Promise<{ exercise: ExerciseItem }> {
  return apiPut<{ exercise: ExerciseItem }>(`/api/exercises/${id}`, values);
}

export async function archiveExercise(id: string): Promise<{ exercise: ExerciseItem }> {
  return apiPost<{ exercise: ExerciseItem }>(`/api/exercises/${id}/archive`, {});
}

export async function restoreExercise(id: string): Promise<{ exercise: ExerciseItem }> {
  return apiPost<{ exercise: ExerciseItem }>(`/api/exercises/${id}/restore`, {});
}
