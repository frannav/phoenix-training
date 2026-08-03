import type { RecordingMode } from "../db/schema";

/** Magnitudes con las que se prescribe y registra un Ejercicio según su Forma de registro. */
export type SeriesTarget = "carga" | "repeticiones" | "duracion";

/**
 * Objetivos admitidos por cada Forma de registro (spec «Series y Formas de
 * registro»). La misma tabla rige Rutinas, Entrenamientos específicos de
 * Planes y Objetivos de serie de Sesiones.
 */
export const allowedTargetFields: Record<RecordingMode, SeriesTarget[]> = {
  fuerza_con_carga: ["carga", "repeticiones"],
  repeticiones_sin_carga: ["repeticiones"],
  tiempo_por_serie: ["duracion"],
  cardio_continuo: ["duracion"],
};

/**
 * Límites de dominio de cada objetivo (spec «Series y Formas de registro»):
 * la carga admite de 0 a 9999,99 kg con dos decimales como máximo; las
 * repeticiones, enteros de 1 a 9999; la duración, enteros de 1 a 359999
 * segundos. Devuelve el mensaje cuando el valor no cumple su límite.
 */
export function targetLimitMessage(target: SeriesTarget, value: number): string | null {
  switch (target) {
    case "carga":
      if (!Number.isFinite(value)) {
        return "La carga debe ser un número.";
      }
      if (value < 0 || value > 9999.99) {
        return "La carga admite de 0 a 9999,99 kg.";
      }
      if (Number(value.toFixed(2)) !== value) {
        return "La carga admite como máximo dos decimales.";
      }
      return null;
    case "repeticiones":
      if (!Number.isInteger(value) || value < 1 || value > 9999) {
        return "Las repeticiones admiten enteros de 1 a 9999.";
      }
      return null;
    case "duracion":
      if (!Number.isInteger(value) || value < 1 || value > 359999) {
        return "La duración admite enteros de 1 a 359999 segundos.";
      }
      return null;
  }
}

/**
 * Clave de campo con rutas de hijo legibles (`weeks[0].trainings[1].carga`):
 * el contrato que el servidor devuelve en `fields` y que el cliente usa para
 * mostrar los errores junto al campo afectado.
 */
export function fieldKey(...segments: Array<string | number>): string {
  let key = "";
  for (const segment of segments) {
    if (typeof segment === "number" || /^\d+$/.test(segment)) {
      key += `[${segment}]`;
    } else {
      key += key.length === 0 ? segment : `.${segment}`;
    }
  }
  return key;
}
