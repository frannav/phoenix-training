import { apiDelete, apiGet, apiPost, apiPut } from "../../../shared/http/api-client";

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

// ---- RM registrados ------------------------------------------------------

/**
 * RM registrado: mejor marca real de un Ejercicio declarada expresamente por
 * el Deportista, asociada a una fecha y un número de repeticiones. La misma
 * forma se entrega al listar, registrar, editar, eliminar y resolver la
 * vigencia; el nombre del Ejercicio se conserva aunque deje de estar
 * disponible para usos nuevos.
 */
export type RecordedMax = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  load: number;
  repetitions: number;
  date: string;
};

/** Valores del formulario de RM: Ejercicio, carga, repeticiones y fecha. */
export type RecordedMaxFormValues = {
  exerciseId: string;
  load: number;
  repetitions: number;
  date: string;
};

export async function listRecordedMaxes(): Promise<{ items: RecordedMax[] }> {
  return apiGet<{ items: RecordedMax[] }>("/api/rms");
}

export async function createRecordedMax(
  values: RecordedMaxFormValues,
): Promise<{ rm: RecordedMax }> {
  return apiPost<{ rm: RecordedMax }>("/api/rms", values);
}

export async function updateRecordedMax(
  id: string,
  values: Omit<RecordedMaxFormValues, "exerciseId">,
): Promise<{ rm: RecordedMax }> {
  return apiPut<{ rm: RecordedMax }>(`/api/rms/${id}`, values);
}

export async function deleteRecordedMax(id: string): Promise<{ rm: RecordedMax }> {
  return apiDelete<{ rm: RecordedMax }>(`/api/rms/${id}`);
}

/**
 * Todos los Ejercicios disponibles para la Cuenta (catálogo y personalizados
 * propios), recorriendo la paginación por cursor del listado. Sirve al
 * selector de Ejercicio del formulario de RM.
 */
export async function listAllAvailableExercises(): Promise<ExerciseItem[]> {
  let items: ExerciseItem[] = [];
  let cursor: string | null = null;
  do {
    const page = await listExercises({ limit: 50, cursor });
    items = [...items, ...page.items];
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}
