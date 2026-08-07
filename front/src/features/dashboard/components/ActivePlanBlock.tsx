import { Link } from "react-router-dom";
import type { ActivePlanSummary } from "../api/dashboard-api";
import styles from "./ActivePlanBlock.module.css";

type ActivePlanBlockProps = {
  plan: ActivePlanSummary | null;
};

/** Barra de progreso accesible: texto visible más estado de progreso para lectores. */
function ProgressBar({
  label,
  description,
  value,
}: {
  label: string;
  description: string;
  value: number;
}) {
  return (
    <div className={styles.barRow}>
      <p className={styles.barLabel}>
        <span>{label}</span>
        <strong>{value} %</strong>
      </p>
      <p className={styles.barDescription}>{description}</p>
      <div
        className={styles.bar}
        role="progressbar"
        aria-label={`${label}: ${value} % · ${description}`}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {Array.from({ length: 4 }, (_, index) => (
          <span
            className={`${styles.barSegment} ${
              index < Math.round(value / 25) ? styles.barSegmentFilled : ""
            }`}
            key={index}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Segundo bloque de Inicio: el resumen del Plan activo —nombre, semana
 * actual y una métrica de entrenamientos realizados— con su enlace al detalle.
 * El progreso llega calculado por la API (spec «Métricas»); el bloque solo lo
 * presenta. La ausencia de Plan activo se explica y enlaza a Planes, donde
 * puede crearse o activarse.
 */
export function ActivePlanBlock({ plan }: ActivePlanBlockProps) {
  return (
    <section className={styles.card} aria-labelledby="plan-activo">
      <h2 className={styles.title} id="plan-activo">
        Plan activo
      </h2>

      {plan === null && (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>Sin Plan activo</p>
          <p className={styles.emptyText}>
            Aún no tienes un Plan activo. Activa uno para organizar tus
            entrenamientos y ver qué has realizado, omitido o tienes pendiente.
          </p>
          <Link className={styles.emptyAction} to="/planes">
            Ir a Planes
          </Link>
        </div>
      )}

      {plan !== null && (
        <div className={styles.planCard}>
          <p className={styles.planName}>{plan.name}</p>
          <p className={styles.planEyebrow}>
            Semana {plan.currentWeek} de {plan.weeks.length}
          </p>

          <div className={styles.progressBars}>
            <ProgressBar
              label="Entrenamientos realizados"
              description="Completadas de las previstas"
              value={plan.progress.cumplimientoRedondeado}
            />
          </div>

          <Link className={styles.detailLink} to={`/planes/${plan.id}`}>
            Ver Plan
          </Link>
        </div>
      )}
    </section>
  );
}
