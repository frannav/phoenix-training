import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { AppDatabase } from "../db/open-database";
import {
  exercise,
  recordedMax,
  trainingSession,
  trainingSessionExercise,
  trainingSessionSeries,
  type RecordingMode,
} from "../db/schema";
import { addDomainDays, parseDomainDate, toDomainDate } from "../domain/domain-dates";
import { findExerciseForAccount } from "../exercises/custom-exercises";
import {
  effectiveRecordedMax,
  toRecordedMaxDocument,
  type RecordedMaxDocument,
} from "../exercises/recorded-max";

/**
 * Modelos de lectura de la analítica de Inicio (ticket 31): el volumen
 * semanal, los RM recientes y la evolución de un Ejercicio, calculados al
 * leer desde las Sesiones finalizadas y los RM registrados, sin cachés ni
 * tablas derivadas (spec «Métricas», «Inicio, navegación y presentación
 * adaptable»). La ruta HTTP y la composición de los bloques pertenecen al
 * ticket 33; estos modelos entregan los datos agregados para que el cliente
 * los presente sin duplicar reglas de dominio.
 *
 * Reglas comunes a los tres modelos:
 * - Solo cuentan las Series completadas de Sesiones finalizadas. Se excluyen
 *   Objetivos de serie, Series pendientes u omitidas, Sesiones activas y
 *   Sesiones eliminadas.
 * - Las agrupaciones temporales usan la Fecha realizada y semanas de lunes a
 *   domingo. Corregir o eliminar una Sesión cambia la siguiente lectura.
 * - Cada consulta filtra por la Cuenta autenticada: los datos de otra Cuenta
 *   se comportan como inexistentes.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lunes de la semana (lunes a domingo) de una fecha de dominio. */
function mondayOf(dateValue: string): string {
  const date = parseDomainDate(dateValue);
  if (!date) {
    throw new Error(`La fecha de dominio no es válida: ${dateValue}`);
  }
  const offset = (date.getUTCDay() + 6) % 7; // lunes = 0 … domingo = 6
  return toDomainDate(new Date(date.getTime() - offset * DAY_MS));
}

/** Redondea a un decimal la presentación de una métrica calculada con precisión completa. */
function toOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Volumen semanal
// ---------------------------------------------------------------------------

/** Número de semanas que presentan las barras del bloque. */
export const weeklyVolumeWeeks = 6;

export type WeeklyVolumeWeek = {
  /** Lunes de la semana en formato de dominio YYYY-MM-DD. */
  weekStart: string;
  /** Volumen en kg·rep de las Series completadas de fuerza con carga. */
  total: number;
};

export type WeeklyVolume = {
  /** Lunes de la semana actual que sirve de referencia. */
  currentWeekStart: string;
  /** Volumen de la semana actual en kg·rep. */
  currentTotal: number;
  /** Volumen de la semana anterior en kg·rep (0 cuando no hay Sesiones). */
  previousTotal: number;
  /**
   * Comparación porcentual de la semana actual frente a la anterior,
   * redondeada a un decimal. Es nula cuando no hay volumen anterior: no se
   * puede expresar una proporción frente a cero.
   */
  changePercent: number | null;
  /** Las últimas seis semanas, de la más antigua a la actual. */
  weeks: WeeklyVolumeWeek[];
};

/**
 * Volumen semanal de la Cuenta autenticada: la suma de `carga × repeticiones`
 * de las Series completadas de Ejercicios de fuerza con carga de Sesiones
 * finalizadas, agrupadas por la semana de su Fecha realizada (lunes a
 * domingo). Devuelve el total actual, la comparación con la semana anterior y
 * las barras de las últimas seis semanas en `kg·rep`. Las Sesiones libres y
 * las iniciadas desde una Rutina cuentan igual que las del Plan: la analítica
 * general no distingue el Origen de sesión.
 */
