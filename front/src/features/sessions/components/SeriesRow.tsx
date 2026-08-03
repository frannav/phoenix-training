import type { RecordingMode } from "../../exercises/api/exercises-api";
import type { SessionSeriesDocument } from "../api/sessions-api";
import {
  magnitudeLabels,
  seriesFieldsPerMode,
  type SeriesDraft,
  type SeriesMagnitude,
} from "../series-draft";
import styles from "./SeriesRow.module.css";

type SeriesRowProps = {
  series: SessionSeriesDocument;
  mode: RecordingMode;
  draft: SeriesDraft;
  errors: Record<string, string>;
  saving: boolean;
  onDraftChange: (field: string, value: string) => void;
  onComplete: () => void;
  onOmit: () => void;
  /** Omitir una Serie completada: elimina resultado y RPE y exige confirmación en la página. */
  onOmitCompleted: () => void;
  /** Devolver una Serie completada a pendiente: elimina resultado y RPE y exige confirmación. */
  onReturnToPending: () => void;
  onRestore: () => void;
  /** Eliminar una Serie añadida; la página confirma cuando contiene resultado. */
  onDelete: () => void;
};

const statusLabels = {
  pendiente: "Pendiente",
  completada: "Completada",
  omitida: "Omitida",
} as const;

const statusIcons = {
  pendiente: "○",
  completada: "✓",
  omitida: "⊘",
} as const;

/** Texto del resultado de una Serie completada según su Forma de registro. */
function resultText(series: SessionSeriesDocument, mode: RecordingMode): string {
  const parts: string[] = [];
  if (mode === "fuerza_con_carga") {
    parts.push(`${series.result.carga} kg × ${series.result.repeticiones} rep`);
  } else if (mode === "repeticiones_sin_carga") {
    parts.push(`${series.result.repeticiones} rep`);
  } else {
    parts.push(`${series.result.duracion} s`);
  }
  if (series.rpe !== null) {
    parts.push(`RPE ${String(series.rpe).replace(".", ",")}`);
  }
  return parts.join(" · ");
}

/** Texto de los objetivos de una Serie pendiente u omitida, si los tiene. */
function goalText(series: SessionSeriesDocument, mode: RecordingMode): string | null {
  const pieces: string[] = [];
  if (mode === "fuerza_con_carga" || mode === "repeticiones_sin_carga") {
    if (series.goal.carga !== null) {
      pieces.push(`${series.goal.carga} kg`);
    }
    if (series.goal.repeticiones !== null) {
      pieces.push(`${series.goal.repeticiones} rep`);
    }
  } else if (series.goal.duracion !== null) {
    pieces.push(`${series.goal.duracion} s`);
  }
  return pieces.length > 0 ? `Objetivo: ${pieces.join(" · ")}` : null;
}

/**
 * Fila compacta de una Serie dentro del Ejercicio desplegado: número, estado
 * (icono, texto y estilo), campos propios de la Forma de registro, RPE
 * opcional y las acciones completar, omitir o restaurar. Los errores se
 * muestran junto al campo afectado y una entrada parcial nunca se envía.
 */
