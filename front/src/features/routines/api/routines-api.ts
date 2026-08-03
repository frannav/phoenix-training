import { apiGet, apiPost, apiPut } from "../../../shared/http/api-client";

export type RoutineRecordingMode =
  | "fuerza_con_carga"
  | "repeticiones_sin_carga"
  | "tiempo_por_serie"
  | "cardio_continuo";

export type RoutineSeriesGoal = {
  id: string;
  order: number;
  carga: number | null;
  repeticiones: number | null;
  duracion: number | null;
};

export type RoutineExerciseEntry = {
  id: string;
  exerciseId: string;
  order: number;
  /** Ejercicio resuelto por el servidor, aunque esté retirado o archivado. */
  exercise: {
    id: string;
    name: string;
    recordingMode: RoutineRecordingMode;
    available: boolean;
    provenance: "catalogo" | "personalizado";
  };
  series: RoutineSeriesGoal[];
};

/** Documento canónico de una Rutina, tal como se entrega al listar y al obtener. */
export type RoutineItem = {
  id: string;
  name: string;
  revision: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  exercises: RoutineExerciseEntry[];
};

/** Entrada para crear o sustituir una Rutina: el agregado completo. */
export type RoutineInputSeries = {
  id?: string;
  carga?: number | null;
  repeticiones?: number | null;
  duracion?: number | null;
};

export type RoutineInputExercise = {
  id?: string;
  exerciseId: string;
  series: RoutineInputSeries[];
};

export type RoutineInput = {
  name: string;
  exercises: RoutineInputExercise[];
};

export async function listRoutines(): Promise<{ items: RoutineItem[] }> {
  return apiGet<{ items: RoutineItem[] }>("/api/routines");
}

export async function getRoutine(id: string): Promise<{ routine: RoutineItem }> {
  return apiGet<{ routine: RoutineItem }>(`/api/routines/${id}`);
}

export async function createRoutine(input: RoutineInput): Promise<{ routine: RoutineItem }> {
  return apiPost<{ routine: RoutineItem }>("/api/routines", input);
}

export async function replaceRoutine(
  id: string,
  revision: number,
  input: RoutineInput,
): Promise<{ routine: RoutineItem }> {
  return apiPut<{ routine: RoutineItem }>(`/api/routines/${id}`, {
    revision,
    ...input,
  });
}

export async function archiveRoutine(id: string): Promise<{ routine: RoutineItem }> {
  return apiPost<{ routine: RoutineItem }>(`/api/routines/${id}/archive`, {});
}

export async function restoreRoutine(id: string): Promise<{ routine: RoutineItem }> {
  return apiPost<{ routine: RoutineItem }>(`/api/routines/${id}/restore`, {});
}
