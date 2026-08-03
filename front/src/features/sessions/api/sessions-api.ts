import { apiGet, apiPost, apiPut } from "../../../shared/http/api-client";
import type { RecordingMode } from "../../exercises/api/exercises-api";

/**
 * Aparición de un Ejercicio dentro del documento canónico de una Sesión.
 * Incluye los datos del Ejercicio resuelto para presentar la Sesión sin
 * consultas adicionales por aparición.
 */
export type SessionExerciseDocument = {
  id: string;
  exerciseId: string;
  sortOrder: number;
  exercise: {
    id: string;
    name: string;
    recordingMode: RecordingMode;
    provenance: "catalogo" | "personalizado";
  };
};

/**
 * Documento canónico de una Sesión tal como lo entrega la API: el estado
 * confirmado completo con su revisión entera.
 */
export type SessionDocument = {
  id: string;
  revision: number;
  origin: "libre";
  status: "activa";
  datePerformed: string;
  lastExerciseId: string | null;
  exercises: SessionExerciseDocument[];
  startedAt: string;
  updatedAt: string;
};

/** Entrada de aparición para sustituir el agregado: sin `id` es nueva. */
export type SessionExerciseInput = { id?: string; exerciseId: string };

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

/** Nombre mostrado de una Sesión según su Origen de sesión. */
export function sessionTitle(session: SessionDocument): string {
  return session.origin === "libre" ? "Sesión libre" : "Sesión";
}

/** Progreso de una Sesión para el acceso persistente y la cabecera. */
export function sessionProgressLabel(session: SessionDocument): string {
  const count = session.exercises.length;
  if (count === 0) {
    return "Sin ejercicios";
  }
  return count === 1 ? "1 ejercicio" : `${count} ejercicios`;
}
