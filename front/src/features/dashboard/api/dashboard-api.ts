import { apiGet } from "../../../shared/http/api-client";
import type { RecordedMax, RecordingMode } from "../../exercises/api/exercises-api";

/**
 * Acción prioritaria del bloque «Entrenamiento actual» de Inicio (spec
 * «Inicio, navegación y presentación adaptable»): continuar la Sesión activa,
 * iniciar el próximo Entrenamiento planificado pendiente o iniciar una Sesión
 * libre. La API entrega la referencia opaca necesaria para cada acción; el
 * cliente no reconstruye reglas de dominio.
 */
export type TrainingAction =
  | {
      kind: "continuar";
      sessionId: string;
      name: string;
      progress: { completadas: number; total: number };
    }
  | {
      kind: "iniciar-plan";
      planId: string;
      trainingId: string;
      planName: string;
      name: string;
      plannedDate: string | null;
      day: number;
    }
  | { kind: "iniciar-libre" };

/** Progreso de un Plan o de una de sus semanas, calculado por la API. */
export type PlanProgress = {
  realizados: number;
  omitidos: number;
  pendientes: number;
  total: number;
  /** Avance con precisión completa: `(realizados + omitidos) / total × 100`. */
  avance: number;
  /** Cumplimiento con precisión completa: `realizados / total × 100`. */
  cumplimiento: number;
  /** Avance redondeado al entero más próximo para presentación. */
  avanceRedondeado: number;
  /** Cumplimiento redondeado al entero más próximo para presentación. */
  cumplimientoRedondeado: number;
};

/** Progreso de una semana del Plan activo, en orden. */
export type PlanWeekSummary = {
  order: number;
  progress: PlanProgress;
};

/** Entrenamiento planificado de la semana actual del Plan activo. */
export type PlanWeekTrainingSummary = {
  id: string;
  day: number;
  name: string;
  plannedDate: string | null;
  status: "pendiente" | "realizado" | "omitido";
};

/** Resumen del Plan activo para el bloque «Plan activo» de Inicio. */
export type ActivePlanSummary = {
  id: string;
  name: string;
  startDate: string;
  currentWeek: number;
  weeks: PlanWeekSummary[];
  currentWeekTrainings: PlanWeekTrainingSummary[];
  progress: PlanProgress;
};

/** Barra de una semana del bloque «Volumen semanal»: lunes y total en kg·rep. */
export type WeeklyVolumeWeek = {
  weekStart: string;
  total: number;
};

export type WeeklyVolume = {
  currentWeekStart: string;
  currentTotal: number;
  previousTotal: number;
  /** Comparación porcentual frente a la semana anterior; nula sin volumen previo. */
  changePercent: number | null;
  weeks: WeeklyVolumeWeek[];
};

/** Métrica propia de la Forma de registro que presenta la evolución. */
export type EvolutionMetric = "carga_maxima" | "repeticiones_totales" | "duracion_total";

/** Opción del selector de evolución: un Ejercicio con analítica disponible. */
export type EvolutionOption = {
  id: string;
  name: string;
  recordingMode: RecordingMode;
  metric: EvolutionMetric | null;
};

/** Punto de la serie temporal de evolución: una Sesión finalizada. */
export type EvolutionPoint = {
  sessionId: string;
  date: string;
  value: number;
  rpeMedio: number | null;
  intensidadRelativaMax: number | null;
};

/** Serie temporal de un Ejercicio con su métrica propia de Forma de registro. */
export type ExerciseEvolution = {
  exerciseId: string;
  name: string;
  recordingMode: RecordingMode;
  metric: EvolutionMetric | null;
  points: EvolutionPoint[];
};

/**
 * Contrato de `GET /api/dashboard` (ticket 33): la lectura única que compone
 * los cinco bloques de Inicio. El cliente la presenta sin recalcular ninguna
 * regla de dominio: las métricas llegan agregadas por la API.
 */
export type DashboardResponse = {
  training: TrainingAction;
  activePlan: ActivePlanSummary | null;
  weeklyVolume: WeeklyVolume;
  recentRecordedMaxes: RecordedMax[];
  evolution: {
    options: EvolutionOption[];
    current: ExerciseEvolution | null;
  };
};

/**
 * Clave de consulta de Inicio para una selección del bloque «Evolución»: el
 * Ejercicio elegido viaja en la consulta `?exerciseId=` de la lectura única.
 * Otras mutaciones invalidan Inicio con el prefijo `["dashboard"]`.
 */
export const dashboardQueryKeyFor = (exerciseId: string | null) =>
  ["dashboard", { exerciseId: exerciseId ?? null }] as const;

export async function getDashboard(exerciseId?: string): Promise<DashboardResponse> {
  const query = exerciseId ? `?exerciseId=${encodeURIComponent(exerciseId)}` : "";
  return apiGet<DashboardResponse>(`/api/dashboard${query}`);
}
