import type { ReactNode } from "react";
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
  /** Restaurar una Serie omitida como completada: exige un resultado completo en el mismo flujo. */
  onRestore: () => void;
  /** Eliminar una Serie añadida; la página confirma cuando contiene resultado. */
  onDelete: () => void;
};

const tableLabels: Record<SeriesMagnitude, string> = {
  carga: "CARGA",
  repeticiones: "REPS",
  duracion: "DURACIÓN",
};

/** Cabecera única del registro de Series dentro de cada bloque de Ejercicio. */
export function SeriesTableHeader({ mode }: { mode: RecordingMode }) {
  const fields = seriesFieldsPerMode[mode];
  return (
    <div className={styles.seriesHeader}>
      <span>SER</span>
      <span className={styles.seriesHeaderFields}>
        {fields.map((field) => (
          <span key={field}>{tableLabels[field]}</span>
        ))}
      </span>
      <span>OK</span>
    </div>
  );
}

const statusLabels = {
  pendiente: "Pendiente",
  completada: "Completada",
  omitida: "Omitida",
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

/**
 * Fila compacta de una Serie dentro del Ejercicio desplegado: número, estado
 * (icono, texto y estilo), campos propios de la Forma de registro, RPE
 * opcional y las acciones completar, omitir o restaurar. Una Serie pendiente
 * u omitida ofrece los campos para escribir el resultado; restaurar una
 * omitida como completada exige un resultado completo en el mismo flujo. Los
 * errores se muestran junto al campo afectado y una entrada parcial nunca se
 * envía.
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

  // Campos de resultado de la Forma de registro: los
  // muestran las Series pendientes y las omitidas (para restaurarlas como
  // completadas con un resultado completo). Los errores se asocian por Serie.
  const fieldsBlock = (
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

    </div>
  );

  const rpeBlock = (
    <label className={styles.secondaryField}>
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
  );

  // Las Series completadas siguen mostrando sus magnitudes dentro de la
  // misma cuadrícula que las pendientes. Los controles deshabilitados hacen
  // evidente qué se registró sin convertir el resultado en texto suelto.
  const completedFieldsBlock = (
    <div className={styles.fields} data-readonly="true">
      {fields.map((magnitude: SeriesMagnitude) => (
        <label className={styles.field} key={magnitude}>
          <span className={styles.fieldLabel}>{magnitudeLabels[magnitude]}</span>
          <input
            className={styles.fieldInput}
            data-field={magnitude}
            value={series.result[magnitude] ?? ""}
            disabled
            readOnly
            aria-label={magnitudeLabels[magnitude]}
          />
        </label>
      ))}
    </div>
  );

  const seriesActions = (actions: ReactNode) => (
    <details className={styles.secondaryActions}>
      <summary className={styles.secondarySummary}>
        <span>Acciones de Serie {order}</span>
        <span className={styles.secondaryStatus} data-status={series.status}>
          {statusLabels[series.status]}
        </span>
      </summary>
      <div className={styles.secondaryContent}>{actions}</div>
    </details>
  );

  if (series.status === "completada") {
    return (
      <div
        className={styles.row}
        data-status="completada"
        role="group"
        aria-label={`Serie ${order}`}
      >
        <div className={styles.seriesGrid}>
          <span className={styles.seriesNumber} aria-hidden="true">
            {order}
          </span>
          <span className={styles.visuallyHidden}>Serie {order}</span>
          {completedFieldsBlock}
          <div className={styles.primaryAction}>
            <button
              className={styles.completeButton}
              type="button"
              aria-label="Completada"
              disabled
            >
              <span aria-hidden="true">✓</span>
            </button>
          </div>
        </div>
        <p className={styles.result}>{resultText(series, mode)}</p>
        {seriesActions(
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
          </div>,
        )}
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
        {/* Restaurar una Serie omitida como completada exige introducir a la
            vez un resultado completo: los campos lo permiten y el botón
            «Restaurar» completa con la validación atómica del resultado. */}
        <div className={styles.seriesGrid}>
          <span className={styles.seriesNumber} aria-hidden="true">
            {order}
          </span>
          <span className={styles.visuallyHidden}>Serie {order}</span>
          {fieldsBlock}
          <div className={styles.primaryAction}>
            <button
              className={styles.restoreButton}
              type="button"
              onClick={onRestore}
              disabled={saving}
              aria-label="Confirmar resultado restaurado"
            >
              <span aria-hidden="true">✓</span>
            </button>
          </div>
        </div>
        {seriesActions(
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
          </div>,
        )}
        {rpeBlock}
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
      <div className={styles.seriesGrid}>
        <span className={styles.seriesNumber} aria-hidden="true">
          {order}
        </span>
        <span className={styles.visuallyHidden}>Serie {order}</span>
        {fieldsBlock}
        <div className={styles.primaryAction}>
          <button
            className={styles.completeButton}
            type="button"
            onClick={onComplete}
            disabled={saving}
            aria-label="Completar"
          >
            <span aria-hidden="true">✓</span>
          </button>
        </div>
      </div>
      {seriesActions(
        <div className={styles.actions}>
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
        </div>,
      )}
      {rpeBlock}
    </div>
  );
}
