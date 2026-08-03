import { apiDelete, apiGet, apiPost, apiPut } from "../../../shared/http/api-client";

export type PlanStatus = "borrador" | "activo" | "completado";

/** Estado de un Entrenamiento planificado de un Plan activo o completado. */
export type PlanTrainingStatus = "pendiente" | "omitido" | null;

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
 * o el del Entrenamiento específico. `plannedDate` y `status` solo existen
 * después de activar el Plan.
 */
export type PlanTraining = {
  id: string;
  day: number;
  plannedDate: string | null;
  status: PlanTrainingStatus;
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
  /** Lunes de la primera semana (YYYY-MM-DD); solo un Plan activo o completado lo tiene. */
  startDate: string | null;
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

/**
 * Activa un Plan borrador fijando el lunes de la primera semana: el servidor
 * calcula las Fechas previstas y deja todos los Entrenamientos pendientes.
 */
export async function activatePlan(id: string, startDate: string): Promise<{ plan: PlanItem }> {
  return apiPost<{ plan: PlanItem }>(`/api/plans/${id}/activate`, { startDate });
}

/** Completa un Plan activo: convierte los días pendientes en omitidos. */
export async function completePlan(id: string): Promise<{ plan: PlanItem }> {
  return apiPost<{ plan: PlanItem }>(`/api/plans/${id}/complete`, {});
}

/** Omite un Entrenamiento planificado pendiente de un Plan activo. */
export async function omitTraining(
  planId: string,
  trainingId: string,
): Promise<{ plan: PlanItem }> {
  return apiPost<{ plan: PlanItem }>(
    `/api/plans/${planId}/trainings/${trainingId}/omit`,
    {},
  );
}

/** Devuelve a pendiente un Entrenamiento omitido de un Plan activo. */
export async function restoreTraining(
  planId: string,
  trainingId: string,
): Promise<{ plan: PlanItem }> {
  return apiPost<{ plan: PlanItem }>(
    `/api/plans/${planId}/trainings/${trainingId}/restore`,
    {},
  );
}

/** Duplica cualquier Plan como borrador sin fechas, estados ni Sesiones. */
export async function duplicatePlan(
  id: string,
  name?: string,
): Promise<{ plan: PlanItem }> {
  return apiPost<{ plan: PlanItem }>(`/api/plans/${id}/duplicate`, name ? { name } : {});
}

/**
 * Fecha de dominio `YYYY-MM-DD` en formato corto español («4 ago»), sin
 * depender de la zona horaria del navegador: las fechas se interpretan en UTC.
 */
export function formatDomainDate(value: string): string {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(date);
}

function addDomainDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Rango del calendario de un Plan activo o completado: del lunes de la
 * primera semana al domingo de la última («4 ago – 17 ago»). Los borradores
 * no tienen calendario.
 */
export function planCalendarRange(plan: PlanItem): string | null {
  if (plan.status === "borrador" || plan.startDate === null) {
    return null;
  }
  const last = addDomainDays(plan.startDate, (plan.weeks.length - 1) * 7 + 6);
  return `${formatDomainDate(plan.startDate)} – ${formatDomainDate(last)}`;
}
