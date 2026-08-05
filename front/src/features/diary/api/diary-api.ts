import { apiGet } from "../../../shared/http/api-client";
import type { SessionDocument } from "../../sessions/api/sessions-api";

/**
 * Contrato del Diario de entrenamiento: `GET /api/diary` (calendario mensual)
 * y `GET /api/diary/day` (detalle de un día). El backend entrega los días con
 * sus Sesiones finalizadas y el volumen diario ya agregado con la regla de la
 * analítica; el cliente compone la rejilla y presenta sin recalcular reglas
 * de dominio.
 */

/** Sesión finalizada de un día para la celda del calendario. */
export type DiaryMonthSession = {
  id: string;
  /** Nombre presentable según el Origen de sesión (Plan, Rutina o genérico). */
  title: string;
};

/** Resumen de un día del mes: Sesiones finalizadas y volumen diario en kg·rep. */
export type DiaryDaySummary = {
  /** Fecha de dominio YYYY-MM-DD. */
  date: string;
  sessions: DiaryMonthSession[];
  volumeKgRep: number;
};

/** Calendario mensual: días del mes en orden cronológico, incluidos los vacíos. */
export type MonthlyDiary = {
  year: number;
  /** Mes 1-based (enero = 1 … diciembre = 12). */
  month: number;
  days: DiaryDaySummary[];
};

/** Sesión del detalle de un día: el documento canónico más el Origen resuelto. */
export type DiaryDaySession = SessionDocument & {
  title: string;
  /** Nombre del Plan de origen; nulo cuando la Sesión no viene de un Plan. */
  planName: string | null;
  /** Nombre de la Rutina de origen; nulo si no la hay. */
  routineName: string | null;
  volumeKgRep: number;
};

/** Detalle de un día del Diario. */
export type DiaryDay = {
  /** Fecha de dominio YYYY-MM-DD. */
  date: string;
  volumeKgRep: number;
  sessions: DiaryDaySession[];
};

/** Clave de consulta del calendario mensual para un mes concreto. */
export const diaryMonthQueryKey = (year: number, month: number) =>
  ["diary", "month", { year, month }] as const;

/** Clave de consulta del detalle de un día concreto. */
export const diaryDayQueryKey = (date: string) => ["diary", "day", date] as const;

export async function getDiaryMonth(year: number, month: number): Promise<MonthlyDiary> {
  return apiGet<MonthlyDiary>(`/api/diary?year=${year}&month=${month}`);
}

export async function getDiaryDay(date: string): Promise<DiaryDay> {
  return apiGet<DiaryDay>(`/api/diary/day?date=${encodeURIComponent(date)}`);
}

/** Formato de mes `AAAA-MM` para la consulta de navegación del calendario. */
export function monthParamOf(year: number, month: number): string {
  return `${year}-${`${month}`.padStart(2, "0")}`;
}