export function SeriesRow({
  series,
  mode,
  draft,
  errors,
  saving,
  onDraftChange,
  onComplete,
  onOmit,
  onOmitCompleted,
  onReturnToPending,
  onRestore,
  onDelete,
}: SeriesRowProps) {
  const order = series.order + 1;
  const fields = seriesFieldsPerMode[mode];

  if (series.status === "completada") {
    return (
      <div
        className={styles.row}
        data-status="completada"
        role="group"
        aria-label={`Serie ${order}`}
      >
        <div className={styles.rowHeader}>
          <span className={styles.seriesNumber}>Serie {order}</span>
          <span className={styles.statusBadge} data-status="completada">
            <span aria-hidden="true" className={styles.statusIcon}>
              {statusIcons.completada}
            </span>
            {statusLabels.completada}
          </span>
        </div>
        <p className={styles.result}>{resultText(series, mode)}</p>
        <div className={styles.actions}>
          <button
            className={styles.omitButton}
            type="button"
            onClick={onOmitCompleted}
            disabled={saving}
          >
            Omitir
          </button>
          <button
            className={styles.pendingButton}
            type="button"
            onClick={onReturnToPending}
            disabled={saving}
          >
            Volver a pendiente
          </button>
          {series.added && (
            <button
              className={styles.deleteButton}
              type="button"
              onClick={onDelete}
              disabled={saving}
            >
              Eliminar
            </button>
          )}
        </div>
      </div>
    );
  }

  if (series.status === "omitida") {
    return (
      <div
        className={styles.row}
        data-status="omitida"
        role="group"
        aria-label={`Serie ${order}`}
      >
        <div className={styles.rowHeader}>
          <span className={styles.seriesNumber}>Serie {order}</span>
          <span className={styles.statusBadge} data-status="omitida">
            <span aria-hidden="true" className={styles.statusIcon}>
              {statusIcons.omitida}
            </span>
            {statusLabels.omitida}
          </span>
        </div>
        {goalText(series, mode) && (
          <p className={styles.goal}>{goalText(series, mode)}</p>
        )}
        <div className={styles.actions}>
          <button
            className={styles.restoreButton}
            type="button"
            onClick={onRestore}
            disabled={saving}
          >
            Restaurar
          </button>
          {series.added && (
            <button
              className={styles.deleteButton}
              type="button"
              onClick={onDelete}
              disabled={saving}
            >
              Eliminar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.row}
      data-status="pendiente"
      role="group"
      aria-label={`Serie ${order}`}
    >
      <div className={styles.rowHeader}>
        <span className={styles.seriesNumber}>Serie {order}</span>
        <span className={styles.statusBadge} data-status="pendiente">
          <span aria-hidden="true" className={styles.statusIcon}>
            {statusIcons.pendiente}
          </span>
          {statusLabels.pendiente}
        </span>
      </div>

      <div className={styles.fields}>
        {fields.map((magnitude: SeriesMagnitude) => {
          const error = errors[magnitude];
          const errorId = `${series.id}-${magnitude}-error`;
          return (
            <label className={styles.field} key={magnitude}>
              <span className={styles.fieldLabel}>{magnitudeLabels[magnitude]}</span>
              <input
                className={styles.fieldInput}
                data-field={magnitude}
                inputMode={magnitude === "carga" || magnitude === "duracion" ? "decimal" : "numeric"}
                value={draft[magnitude]}
                onChange={(event) => onDraftChange(magnitude, event.target.value)}
                aria-invalid={error !== undefined}
                aria-describedby={error !== undefined ? errorId : undefined}
              />
              {error && (
                <span id={errorId} className={styles.fieldError} role="alert">
                  <span aria-hidden="true">⚠ </span>
                  {error}
                </span>
              )}
            </label>
          );
        })}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>RPE (1-10)</span>
          <input
            className={styles.fieldInput}
            data-field="rpe"
            inputMode="decimal"
            value={draft.rpe}
            onChange={(event) => onDraftChange("rpe", event.target.value)}
            aria-invalid={errors.rpe !== undefined}
            aria-describedby={errors.rpe !== undefined ? `${series.id}-rpe-error` : undefined}
          />
          {errors.rpe && (
            <span id={`${series.id}-rpe-error`} className={styles.fieldError} role="alert">
              <span aria-hidden="true">⚠ </span>
              {errors.rpe}
            </span>
          )}
        </label>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.completeButton}
          type="button"
          onClick={onComplete}
          disabled={saving}
        >
          Completar
        </button>
        <button
          className={styles.omitButton}
          type="button"
          onClick={onOmit}
          disabled={saving}
        >
          Omitir
        </button>
        {series.added && (
          <button
            className={styles.deleteButton}
            type="button"
            onClick={onDelete}
            disabled={saving}
          >
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}
