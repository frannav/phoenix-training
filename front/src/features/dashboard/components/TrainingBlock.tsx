import { Link } from "react-router-dom";
import { formatDomainDate } from "../../../shared/format";
import type { TrainingAction } from "../api/dashboard-api";
import styles from "./TrainingBlock.module.css";

type TrainingBlockProps = {
  training: TrainingAction;
  isStarting: boolean;
  startError: boolean;
  onStartFree: () => void;
  onStartPlan: (planId: string, trainingId: string) => void;
};

/** Progreso de la Sesión activa para «Continuar»: Series completadas sobre el total. */
function sessionProgressLabel(progress: { completadas: number; total: number }): string {
  if (progress.total === 0) {
    return "Todavía no hay series registradas";
  }
  return `${progress.completadas} de ${progress.total} series completadas`;
}

/**
 * Primer bloque de Inicio (spec «Inicio, navegación y presentación
 * adaptable»): continuar la Sesión activa, iniciar el próximo Entrenamiento
 * planificado pendiente o, si tampoco existe, iniciar una Sesión libre. El
 * contrato llega agregado por la API; el bloque solo presenta la acción y
 * delega el inicio a la página.
 */
export function TrainingBlock({
  training,
  isStarting,
  startError,
  onStartFree,
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
        Entrenamiento actual
      </h2>
      <div className={styles.freeSessionCard}>
        <p className={styles.freeSessionTitle}>Sesión libre</p>
        <p className={styles.freeSessionText}>
          Empieza a registrar sin Rutina ni Plan previo.
        </p>
        <button
          className={styles.startButton}
          type="button"
          onClick={onStartFree}
          disabled={isStarting}
        >
          {isStarting ? "Iniciando…" : "Iniciar Sesión libre"}
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
