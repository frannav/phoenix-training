import { useState } from "react";
import styles from "./PlanEditor.module.css";

/**
 * Día de la semana (0 = domingo, 1 = lunes …) de una fecha de dominio
 * `YYYY-MM-DD`, interpretada en UTC para no depender de la zona horaria del
 * navegador. Devuelve `null` cuando el valor no es una fecha válida.
 */
function weekdayOfDomainDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return Number.isNaN(date.getTime()) ? null : date.getUTCDay();
}

type ActivatePlanPanelProps = {
  pending: boolean;
  onActivate: (startDate: string) => void;
};

/**
 * Panel de activación de un Plan borrador: exige el lunes de la primera
 * semana (la regla se valida aquí y también en el servidor) y describe que
 * la activación calcula las Fechas previstas y deja los Entrenamientos
 * pendientes.
 */
export function ActivatePlanPanel({ pending, onActivate }: ActivatePlanPanelProps) {
  const [startDate, setStartDate] = useState("");
  const weekday = startDate === "" ? null : weekdayOfDomainDate(startDate);
  const isMonday = weekday === 1;
  const canSubmit = startDate !== "" && isMonday && !pending;

  return (
    <section className={styles.activatePanel} aria-labelledby="activar-plan-titulo">
      <h2 id="activar-plan-titulo" className={styles.sectionHeading}>
        Activar en el calendario
      </h2>
      <p className={styles.activateHint}>
        Elige el lunes de la primera semana: el Plan calculará las Fechas previstas
        y dejará todos los Entrenamientos planificados pendientes.
      </p>
      <label className={styles.placementField}>
        <span className={styles.placementLabel}>Lunes de la primera semana</span>
        <input
          className={styles.input}
          type="date"
          value={startDate}
          aria-label="Lunes de la primera semana"
          onChange={(event) => setStartDate(event.target.value)}
        />
      </label>
      {weekday !== null && !isMonday && (
        <p className={styles.fieldError} role="alert">
          La primera semana empieza en lunes. Elige el lunes anterior o posterior.
        </p>
      )}
      <button
        className={styles.activateButton}
        type="button"
        disabled={!canSubmit}
        onClick={() => onActivate(startDate)}
      >
        {pending ? "Activando…" : "Activar Plan"}
      </button>
    </section>
  );
}