export async function weeklyVolume(
  database: AppDatabase,
  { accountId, today }: { accountId: string; today: Date },
): Promise<WeeklyVolume> {
  const currentWeekStart = mondayOf(toDomainDate(today));
  const previousWeekStart = addDomainDays(currentWeekStart, -7);
  if (previousWeekStart === null) {
    throw new Error("No se puede calcular la semana anterior.");
  }
  const currentSunday = addDomainDays(currentWeekStart, 6);
  if (currentSunday === null) {
    throw new Error("No se puede calcular el domingo de la semana actual.");
  }
  const rangeStart = addDomainDays(currentWeekStart, -7 * (weeklyVolumeWeeks - 1));
  if (rangeStart === null) {
    throw new Error("No se puede calcular el rango de las seis semanas.");
  }

  const rows = await database
    .select({
      datePerformed: trainingSession.datePerformed,
      volume: sql<number>`COALESCE(SUM(${trainingSessionSeries.carga} * ${trainingSessionSeries.repeticiones}), 0)`,
    })
    .from(trainingSession)
    .innerJoin(
      trainingSessionExercise,
      eq(trainingSessionExercise.sessionId, trainingSession.id),
    )
    .innerJoin(
      trainingSessionSeries,
      eq(trainingSessionSeries.sessionExerciseId, trainingSessionExercise.id),
    )
    .innerJoin(exercise, eq(exercise.id, trainingSessionExercise.exerciseId))
    .where(
      and(
        eq(trainingSession.accountId, accountId),
        eq(trainingSession.status, "finalizada"),
        eq(trainingSessionSeries.status, "completada"),
        eq(exercise.recordingMode, "fuerza_con_carga"),
        gte(trainingSession.datePerformed, rangeStart),
        // Las barras son exactamente las últimas seis semanas: una Sesión
        // con Fecha realizada posterior al domingo actual queda fuera.
        lte(trainingSession.datePerformed, currentSunday),
      ),
    )
    .groupBy(trainingSession.datePerformed)
    .all();

  const totalsByWeek = new Map<string, number>();
  for (let index = weeklyVolumeWeeks - 1; index >= 0; index -= 1) {
    const weekStart = addDomainDays(currentWeekStart, -7 * index);
    if (weekStart !== null) {
      totalsByWeek.set(weekStart, 0);
    }
  }
  for (const row of rows) {
    const weekStart = mondayOf(row.datePerformed);
    if (!totalsByWeek.has(weekStart)) {
      // Defensa en profundidad: una semana fuera del mapa inicializado (p.
      // ej. futura respecto al domingo actual) no crea una barra adicional.
      continue;
    }
    totalsByWeek.set(weekStart, totalsByWeek.get(weekStart)! + row.volume);
  }

  const weeks: WeeklyVolumeWeek[] = [...totalsByWeek.entries()].map(
    ([weekStart, total]) => ({ weekStart, total }),
  );
  const currentTotal = totalsByWeek.get(currentWeekStart) ?? 0;
  const previousTotal = totalsByWeek.get(previousWeekStart) ?? 0;
  const changePercent =
    previousTotal === 0
      ? null
      : toOneDecimal(((currentTotal - previousTotal) / previousTotal) * 100);

  return { currentWeekStart, currentTotal, previousTotal, changePercent, weeks };
}

// ---------------------------------------------------------------------------
// RM recientes
// ---------------------------------------------------------------------------

/** Máximo de marcas que presenta el bloque de RM recientes. */
export const recentRecordedMaxesLimit = 3;

/**
 * Hasta tres RM recientes de la Cuenta autenticada, del más reciente al más
 * antiguo por su fecha (mismo orden que el listado de RM del área de
 * Ejercicios). Solo existen los RM que el Deportista registra expresamente:
 * una Sesión completada nunca crea un RM automático y la lectura nunca
 * presenta resultados calculados como récords.
 */
export async function recentRecordedMaxes(
  database: AppDatabase,
  { accountId }: { accountId: string },
): Promise<RecordedMaxDocument[]> {
  const rows = await database
    .select({ rm: recordedMax, exerciseName: exercise.name })
    .from(recordedMax)
    .innerJoin(exercise, eq(recordedMax.exerciseId, exercise.id))
    .where(eq(recordedMax.accountId, accountId))
    .orderBy(desc(recordedMax.date), desc(recordedMax.createdAt))
    .limit(recentRecordedMaxesLimit)
    .all();
  return rows.map(toRecordedMaxDocument);
}

// ---------------------------------------------------------------------------
// Opciones del selector de evolución
// ---------------------------------------------------------------------------

/**
 * Opción del selector de evolución del bloque «Evolución» de Inicio: un
 * Ejercicio con Series completadas en Sesiones finalizadas y la métrica
 * propia de su Forma de registro, para que el cliente presente el selector
 * sin duplicar las reglas de dominio.
 */
export type EvolutionOption = {
  id: string;
  name: string;
  recordingMode: RecordingMode;
  /** Métrica de la serie temporal; nula para cardio continuo (sin analítica). */
  metric: EvolutionMetric | null;
};

