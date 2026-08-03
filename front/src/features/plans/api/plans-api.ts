import { apiDelete, apiGet, apiPost, apiPut } from "../../../shared/http/api-client";

export type PlanStatus = "borrador" | "activo" | "completado";

export type PlanRecordingMode =
  | "fuerza_con_carga"
  | "repeticiones_sin_carga"
  | "tiempo_por_serie"
  | "cardio_continuo";

export type PlanSeriesGoal = {
  id: string;
  order: number;
  carga: number | null;
  repeticiones: number | null;
  duracion: number | null;
};

export type PlanExerciseContent = {
  id: string;
  exerciseId: string;
  order: number;
  /** Ejercicio resuelto por el servidor, aunque esté retirado o archivado. */
  exercise: {
    id: string;
    name: string;
    recordingMode: PlanRecordingMode;
    available: boolean;
    provenance: "catalogo" | "personalizado";
  };
  series: PlanSeriesGoal[];
};

/**
 * Entrenamiento planificado de un Plan: ocupa un día de una semana y usa una
 * Rutina mediante referencia viva o un Entrenamiento específico independiente.
 * `content` es el contenido resuelto por el servidor: el actual de la Rutina
 * o el del Entrenamiento específico.
 */
export type PlanTraining = {
  id: string;
  day: number;
  source: "rutina" | "especifico";
  routineId: string | null;
  routine: { id: string; name: string; archived: boolean } | null;
  content: PlanExerciseContent[];
};

export type PlanWeek = {
  id: string;
  order: number;
  trainings: PlanTraining[];
};

/** Documento canónico de un Plan, tal como se entrega al listar y al obtener. */
export type PlanItem = {
  id: string;
  name: string;
  status: PlanStatus;
  revision: number;
  weeks: PlanWeek[];
  createdAt: string;
  updatedAt: string;
};

export type PlanInputSeries = {
  id?: string;
  carga?: number | null;
  repeticiones?: number | null;
  duracion?: number | null;
};

export type PlanInputExercise = {
  id?: string;
  exerciseId: string;
  series: PlanInputSeries[];
};

export type PlanInputTraining = {
  id?: string;
  day: number;
  source: "rutina" | "especifico";
  routineId?: string | null;
  specific: PlanInputExercise[];
};

export type PlanInputWeek = {
  id?: string;
  trainings: PlanInputTraining[];
};

export type PlanInput = {
  name: string;
  weeks: PlanInputWeek[];
};

export const dayLabels = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

export const planStatusLabels: Record<PlanStatus, string> = {
  borrador: "Borrador",
  activo: "Activo",
  completado: "Completado",
};

export async function listPlans(): Promise<{ items: PlanItem[] }> {
  return apiGet<{ items: PlanItem[] }>("/api/plans");
}

export async function getPlan(id: string): Promise<{ plan: PlanItem }> {
  return apiGet<{ plan: PlanItem }>(`/api/plans/${id}`);
}

export async function createPlan(input: PlanInput): Promise<{ plan: PlanItem }> {
  return apiPost<{ plan: PlanItem }>("/api/plans", input);
}

export async function replacePlan(
  id: string,
  revision: number,
  input: PlanInput,
): Promise<{ plan: PlanItem }> {
  return apiPut<{ plan: PlanItem }>(`/api/plans/${id}`, {
    revision,
    ...input,
  });
}

export async function deletePlan(id: string): Promise<{ deleted: true }> {
  return apiDelete<{ deleted: true }>(`/api/plans/${id}`);
}
