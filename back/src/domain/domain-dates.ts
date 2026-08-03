/**
 * Fechas de dominio en formato `YYYY-MM-DD` (spec «API y concurrencia»):
 * son fechas independientes de los instantes técnicos ISO 8601 y las
 * semanas van de lunes a domingo. Todos los cálculos usan UTC para que una
 * Fecha prevista nunca dependa de la zona horaria del servidor.
 */

const DOMAIN_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha de dominio `YYYY-MM-DD` a partir de un instante técnico (UTC). */
export function toDomainDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Interpreta una fecha de dominio como instante UTC a medianoche. Devuelve
 * `null` cuando el valor no tiene el formato o no es una fecha real
 * (p. ej. `2025-02-30`).
 */
export function parseDomainDate(value: string): Date | null {
  if (!DOMAIN_DATE_PATTERN.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day;
  return valid ? date : null;
}

/** Suma días a una fecha de dominio y devuelve otra fecha de dominio. */
export function addDomainDays(value: string, days: number): string | null {
  const date = parseDomainDate(value);
  if (!date) {
    return null;
  }
  return toDomainDate(new Date(date.getTime() + days * DAY_MS));
}

/** Comprueba que la fecha de dominio caiga en lunes (día 1 de la semana UTC). */
export function isMonday(value: string): boolean {
  const date = parseDomainDate(value);
  return date !== null && date.getUTCDay() === 1;
}

/**
 * Fecha prevista de un Entrenamiento planificado: el lunes de la primera
 * semana más `weekPosition * 7 + day` días (las semanas van de lunes a
 * domingo y el día 0 es el lunes). Solo se calcula al activar el Plan.
 */
export function plannedDateFor(planStartDate: string, weekPosition: number, day: number): string | null {
  return addDomainDays(planStartDate, weekPosition * 7 + day);
}