/**
 * Opciones del selector de evolución para la Cuenta autenticada: los
 * Ejercicios con al menos una Serie completada en una Sesión finalizada,
 * ordenados del más reciente al más antiguo por la Fecha realizada de su
 * última aparición. Un Ejercicio sin Series completadas nunca aparece: no
 * hay serie temporal que mostrar y el bloque evita las gráficas vacías. El
 * cardio continuo conserva su opción con métrica nula para que el cliente
 * informe de que no dispone de analítica.
 */
export async function evolutionOptions(
  database: AppDatabase,
  { accountId }: { accountId: string },
): Promise<EvolutionOption[]> {
  const rows = await database
    .select({
      id: exercise.id,
      name: exercise.name,
      recordingMode: exercise.recordingMode,
    })
    .from(exercise)
    .innerJoin(
      trainingSessionExercise,
      eq(trainingSessionExercise.exerciseId, exercise.id),
    )
    .innerJoin(trainingSession, eq(trainingSession.id, trainingSessionExercise.sessionId))
    .innerJoin(
      trainingSessionSeries,
      eq(trainingSessionSeries.sessionExerciseId, trainingSessionExercise.id),
    )
    .where(
      and(
        eq(trainingSession.accountId, accountId),
        eq(trainingSession.status, "finalizada"),
        eq(trainingSessionSeries.status, "completada"),
      ),
    )
    .groupBy(exercise.id, exercise.name, exercise.recordingMode)
    .orderBy(
      desc(sql`MAX(${trainingSession.datePerformed})`),
      asc(exercise.name),
      asc(exercise.id),
    )
    .all();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    recordingMode: row.recordingMode as RecordingMode,
    metric: metricByMode[row.recordingMode as RecordingMode],
  }));
}

// ---------------------------------------------------------------------------
// Evolución de un Ejercicio
// ---------------------------------------------------------------------------

/** Métrica propia de la Forma de registro que presenta la evolución. */
export type EvolutionMetric = "carga_maxima" | "repeticiones_totales" | "duracion_total";

/**
 * Métrica de la serie temporal por Forma de registro (spec «Métricas»): carga
 * máxima para fuerza con carga, repeticiones totales para repeticiones sin
 * carga, duración total para tiempo por serie. El cardio continuo no produce
 * analítica en el MVP.
 */
const metricByMode: Record<RecordingMode, EvolutionMetric | null> = {
  fuerza_con_carga: "carga_maxima",
  repeticiones_sin_carga: "repeticiones_totales",
  tiempo_por_serie: "duracion_total",
  cardio_continuo: null,
};

export type EvolutionPoint = {
  sessionId: string;
  /** Fecha realizada de la Sesión en formato de dominio YYYY-MM-DD. */
  date: string;
  /** Valor de la métrica propia de la Forma de registro en esa Sesión. */
  value: number;
  /**
   * RPE medio de la Sesión: media aritmética sin ponderar de las Series
   * completadas con RPE, redondeada a un decimal. Nulo sin observaciones.
   */
  rpeMedio: number | null;
  /**
   * Intensidad relativa máxima de la Sesión (solo fuerza con carga): la
   * mayor proporción `carga de la Serie / RM vigente de una repetición × 100`,
   * redondeada a un decimal. Puede superar el 100 %. Nula sin RM vigente o
   * cuando el RM vigente tiene carga cero: un denominador cero no expresa
   * una proporción con un decimal, y nunca se estima un 1RM.
   */
  intensidadRelativaMax: number | null;
};

export type ExerciseEvolution = {
  exerciseId: string;
  name: string;
  recordingMode: RecordingMode;
  /**
   * Métrica propia de la Forma de registro para la serie temporal. El cardio
   * continuo conserva la duración pero no produce analítica en el MVP: la
   * métrica es nula y la lectura no presenta resultados calculados.
   */
  metric: EvolutionMetric | null;
  /** Puntos de la serie temporal, uno por Sesión, en orden cronológico. */
  points: EvolutionPoint[];
};

type CompletedSeriesRow = {
  sessionId: string;
  datePerformed: string;
  startedAt: Date;
  carga: number | null;
  repeticiones: number | null;
  duracion: number | null;
  rpe: number | null;
};

/**
 * Evolución de un Ejercicio para la Cuenta autenticada: una serie temporal
 * con un punto por Sesión finalizada donde el Ejercicio tiene Series
 * completadas, en orden cronológico por Fecha realizada. La métrica del punto
 * depende de la Forma de registro —carga máxima para fuerza con carga,
 * repeticiones totales para repeticiones sin carga, duración total para
 * tiempo por serie— y varias apariciones del mismo Ejercicio en una Sesión se
 * agregan bajo su identidad. El RPE medio y la intensidad relativa máxima
 * acompañan cada punto. Un Ejercicio ajeno o inexistente se comporta como
 * ausente; el cardio continuo devuelve el modelo sin analítica.
 */
