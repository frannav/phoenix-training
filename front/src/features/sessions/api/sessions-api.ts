import { apiDelete, apiGet, apiPost, apiPut } from "../../../shared/http/api-client";
import type { RecordingMode } from "../../exercises/api/exercises-api";

/** Estado de una Serie dentro de la Sesión activa. */
export type SeriesStatus = "pendiente" | "completada" | "omitida";

/** Magnitudes de una Serie: carga, repeticiones y duración, nulas si no aplican. */
export type SeriesMagnitudes = {
  carga: number | null;
  repeticiones: number | null;
  duracion: number | null;
};

/**
 * Serie del documento canónico de una Sesión. Los Objetivos son opcionales e
 * independientes y no determinan el estado; el Resultado solo existe en una
 * Serie completada y el RPE solo puede acompañar a un resultado.
 */
export type SessionSeriesDocument = {
  id: string;
  order: number;
  status: SeriesStatus;
  added: boolean;
  goal: SeriesMagnitudes;
  result: SeriesMagnitudes;
  rpe: number | null;
};

/** Entrada de Serie para sustituir el agregado: sin `id` es nueva. */
export type SeriesInput = {
  id?: string;
  status: SeriesStatus;
  goal: SeriesMagnitudes | null;
  result: SeriesMagnitudes | null;
  rpe?: number | null;
};

/** Origen de una Sesión: un Entrenamiento planificado, una Rutina o ninguno (libre). */
export type SessionOrigin = "libre" | "rutina" | "plan";

/**
 * Aparición de un Ejercicio dentro del documento canónico de una Sesión.
 * Incluye los datos del Ejercicio resuelto y sus Series para presentar la
 * Sesión sin consultas adicionales por aparición.
 */
export type SessionExerciseDocument = {
  id: string;
  exerciseId: string;
  sortOrder: number;
  /** Aparición añadida durante la Sesión (`true`) o prevista del origen (`false`). */
  added: boolean;
  exercise: {
    id: string;
    name: string;
    recordingMode: RecordingMode;
    provenance: "catalogo" | "personalizado";
  };
  series: SessionSeriesDocument[];
};

/** Estado de una Sesión: activa mientras se registra o finalizada como registro del Historial. */
export type SessionStatus = "activa" | "finalizada";

/**
 * Documento canónico de una Sesión tal como lo entrega la API: el estado
 * confirmado completo con su revisión entera. La Sesión conserva la
 * referencia de su Origen de sesión y sus dos fechas por separado: la Fecha
 * realizada propia y la Fecha prevista del Entrenamiento planificado de
 * origen.
 */
export type SessionDocument = {
  id: string;
  revision: number;
  origin: SessionOrigin;
  status: SessionStatus;
  datePerformed: string;
  /** Fecha prevista del Entrenamiento planificado de origen; solo un origen «plan» la tiene. */
  plannedDate: string | null;
  /** Origen de sesión: Rutina desde la que se inició, o nulo. */
  routineId: string | null;
  /** Origen de sesión: Entrenamiento planificado desde el que se inició, o nulo. */
  planTrainingId: string | null;
  lastExerciseId: string | null;
  exercises: SessionExerciseDocument[];
  startedAt: string;
  updatedAt: string;
};

/** Entrada de aparición para sustituir el agregado: sin `id` es nueva. */
export type SessionExerciseInput = {
  id?: string;
  exerciseId: string;
  series: SeriesInput[];
};

/** Clave compartida de la Sesión activa: AppShell e Inicio leen y actualizan el mismo valor. */
export const activeSessionQueryKey = ["sessions", "active"] as const;

export const sessionDetailQueryKey = (id: string) => ["sessions", "detail", id] as const;

export async function getActiveSession(): Promise<{ session: SessionDocument | null }> {
  const body = await apiGet<{ session: SessionDocument | null }>("/api/sessions/active");
  // Una ausencia inequívoca es `session: null`; cualquier forma inesperada se
  // trata como ausencia para no inventar una Sesión en la interfaz.
  return { session: body.session ?? null };
}

export async function startFreeSession(): Promise<{ session: SessionDocument }> {
  return apiPost<{ session: SessionDocument }>("/api/sessions", { origin: "libre" });
}

export async function getSession(id: string): Promise<{ session: SessionDocument }> {
  return apiGet<{ session: SessionDocument }>(`/api/sessions/${id}`);
}

export async function saveSession(
  id: string,
  revision: number,
  exercises: SessionExerciseInput[],
): Promise<{ session: SessionDocument }> {
  return apiPut<{ session: SessionDocument }>(`/api/sessions/${id}`, {
    revision,
    exercises,
  });
}

/** Finaliza la Sesión activa: exige al menos una Serie completada y omite las pendientes. */
export async function finalizeSession(
  id: string,
  revision: number,
): Promise<{ session: SessionDocument }> {
  return apiPost<{ session: SessionDocument }>(`/api/sessions/${id}/finalize`, {
    revision,
  });
}

/** Elimina la Sesión activa con su revisión para la concurrencia optimista. */
export async function deleteSession(
  id: string,
  revision: number,
): Promise<{ deleted: true }> {
  return apiDelete<{ deleted: true }>(`/api/sessions/${id}?revision=${revision}`);
}

/** Nombre mostrado de una Sesión según su Origen de sesión. */
export function sessionTitle(session: SessionDocument): string {
  switch (session.origin) {
    case "rutina":
      return "Sesión de Rutina";
    case "plan":
      return "Sesión del Plan";
    default:
      return "Sesión libre";
  }
}

/** Progreso de una Sesión para el acceso persistente y la cabecera. */
export function sessionProgressLabel(session: SessionDocument): string {
  const count = session.exercises.length;
  if (count === 0) {
    return "Sin ejercicios";
  }
  return count === 1 ? "1 ejercicio" : `${count} ejercicios`;
}

/**
 * Recuento de Series por estado dentro de una lista de Series de la Sesión.
 */
export function countSeriesByStatus(series: SessionSeriesDocument[]): {
  completada: number;
  omitida: number;
  pendiente: number;
} {
  let completada = 0;
  let omitida = 0;
  let pendiente = 0;
  for (const entry of series) {
    if (entry.status === "completada") {
      completada += 1;
    } else if (entry.status === "omitida") {
      omitida += 1;
    } else {
      pendiente += 1;
    }
  }
  return { completada, omitida, pendiente };
}

/**
 * Progreso de una aparición para el botón plegable: series completadas,
 * omitidas y pendientes de un Ejercicio.
 */
export function occurrenceProgressLabel(occurrence: SessionExerciseDocument): string {
  if (occurrence.series.length === 0) {
    return "Sin Series";
  }
  const { completada, omitida, pendiente } = countSeriesByStatus(occurrence.series);
  const parts = [`${completada} completadas`];
  if (omitida > 0) {
    parts.push(`${omitida} omitidas`);
  }
  if (pendiente > 0) {
    parts.push(`${pendiente} pendientes`);
  }
  return parts.join(" · ");
}

/** Resumen de Series de toda la Sesión para la cabecera y el resumen al finalizar. */
export function sessionSeriesSummary(session: SessionDocument): string {
  const series = session.exercises.flatMap((occurrence) => occurrence.series);
  if (series.length === 0) {
    return "Sin Series";
  }
  const { completada, omitida, pendiente } = countSeriesByStatus(series);
  const parts = [];
  if (completada > 0) {
    parts.push(`${completada} completadas`);
  }
  if (omitida > 0) {
    parts.push(`${omitida} omitidas`);
  }
  if (pendiente > 0) {
    parts.push(`${pendiente} pendientes`);
  }
  return parts.join(" · ");
}
