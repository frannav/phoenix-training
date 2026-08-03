import { apiGet } from "../../../shared/http/api-client";

export type RecordingMode =
  | "fuerza_con_carga"
  | "repeticiones_sin_carga"
  | "tiempo_por_serie"
  | "cardio_continuo";

export type ExerciseItem = {
  id: string;
  name: string;
  instructions: string;
  recordingMode: RecordingMode;
  category: string;
  bodyPart: string | null;
  equipment: string | null;
  provenance: "catalogo" | "personalizado";
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
};

export async function listExercises(
  params: ExerciseListParams = {},
): Promise<ExerciseListResponse> {
  const search = new URLSearchParams();
  if (params.q && params.q.trim().length > 0) search.set("q", params.q.trim());
  if (params.recordingMode) search.set("recordingMode", params.recordingMode);
  if (params.category) search.set("category", params.category);
  if (params.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  return apiGet<ExerciseListResponse>(`/api/exercises${query ? `?${query}` : ""}`);
}

export async function listExerciseCategories(): Promise<{ categories: string[] }> {
  return apiGet<{ categories: string[] }>("/api/exercises/categories");
}
