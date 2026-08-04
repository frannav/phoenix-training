/**
 * Utilidades puras de presentación compartidas por varias funcionalidades.
 * Solo se comparten primitivas que aparecen realmente en varias áreas
 * (spec «Arquitectura del frontend»); estas dos viven primero en el área de
 * Ejercicios y ahora también las usa el dashboard de Inicio.
 */

/** Presenta una cantidad en español: coma decimal y separador de miles. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
}

/** La carga se presenta en español: coma decimal y unidades en kilogramos. */
export const formatLoad = formatNumber;

/** La fecha de dominio YYYY-MM-DD se presenta como DD/MM/AAAA. */
export function formatDomainDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
