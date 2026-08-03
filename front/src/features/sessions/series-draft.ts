import type { RecordingMode } from "../exercises/api/exercises-api";
import type { SeriesMagnitudes, SessionSeriesDocument } from "./api/sessions-api";

/**
 * Borrador de una Serie pendiente en el formulario: valores escritos como
 * texto. Los Objetivos inicializan los campos y la entrada parcial solo
 * existe aquí —el servidor es la autoridad y nada se guarda hasta completar.
 */
export type SeriesDraft = {
  carga: string;
  repeticiones: string;
  duracion: string;
  rpe: string;
};

export type SeriesMagnitude = "carga" | "repeticiones" | "duracion";

/** Campos de objetivo y de resultado admitidos por cada Forma de registro. */
export const seriesFieldsPerMode: Record<RecordingMode, SeriesMagnitude[]> = {
  fuerza_con_carga: ["carga", "repeticiones"],
  repeticiones_sin_carga: ["repeticiones"],
  tiempo_por_serie: ["duracion"],
  cardio_continuo: ["duracion"],
};

export const magnitudeLabels: Record<SeriesMagnitude, string> = {
  carga: "Carga (kg)",
  repeticiones: "Repeticiones",
  duracion: "Duración (seg)",
};

const requiredResultMessages: Record<SeriesMagnitude, string> = {
  carga: "La carga es obligatoria para completar la Serie.",
  repeticiones: "Las repeticiones son obligatorias para completar la Serie.",
  duracion: "La duración es obligatoria para completar la Serie.",
};

export function emptyDraft(): SeriesDraft {
  return { carga: "", repeticiones: "", duracion: "", rpe: "" };
}

/** Borrador inicial de una Serie: los Objetivos inicializan los campos de resultado. */
export function draftFromSeries(series: SessionSeriesDocument): SeriesDraft {
  return {
    carga: series.goal.carga === null ? "" : String(series.goal.carga),
    repeticiones: series.goal.repeticiones === null ? "" : String(series.goal.repeticiones),
    duracion: series.goal.duracion === null ? "" : String(series.goal.duracion),
    rpe: "",
  };
}

function parseMagnitude(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : "invalid";
}

function magnitudeLimitMessage(magnitude: SeriesMagnitude, value: number): string | null {
  switch (magnitude) {
    case "carga":
      if (value < 0 || value > 9999.99) {
        return "La carga admite de 0 a 9999,99 kg.";
      }
      if (Number(value.toFixed(2)) !== value) {
        return "La carga admite como máximo dos decimales.";
      }
      return null;
    case "repeticiones":
      return Number.isInteger(value) && value >= 1 && value <= 9999
        ? null
        : "Las repeticiones admiten enteros de 1 a 9999.";
    case "duracion":
      return Number.isInteger(value) && value >= 1 && value <= 359999
        ? null
        : "La duración admite enteros de 1 a 359999 segundos.";
  }
}

/** Límites del RPE opcional: de 1 a 10 en pasos de 0,5. */
export function rpeLimitMessage(value: number): string | null {
  if (value < 1 || value > 10) {
    return "El RPE admite de 1 a 10.";
  }
  if (!Number.isInteger(value * 2)) {
    return "El RPE admite pasos de 0,5.";
  }
  return null;
}

/**
 * Validación inmediata del borrador al completar: todos los valores exigidos
 * por la Forma deben existir y cumplir sus límites, y el RPE opcional debe
 * respetar sus pasos. El servidor sigue siendo la autoridad final.
 */
export function validateCompletion(
  mode: RecordingMode,
  draft: SeriesDraft,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const magnitude of seriesFieldsPerMode[mode]) {
    const raw = draft[magnitude] ?? "";
    if (raw.trim().length === 0) {
      errors[magnitude] = requiredResultMessages[magnitude];
      continue;
    }
    const parsed = parseMagnitude(raw);
    if (parsed === "invalid") {
      errors[magnitude] = "Introduce un número válido.";
      continue;
    }
    if (parsed === null) {
      continue;
    }
    const limit = magnitudeLimitMessage(magnitude, parsed);
    if (limit) {
      errors[magnitude] = limit;
    }
  }

  const rpeRaw = draft.rpe?.trim() ?? "";
  if (rpeRaw.length > 0) {
    const parsed = parseMagnitude(rpeRaw);
    if (parsed === "invalid") {
      errors.rpe = "Introduce un número válido.";
    } else if (parsed !== null) {
      const limit = rpeLimitMessage(parsed);
      if (limit) {
        errors.rpe = limit;
      }
    }
  }

  return errors;
}

/** Resultado de serie construido desde el borrador para la Forma de registro. */
export function resultFromDraft(mode: RecordingMode, draft: SeriesDraft): SeriesMagnitudes {
  const fields = seriesFieldsPerMode[mode];
  return {
    carga: fields.includes("carga") ? Number(draft.carga) : null,
    repeticiones: fields.includes("repeticiones") ? Number(draft.repeticiones) : null,
    duracion: fields.includes("duracion") ? Number(draft.duracion) : null,
  };
}

/** RPE opcional del borrador, o ausencia si quedó vacío. */
export function rpeFromDraft(draft: SeriesDraft): number | null {
  const raw = draft.rpe?.trim() ?? "";
  if (raw.length === 0) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
