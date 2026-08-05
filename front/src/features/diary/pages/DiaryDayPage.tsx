import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { formatDomainDate, formatNumber } from "../../../shared/format";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { recordingModeLabels, type RecordingMode } from "../../exercises/api/exercises-api";
import type { SessionSeriesDocument } from "../../sessions/api/sessions-api";
import { diaryDayQueryKey, getDiaryDay, type DiaryDaySession } from "../api/diary-api";
import styles from "./DiaryDayPage.module.css";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Comprueba que la fecha de dominio sea real (p. ej. rechaza 2025-13-40). */
function isValidDomainDate(value: string): boolean {
  if (!datePattern.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

const seriesStatusLabels = {
  pendiente: "Pendiente",
  completada: "Completada",
  omitida: "Omitida",
} as const;

/** Texto del resultado de una Serie completada según su Forma de registro. */
function seriesResultLabel(series: SessionSeriesDocument, mode: RecordingMode): string {
  if (mode === "fuerza_con_carga") {
    return `${formatNumber(series.result.carga ?? 0)} kg × ${series.result.repeticiones ?? 0} rep`;
  }
  if (mode === "repeticiones_sin_carga") {
    return `${series.result.repeticiones ?? 0} rep`;
  }
  return `${series.result.duracion ?? 0} s`;
}

/** RPE de una Serie completada con coma decimal para su presentación. */
function seriesRpeLabel(series: SessionSeriesDocument): string | null {
  return series.rpe === null ? null : `RPE ${String(series.rpe).replace(".", ",")}`;
}

/** Título accesible de la Sesión en el detalle del día. */
function sessionLabel(session: DiaryDaySession): string {
  return session.title;
}

/**
 * Detalle de un día del Diario: las Sesiones finalizadas con Fecha realizada
 * ese día —Origen, Plan o Rutina resueltos, Ejercicios, Series, repeticiones
 * y pesos— y el volumen diario en kg·rep. Un día sin Sesiones expresa su
 * estado vacío y el enlace devuelve al calendario conservando el mes.
 */
export function DiaryDayPage() {
  const { fecha } = useParams();
  const date = fecha ?? "";

  const day = useQuery({
    queryKey: diaryDayQueryKey(date),
    queryFn: () => getDiaryDay(date),
    retry: false,
    enabled: isValidDomainDate(date),
  });

  if (!isValidDomainDate(date)) {
    return (
      <>
        <PageIntro
          eyebrow="Diario"
          title="Día no válido"
          description="La fecha indicada no es un día del Diario."
        />
        <Link className={styles.backLink} to="/diario">
          Volver al Diario
        </Link>
      </>
    );
  }

  const month = date.slice(0, 7);

  return (
    <>
      <PageIntro
        eyebrow="Diario"
        title={formatDomainDate(date)}
        description="Las Sesiones finalizadas de este día y su volumen."
      />
      <Link className={styles.backLink} to={`/diario?mes=${month}`}>
        Volver al Diario
      </Link>

      {day.isPending && <p className={styles.status}>Cargando este día…</p>}

      {day.isError && (
        <p className={styles.error} role="alert">
          No se pudo cargar este día. Inténtalo de nuevo.
          <button type="button" onClick={() => void day.refetch()}>
            Reintentar
          </button>
        </p>
      )}

      {day.isSuccess && (
        <>
          <p className={styles.dayVolume}>
            Volumen del día:{" "}
            <strong>{formatNumber(day.data.volumeKgRep)} kg·rep</strong>
          </p>

          {day.data.sessions.length === 0 && (
            <section className={styles.emptyState} aria-label="Día sin entrenamiento">
              <p>Este día no tiene entrenamientos registrados.</p>
              <Link className={styles.emptyAction} to={`/diario?mes=${month}`}>
                Volver al Diario
              </Link>
            </section>
          )}

          <div className={styles.sessions}>
            {day.data.sessions.map((session) => (
              <article className={styles.session} key={session.id} aria-label={sessionLabel(session)}>
                <header className={styles.sessionHeader}>
                  <h2 className={styles.sessionTitle}>{session.title}</h2>
                  <span className={styles.originBadge} data-origin={session.origin}>
                    {session.origin === "plan"
                      ? "Del Plan"
                      : session.origin === "rutina"
                        ? "De la Rutina"
                        : "Libre"}
                  </span>
                  <span className={styles.sessionVolume}>
                    {formatNumber(session.volumeKgRep)} kg·rep
                  </span>
                </header>
                {session.plannedDate !== null && (
                  <p className={styles.plannedDate}>
                    Fecha prevista: {formatDomainDate(session.plannedDate)}
                  </p>
                )}
                {session.planName !== null && (
                  <p className={styles.originLine}>
                    <strong>Plan:</strong> {session.planName}
                  </p>
                )}
                {session.routineName !== null && (
                  <p className={styles.originLine}>
                    <strong>Rutina:</strong> {session.routineName}
                  </p>
                )}

                <ul className={styles.exerciseList}>
                  {session.exercises.map((occurrence) => (
                    <li className={styles.exercise} key={occurrence.id}>
                      <h3 className={styles.exerciseName}>{occurrence.exercise.name}</h3>
                      <p className={styles.exerciseMode}>
                        {recordingModeLabels[occurrence.exercise.recordingMode]}
                      </p>
                      <ol className={styles.seriesList}>
                        {occurrence.series.map((series) => {
                          const rpe = seriesRpeLabel(series);
                          return (
                            <li
                              className={styles.series}
                              data-status={series.status}
                              key={series.id}
                            >
                              <span className={styles.seriesOrder}>Serie {series.order + 1}</span>
                              <span className={styles.seriesStatus}>
                                {seriesStatusLabels[series.status]}
                              </span>
                              {series.status === "completada" && (
                                <span className={styles.seriesResult}>
                                  {seriesResultLabel(series, occurrence.exercise.recordingMode)}
                                </span>
                              )}
                              {rpe !== null && (
                                <span className={styles.seriesRpe}>{rpe}</span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
