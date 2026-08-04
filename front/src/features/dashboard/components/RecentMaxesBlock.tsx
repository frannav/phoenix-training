import { Link } from "react-router-dom";
import { formatDomainDate, formatNumber } from "../../../shared/format";
import type { RecordedMax } from "../../exercises/api/exercises-api";
import styles from "./RecentMaxesBlock.module.css";

type RecentMaxesBlockProps = {
  recordedMaxes: RecordedMax[];
};

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
      <h2 className={styles.title} id="rm-recientes">
        RM recientes
      </h2>

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
            <li key={rm.id} className={styles.item}>
              <span className={styles.itemName}>{rm.exerciseName}</span>
              <span className={styles.itemMeta}>
                {formatNumber(rm.load)} kg × {rm.repetitions} rep ·{" "}
                {formatDomainDate(rm.date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
