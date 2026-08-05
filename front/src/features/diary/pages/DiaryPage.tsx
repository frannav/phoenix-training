import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { formatDomainDate, formatNumber } from "../../../shared/format";
import { PageIntro } from "../../../shared/ui/PageIntro";
import {
  diaryMonthQueryKey,
  getDiaryMonth,
  monthParamOf,
  type DiaryDaySummary,
} from "../api/diary-api";
import styles from "./DiaryPage.module.css";

/** Días de la semana del calendario, de lunes a domingo (spec «API y concurrencia»). */
const weekdayHeaders = ["L", "M", "X", "J", "V", "S", "D"] as const;

const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Nombre del mes en español, p. ej. «marzo de 2025». */
function monthLabel(year: number, month: number): string {
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Mes actual en la zona local del Deportista como referencia inicial. */
function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Interpreta la consulta `?mes=AAAA-MM`; nula cuando no es un mes válido. */
function parseMonthParam(value: string | null): { year: number; month: number } | null {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

/** Nombre accesible de un día: fecha y, cuando tiene entrenamiento, resumen. */
function dayAccessibleLabel(day: DiaryDaySummary): string {
  const base = formatDomainDate(day.date);
  if (day.sessions.length === 0) {
    return `${base} · sin entrenamiento`;
  }
  const count = day.sessions.length === 1 ? "1 Sesión" : `${day.sessions.length} Sesiones`;
  return `${base} · ${count} · ${formatNumber(day.volumeKgRep)} kg·rep`;
}

/**
 * Diario: el calendario mensual navegable de las Sesiones finalizadas de la
 * Cuenta autenticada (spec «Historial» y «Inicio, navegación y presentación
 * adaptable»). La página es la dueña del mes consultado —la consulta
 * `?mes=AAAA-MM` o el mes actual— y compone la rejilla a partir de los días
 * que entrega la API; cada día enlaza a su detalle. Los días con Sesiones
 * finalizadas se distinguen visualmente con su volumen diario.
 */
export function DiaryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const reference = parseMonthParam(searchParams.get("mes")) ?? currentYearMonth();
  const { year, month } = reference;

  const diary = useQuery({
    queryKey: diaryMonthQueryKey(year, month),
    queryFn: () => getDiaryMonth(year, month),
    retry: false,
  });

  const moveMonth = (delta: number) => {
    const target = new Date(Date.UTC(year, month - 1 + delta, 1));
    setSearchParams({
      mes: monthParamOf(target.getUTCFullYear(), target.getUTCMonth() + 1),
    });
  };

  const goToCurrentMonth = () => {
    const now = currentYearMonth();
    setSearchParams({ mes: monthParamOf(now.year, now.month) });
  };

  // Rejilla de lunes a domingo: huecos iniciales según el día de la semana
  // del primer día del mes y una celda por día del mes.
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<DiaryDaySummary | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...(diary.data?.days ?? []),
  ];
  const rows: Array<Array<DiaryDaySummary | null>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    rows.push(cells.slice(index, index + 7));
  }
  // La última semana se completa con huecos para conservar la rejilla.
  const lastRow = rows.at(-1);
  if (lastRow && lastRow.length < 7) {
    lastRow.push(...Array.from({ length: 7 - lastRow.length }, () => null));
  }

  const hasSessions = (diary.data?.days.some((day) => day.sessions.length > 0) ?? false) && !diary.isPending;

  return (
    <>
      <PageIntro
        eyebrow="Entrenamiento"
        title="Diario"
        description="Revisa el calendario de tus Sesiones finalizadas y su volumen diario."
      />

      <section className={styles.calendar} aria-label="Calendario del Diario">
        <header className={styles.monthHeader}>
          <button
            className={styles.navButton}
            type="button"
            aria-label="Mes anterior"
            onClick={() => moveMonth(-1)}
          >
            ←
          </button>
          <h2 className={styles.monthTitle}>{monthLabel(year, month)}</h2>
          <button
            className={styles.navButton}
            type="button"
            aria-label="Mes siguiente"
            onClick={() => moveMonth(1)}
          >
            →
          </button>
          <button className={styles.todayButton} type="button" onClick={goToCurrentMonth}>
            Hoy
          </button>
        </header>

        {diary.isPending && <p className={styles.status}>Cargando tu Diario…</p>}

        {diary.isError && (
          <p className={styles.error} role="alert">
            No se pudo cargar tu Diario. Inténtalo de nuevo.
            <button type="button" onClick={() => void diary.refetch()}>
              Reintentar
            </button>
          </p>
        )}

        {diary.isSuccess && (
          <>
            <table className={styles.grid}>
              <thead>
                <tr>
                  {weekdayHeaders.map((label) => (
                    <th className={styles.weekday} key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((day, column) => {
                      if (day === null) {
                        return <td className={styles.blankCell} key={`blank-${rowIndex}-${column}`} aria-hidden="true" />;
                      }
                      const hasSessionsOnDay = day.sessions.length > 0;
                      return (
                        <td
                          className={hasSessionsOnDay ? styles.trainingCell : styles.cell}
                          key={day.date}
                          data-has-sessions={hasSessionsOnDay}
                        >
                          <Link
                            className={styles.dayLink}
                            to={`/diario/${day.date}`}
                            aria-label={dayAccessibleLabel(day)}
                          >
                            <span className={styles.dayNumber}>{Number(day.date.slice(8))}</span>
                            {hasSessionsOnDay && (
                              <span className={styles.daySummary}>
                                <span className={styles.sessionCount}>
                                  {day.sessions.length === 1
                                    ? "1 Sesión"
                                    : `${day.sessions.length} Sesiones`}
                                </span>
                                <span className={styles.dayVolume}>
                                  {formatNumber(day.volumeKgRep)} kg·rep
                                </span>
                              </span>
                            )}
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!hasSessions && (
              <p className={styles.emptyMonth} role="status">
                Este mes no tiene entrenamientos registrados.
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
