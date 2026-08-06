import { Link } from "react-router-dom";
import { formatDomainDate } from "../../../shared/format";
import type { ActivePlanSummary, TrainingAction } from "../api/dashboard-api";
import styles from "./TrainingBlock.module.css";

type TrainingBlockProps = {
  training: TrainingAction;
  activePlan: ActivePlanSummary | null;
  isStarting: boolean;
  startError: boolean;
  onStartPlan: (planId: string, trainingId: string) => void;
};

/** Progreso de la Sesión activa para «Continuar»: Series completadas sobre el total. */
function sessionProgressLabel(progress: { completadas: number; total: number }): string {
  if (progress.total === 0) {
    return "Todavía no hay series registradas";
  }
  return `${progress.completadas} de ${progress.total} series completadas`;
}

const weekDays = ["L", "M", "X", "J", "V", "S", "D"];

function trainingStatusLabel(status: "pendiente" | "realizado" | "omitido"): string {
  if (status === "realizado") return "Realizado";
  if (status === "omitido") return "Omitido";
  return "Pendiente";
}

function WeeklyPlanCard({ plan }: { plan: ActivePlanSummary | null }) {
  if (!plan) {
    return (
      <div className={styles.weeklyEmptyCard}>
        <p className={styles.weeklyEmptyTitle}>Sin Plan activo</p>
        <p className={styles.weeklyEmptyText}>Activa un Plan para ver tu semana aquí.</p>
        <Link className={styles.weeklyAction} to="/planes">
          Ir a Planes
        </Link>
      </div>
    );
  }

  const trainingByDay = new Map(plan.currentWeekTrainings.map((item) => [item.day, item]));

  return (
    <div className={styles.weeklyCard}>
      <div className={styles.weeklyHeader}>
        <div>
          <p className={styles.weeklyEyebrow}>{plan.name}</p>
          <p className={styles.weeklyTitle}>Semana {plan.currentWeek}</p>
        </div>
        <Link className={styles.weeklyDetail} to={`/planes/${plan.id}`}>
          Ver Plan
        </Link>
      </div>
      <div className={styles.weekGrid} role="list" aria-label={`Semana ${plan.currentWeek}`}>
        {weekDays.map((day, index) => {
          const training = trainingByDay.get(index);
          return (
            <div className={styles.day} key={day} role="listitem">
              <span className={styles.dayLabel}>{day}</span>
              {training ? (
                <span
                  className={`${styles.dayTraining} ${styles[`dayTraining${training.status}`]}`}
                  title={`${training.name}: ${trainingStatusLabel(training.status)}`}
                >
                  <span className={styles.dayStatus} aria-hidden="true" />
                  <span className={styles.dayName}>{training.name}</span>
                  <span className={styles.srOnly}>{trainingStatusLabel(training.status)}</span>
                </span>
              ) : (
                <span className={styles.restDay}>—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Primer bloque de Inicio (spec «Inicio, navegación y presentación
 * adaptable»): continuar la Sesión activa, iniciar el próximo Entrenamiento
 * planificado pendiente o mostrar la semana actual del Plan activo. El
 * contrato llega agregado por la API; el bloque solo presenta la acción y
 * delega el inicio a la página.
 */
export function TrainingBlock({
  training,
  activePlan,
  isStarting,
  startError,
  onStartPlan,
}: TrainingBlockProps) {
  if (training.kind === "continuar") {
    return (
      <section className={styles.card} aria-labelledby="entrenamiento-actual">
        <h2 className={styles.title} id="entrenamiento-actual">
          Entrenamiento actual
        </h2>
        <div className={styles.activeSessionCard}>
          <div className={styles.activeSessionCopy}>
            <p className={styles.activeSessionEyebrow}>Sesión en curso</p>
            <span className={styles.activeSessionName}>{training.name}</span>
            <span className={styles.activeSessionProgress}>
              {sessionProgressLabel(training.progress)}
            </span>
          </div>
          <Link className={styles.continueButton} to={`/sesion/${training.sessionId}`}>
            Continuar
          </Link>
        </div>
      </section>
    );
  }

  if (training.kind === "iniciar-plan") {
    return (
      <section className={styles.card} aria-labelledby="entrenamiento-actual">
        <h2 className={styles.title} id="entrenamiento-actual">
          Entrenamiento actual
        </h2>
        <div className={styles.planCard}>
          <p className={styles.planEyebrow}>Próximo entrenamiento planificado</p>
          <span className={styles.planName}>{training.name}</span>
          <p className={styles.planMeta}>
            Plan <strong>{training.planName}</strong>
            {training.plannedDate !== null && (
              <> · {formatDomainDate(training.plannedDate)}</>
            )}
          </p>
          <button
            className={styles.startButton}
            type="button"
            onClick={() => onStartPlan(training.planId, training.trainingId)}
            disabled={isStarting}
          >
            {isStarting ? "Iniciando…" : "Iniciar"}
          </button>
          {startError && (
            <p className={styles.startError} role="alert">
              No se pudo iniciar la Sesión. Inténtalo de nuevo.
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="entrenamiento-actual">
      <h2 className={styles.title} id="entrenamiento-actual">
        Semana actual
      </h2>
      <WeeklyPlanCard plan={activePlan} />
    </section>
  );
}