export async function exerciseEvolution(
  database: AppDatabase,
  { accountId, exerciseId }: { accountId: string; exerciseId: string },
): Promise<ExerciseEvolution | null> {
  const target = await findExerciseForAccount(database, { accountId, exerciseId });
  if (!target) {
    return null;
  }
  const mode = target.recordingMode as RecordingMode;
  const metric = metricByMode[mode];

  if (metric === null) {
    // Cardio continuo: conserva la duración, pero no produce analítica.
    return { exerciseId, name: target.name, recordingMode: mode, metric: null, points: [] };
  }

  const rows = await database
    .select({
      sessionId: trainingSession.id,
      datePerformed: trainingSession.datePerformed,
      startedAt: trainingSession.startedAt,
      carga: trainingSessionSeries.carga,
      repeticiones: trainingSessionSeries.repeticiones,
      duracion: trainingSessionSeries.duracion,
      rpe: trainingSessionSeries.rpe,
    })
    .from(trainingSession)
    .innerJoin(
      trainingSessionExercise,
      eq(trainingSessionExercise.sessionId, trainingSession.id),
    )
    .innerJoin(
      trainingSessionSeries,
      eq(trainingSessionSeries.sessionExerciseId, trainingSessionExercise.id),
    )
    .where(
      and(
        eq(trainingSession.accountId, accountId),
        eq(trainingSession.status, "finalizada"),
        eq(trainingSessionExercise.exerciseId, exerciseId),
        eq(trainingSessionSeries.status, "completada"),
      ),
    )
    .orderBy(asc(trainingSession.datePerformed), asc(trainingSession.startedAt), asc(trainingSession.id))
    .all();

  // Agrupación por Sesión conservando el orden cronológico de la consulta.
  const seriesBySession = new Map<string, { date: string; series: CompletedSeriesRow[] }>();
  for (const row of rows) {
    const entry = seriesBySession.get(row.sessionId) ?? {
      date: row.datePerformed,
      series: [],
    };
    entry.series.push(row);
    seriesBySession.set(row.sessionId, entry);
  }

  // El RM vigente de una repetición se resuelve una vez por Fecha realizada:
  // todas las Series de una Sesión comparten la fecha de la Sesión.
  const oneRepMaxByDate = new Map<string, number>();
  if (metric === "carga_maxima") {
    const dates = [...new Set([...seriesBySession.values()].map((entry) => entry.date))];
    for (const date of dates) {
      const rm = await effectiveRecordedMax(database, {
        accountId,
        exerciseId,
        repetitions: 1,
        date,
      });
      if (rm) {
        oneRepMaxByDate.set(date, rm.load);
      }
    }
  }

  const points: EvolutionPoint[] = [];
  for (const [sessionId, entry] of seriesBySession) {
    let value = 0;
    if (metric === "carga_maxima") {
      for (const series of entry.series) {
        if (series.carga !== null) {
          value = Math.max(value, series.carga);
        }
      }
    } else if (metric === "repeticiones_totales") {
      for (const series of entry.series) {
        value += series.repeticiones ?? 0;
      }
    } else {
      for (const series of entry.series) {
        value += series.duracion ?? 0;
      }
    }

    const rpeValues = entry.series
      .map((series) => series.rpe)
      .filter((rpe): rpe is number => rpe !== null);
    const rpeMedio =
      rpeValues.length === 0
        ? null
        : toOneDecimal(rpeValues.reduce((sum, rpe) => sum + rpe, 0) / rpeValues.length);

    let intensidadRelativaMax: number | null = null;
    if (metric === "carga_maxima") {
      const oneRepLoad = oneRepMaxByDate.get(entry.date);
      // Carga cero no es un denominador utilizable: la intensidad se omite
      // como sin RM vigente, sin estimar nunca un 1RM.
      if (oneRepLoad !== undefined && oneRepLoad > 0) {
        for (const series of entry.series) {
          if (series.carga === null) {
            continue;
          }
          const relative = (series.carga / oneRepLoad) * 100;
          intensidadRelativaMax =
            intensidadRelativaMax === null
              ? relative
              : Math.max(intensidadRelativaMax, relative);
        }
        if (intensidadRelativaMax !== null) {
          intensidadRelativaMax = toOneDecimal(intensidadRelativaMax);
        }
      }
    }

    points.push({
      sessionId,
      date: entry.date,
      value,
      rpeMedio,
      intensidadRelativaMax,
    });
  }

  return { exerciseId, name: target.name, recordingMode: mode, metric, points };
}
