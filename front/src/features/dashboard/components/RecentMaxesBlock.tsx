import { Link } from "react-router-dom";
import { formatDomainDate, formatNumber } from "../../../shared/format";
import type { RecordedMax } from "../../exercises/api/exercises-api";
import styles from "./RecentMaxesBlock.module.css";

type RecentMaxesBlockProps = {
  recordedMaxes: RecordedMax[];
};

function MaxesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m12 3 2 2.1 2.9-.2.7 2.8 2.5 1.5-1.4 2.6 1.4 2.6-2.5 1.5-.7 2.8-2.9-.2L12 21l-2-2.1-2.9.2-.7-2.8-2.5-1.5 1.4-2.6-1.4-2.6 2.5-1.5.7-2.8 2.9.2L12 3Z" />
      <path d="m12 8 1.1 2.2 2.4.3-1.8 1.6.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.6 2.4-.3L12 8Z" />
    </svg>
  );
}

/**
 * Cuarto bloque de Inicio: hasta tres RM registrados expresamente, con
 * Ejercicio, carga, repeticiones y fecha. Solo existen las marcas que el
 * Deportista declara (spec «Métricas»): nunca se presentan resultados
 * calculados como récords. El estado vacío enlaza al área de Ejercicios,
 * donde se registran los RM.
 */
export function RecentMaxesBlock({ recordedMaxes }: RecentMaxesBlockProps) {
  return (
    <section className={styles.card} aria-labelledby="rm-recientes">
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <MaxesIcon />
        </span>
        <h2 className={styles.title} id="rm-recientes">
          RM recientes
        </h2>
      </div>

      {recordedMaxes.length === 0 && (
        <div className={styles.emptyCard}>
          <p className={styles.emptyText}>
            Aún no has registrado ninguna marca real. Cuando registres un RM
            aparecerá aquí con su Ejercicio, carga, repeticiones y fecha.
          </p>
          <Link className={styles.emptyAction} to="/ejercicios">
            Registrar un RM
          </Link>
        </div>
      )}

      {recordedMaxes.length > 0 && (
        <ul className={styles.list}>
          {recordedMaxes.map((rm) => (
            <li
              key={rm.id}
              className={styles.item}
              aria-label={`${rm.exerciseName}: ${formatNumber(rm.load)} kg × ${rm.repetitions} rep · ${formatDomainDate(rm.date)}`}
            >
              <div className={styles.itemDetails}>
                <span className={styles.itemName}>{rm.exerciseName}</span>
                <span className={styles.itemMeta}>{formatDomainDate(rm.date)}</span>
                <span className={styles.srOnly}>
                  {formatNumber(rm.load)} kg × {rm.repetitions} rep · {formatDomainDate(rm.date)}
                </span>
              </div>
              <div className={styles.itemMetric} aria-hidden="true">
                <div className={styles.itemValue}>
                  <span className={styles.itemLoad}>{formatNumber(rm.load)}</span>
                  <span className={styles.itemUnit}>kg</span>
                </div>
                <span className={styles.itemArrow}>
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M6 18 18 6M8 6h10v10" />
                  </svg>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
