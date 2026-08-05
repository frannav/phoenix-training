import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { AppDatabase } from "../db/open-database";
import {
  exercise,
  plan,
  planTraining,
  planWeek,
  routine,
  trainingSession,
  trainingSessionExercise,
  trainingSessionSeries,
} from "../db/schema";
import { toDomainDate } from "../domain/domain-dates";
import {
  loadSessionAggregate,
  toSessionDocument,
  type SessionDocument,
} from "../sessions/sessions";

/**
 * Modelos de lectura del Diario de entrenamiento: el calendario mensual
 * navegable y el detalle de un día, calculados al leer desde las Sesiones
 * finalizadas, sin cachés ni tablas derivadas (spec «Historial»: las
 * Sesiones finalizadas forman el historial y alimentan métricas calculadas
 * de forma determinista). La ruta HTTP y la presentación pertenecen al
 * Diario; estos modelos entregan los días con sus Sesiones y el volumen
 * diario para que el cliente los presente sin duplicar reglas de dominio.
 *
 * Reglas comunes a los dos modelos:
 * - Solo cuentan las Sesiones finalizadas, agrupadas por su Fecha realizada.
 *   Se excluyen Sesiones activas y eliminadas; corregir o eliminar una
 *   Sesión cambia la siguiente lectura.
 * - El volumen diario usa exactamente la regla de la analítica de Inicio
 *   (spec «Métricas»): la suma `carga × repeticiones` de las Series
 *   completadas de Ejercicios de fuerza con carga, en kg·rep. Las demás
 *   Formas de registro no suman kilogramos.
 * - El nombre del Plan o de la Rutina se resuelve desde el Origen de sesión
 *   persistido; una Sesión libre conserva su estado sin Plan ni Rutina.
 * - Cada consulta filtra por la Cuenta autenticada: los datos de otra Cuenta
 *   se comportan como inexistentes.
 */

/**
 * Sesión finalizada de un día del mes para la celda del calendario: la
 * referencia opaca y el nombre presentable según su Origen de sesión. Un
 * Origen cuyo Plan o Rutina ya no se resuelve conserva el nombre genérico
 * de su Origen (spec «Origen de sesión»: el hecho histórico permanece).
 */
export type DiaryMonthSession = {
  id: string;
  title: string;
};

/**
 * Resumen de un día del mes: la Fecha realizada, las Sesiones finalizadas y
 * el volumen diario en kg·rep según la regla de la analítica. Los días sin
 * Sesiones se incluyen con listas y volumen vacíos para que el calendario
 * distinga sin reinterpretar la ausencia.
 */
export type DiaryDaySummary = {
  /** Fecha de dominio YYYY-MM-DD. */
  date: string;
  sessions: DiaryMonthSession[];
  volumeKgRep: number;
};

/** Calendario mensual de la Cuenta autenticada. */
export type MonthlyDiary = {
  year: number;
  /** Mes 1-based (enero = 1 … diciembre = 12). */
  month: number;
  /** Días del mes en orden cronológico, incluidos los días sin Sesiones. */
  days: DiaryDaySummary[];
};

/**
 * Sesión finalizada de un día para el detalle: el documento canónico de la
 * Sesión (Ejercicios, Series, objetivos, resultados y RPE) junto con el
 * nombre presentable del Plan o la Rutina de origen y su volumen en kg·rep.
 */
export type DiaryDaySession = SessionDocument & {
  /** Nombre presentable principal según el Origen de sesión (Plan, Rutina o genérico). */
  title: string;
  /** Nombre del Plan de origen; nulo cuando la Sesión no viene de un Plan. */
  planName: string | null;
  /** Nombre de la Rutina de origen (también cuando el Plan la usa como referencia viva); nulo si no la hay. */
  routineName: string | null;
  /** Volumen de la Sesión en kg·rep según la regla de la analítica. */
  volumeKgRep: number;
};

/** Detalle de un día del Diario: sus Sesiones finalizadas y el volumen diario. */
export type DiaryDay = {
  /** Fecha de dominio YYYY-MM-DD. */
  date: string;
  volumeKgRep: number;
  sessions: DiaryDaySession[];
};

/**
 * Origen de sesión resuelto para presentar una Sesión finalizada: el tipo
 * persistido, el nombre principal presentable y los nombres del Plan y de la
 * Rutina de origen cuando existen (spec «Origen de sesión»). Una Sesión
 * libre conserva su estado sin Plan ni Rutina.
 */
type SessionOriginInfo = {
  kind: "plan" | "rutina" | "libre";
  /** Nombre presentable principal: Plan o Rutina resuelta, o genérico del Origen. */
  title: string;
  planName: string | null;
  routineName: string | null;
};

/** Origen de sesión persistido con la referencia que permite resolver su nombre. */
type SessionOriginRow = {
  id: string;
  origin: string;
  routineId: string | null;
  planTrainingId: string | null;
};

/**
 * Resuelve el Origen de sesión de cada Sesión a partir de sus referencias
 * persistidas: para un origen «rutina», el nombre de la Rutina; para un
 * origen «plan», el nombre del Plan y, cuando el Entrenamiento planificado
 * usa una Rutina (referencia viva), también el nombre de la Rutina —el
 * nombre principal sigue la misma regla que el Inicio. Una referencia que ya
 * no se resuelve conserva el genérico de su Origen (un Entrenamiento
 * planificado eliminado por una edición del Plan libera la referencia con
 * ON DELETE SET NULL y la Sesión conserva su Origen «plan» y su Fecha
 * prevista como hecho histórico) y las Sesiones libres no tienen Plan ni
 * Rutina.
 */
async function sessionOriginInfos(
  database: AppDatabase,
  { rows }: { rows: SessionOriginRow[] },
): Promise<Map<string, SessionOriginInfo>> {
  const infos = new Map<string, SessionOriginInfo>();
  const routineIds = new Set(
    rows
      .filter((row) => row.origin === "rutina" && row.routineId !== null)
      .map((row) => row.routineId!),
  );
  const trainingIds = new Set(
    rows
      .filter((row) => row.origin === "plan" && row.planTrainingId !== null)
      .map((row) => row.planTrainingId!),
  );

  const routineNames = new Map<string, string>();
  if (routineIds.size > 0) {
    for (const row of await database
      .select({ id: routine.id, name: routine.name })
      .from(routine)
      .where(inArray(routine.id, [...routineIds]))
      .all()) {
      routineNames.set(row.id, row.name);
    }
  }

  const planTrainings = new Map<
    string,
    { planName: string | null; routineId: string | null }
  >();
  if (trainingIds.size > 0) {
    for (const row of await database
      .select({
        trainingId: planTraining.id,
        planName: plan.name,
        routineId: planTraining.routineId,
      })
      .from(planTraining)
      .innerJoin(planWeek, eq(planWeek.id, planTraining.weekId))
      .innerJoin(plan, eq(plan.id, planWeek.planId))
      .where(inArray(planTraining.id, [...trainingIds]))
      .all()) {
      planTrainings.set(row.trainingId, {
        planName: row.planName,
        routineId: row.routineId,
      });
    }
    for (const entry of planTrainings.values()) {
      if (entry.routineId !== null && !routineNames.has(entry.routineId)) {
        const name = await database
          .select({ name: routine.name })
          .from(routine)
          .where(eq(routine.id, entry.routineId))
          .get();
        if (name) {
          routineNames.set(entry.routineId, name.name);
        }
      }
    }
  }

  for (const row of rows) {
    if (row.origin === "rutina" && row.routineId !== null) {
      const routineName = routineNames.get(row.routineId) ?? null;
      infos.set(row.id, {
        kind: "rutina",
        title: routineName ?? "Sesión de Rutina",
        planName: null,
        routineName,
      });
    } else if (row.origin === "plan") {
      // El Entrenamiento planificado de origen puede haber desaparecido (una
      // edición del Plan lo eliminó y la clave foránea liberó la referencia):
      // la Sesión conserva su Origen y su Fecha prevista y presenta el
      // genérico del Origen, nunca la de una Sesión libre.
      const training =
        row.planTrainingId === null ? undefined : planTrainings.get(row.planTrainingId);
      const planName = training?.planName ?? null;
      const routineName =
        training?.routineId !== null && training?.routineId !== undefined
          ? routineNames.get(training.routineId) ?? null
          : null;
      // La referencia viva a una Rutina da nombre al Entrenamiento; sin ella,
      // el nombre del Plan (misma regla que el Inicio para el Origen «plan»).
      const title =
        (routineName ?? planName) ?? "Sesión del Plan";
      infos.set(row.id, { kind: "plan", title, planName, routineName });
    } else {
      infos.set(row.id, {
        kind: "libre",
        title: "Sesión libre",
        planName: null,
        routineName: null,
      });
    }
  }
  return infos;
}

/**
 * Volumen diario de la Cuenta autenticada dentro de un rango de Fechas
 * realizadas: la suma `carga × repeticiones` de las Series completadas de
 * Ejercicios de fuerza con carga de Sesiones finalizadas, agrupada por
 * Fecha realizada. Es el mismo agregado que la analítica de Inicio, sin
 * reinterpretar sus reglas.
 */
async function volumeByDate(
  database: AppDatabase,
  { accountId, from, to }: { accountId: string; from: string; to: string },
): Promise<Map<string, number>> {
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
        // Las fechas de dominio YYYY-MM-DD se comparan lexicográficamente.
        gte(trainingSession.datePerformed, from),
        lte(trainingSession.datePerformed, to),
      ),
    )
    .groupBy(trainingSession.datePerformed)
    .all();
  return new Map(rows.map((row) => [row.datePerformed, row.volume]));
}

/**
 * Volumen de cada Sesión en kg·rep (misma regla que la analítica), para
 * presentar el aporte de cada Sesión del detalle y sumar el diario.
 */
async function volumeBySession(
  database: AppDatabase,
  { accountId, sessionIds }: { accountId: string; sessionIds: string[] },
): Promise<Map<string, number>> {
  if (sessionIds.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({
      sessionId: trainingSession.id,
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
        inArray(trainingSession.id, sessionIds),
      ),
    )
    .groupBy(trainingSession.id)
    .all();
  return new Map(rows.map((row) => [row.sessionId, row.volume]));
}

/**
 * Calendario mensual del Diario para la Cuenta autenticada: todos los días
 * del mes en orden cronológico —incluidos los que no tienen entrenamiento—,
 * cada uno con sus Sesiones finalizadas (referencia y nombre presentable) y
 * el volumen diario en kg·rep. El cliente compone la rejilla del calendario
 * a partir de estos días sin reconstruir reglas de dominio.
 */
export async function readMonthlyDiary(
  database: AppDatabase,
  { accountId, year, month }: { accountId: string; year: number; month: number },
): Promise<MonthlyDiary> {
  const firstDate = toDomainDate(new Date(Date.UTC(year, month - 1, 1)));
  const lastDate = toDomainDate(new Date(Date.UTC(year, month, 0)));
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const [sessionRows, volumeByDateMap] = await Promise.all([
    database
      .select({
        id: trainingSession.id,
        datePerformed: trainingSession.datePerformed,
        origin: trainingSession.origin,
        routineId: trainingSession.routineId,
        planTrainingId: trainingSession.planTrainingId,
      })
      .from(trainingSession)
      .where(
        and(
          eq(trainingSession.accountId, accountId),
          eq(trainingSession.status, "finalizada"),
          gte(trainingSession.datePerformed, firstDate),
          lte(trainingSession.datePerformed, lastDate),
        ),
      )
      .orderBy(
        asc(trainingSession.datePerformed),
        asc(trainingSession.startedAt),
        asc(trainingSession.id),
      )
      .all(),
    volumeByDate(database, { accountId, from: firstDate, to: lastDate }),
  ]);

  const infos = await sessionOriginInfos(database, { rows: sessionRows });
  const sessionsByDate = new Map<string, DiaryMonthSession[]>();
  for (const row of sessionRows) {
    const existing = sessionsByDate.get(row.datePerformed) ?? [];
    existing.push({
      id: row.id,
      title: infos.get(row.id)?.title ?? "Sesión libre",
    });
    sessionsByDate.set(row.datePerformed, existing);
  }

  const days: DiaryDaySummary[] = [];
  for (let day = 1; day <= dayCount; day += 1) {
    const date = toDomainDate(new Date(Date.UTC(year, month - 1, day)));
    days.push({
      date,
      sessions: sessionsByDate.get(date) ?? [],
      volumeKgRep: volumeByDateMap.get(date) ?? 0,
    });
  }
  return { year, month, days };
}

/**
 * Detalle de un día del Diario para la Cuenta autenticada: las Sesiones
 * finalizadas con Fecha realizada ese día, en orden cronológico, cada una
 * con su documento canónico (Ejercicios, Series, objetivos, resultados y
 * RPE), el nombre presentable de su Origen y su volumen en kg·rep. El
 * volumen diario es la suma de los aportes de sus Sesiones. Un día sin
 * Sesiones se expresa con una lista vacía y volumen cero, sin inventar
 * entrenamientos.
 */
export async function readDiaryDay(
  database: AppDatabase,
  { accountId, date }: { accountId: string; date: string },
): Promise<DiaryDay> {
  const sessionRows = await database
    .select()
    .from(trainingSession)
    .where(
      and(
        eq(trainingSession.accountId, accountId),
        eq(trainingSession.status, "finalizada"),
        eq(trainingSession.datePerformed, date),
      ),
    )
    .orderBy(asc(trainingSession.startedAt), asc(trainingSession.id))
    .all();

  const [infos, volumes] = await Promise.all([
    sessionOriginInfos(database, { rows: sessionRows }),
    volumeBySession(database, {
      accountId,
      sessionIds: sessionRows.map((row) => row.id),
    }),
  ]);

  const sessions: DiaryDaySession[] = [];
  for (const row of sessionRows) {
    const aggregate = await loadSessionAggregate(database, { sessionId: row.id });
    if (!aggregate) {
      continue;
    }
    const info = infos.get(row.id) ?? {
      kind: "libre" as const,
      title: "Sesión libre",
      planName: null,
      routineName: null,
    };
    sessions.push({
      ...toSessionDocument(aggregate),
      title: info.title,
      planName: info.planName,
      routineName: info.routineName,
      volumeKgRep: volumes.get(row.id) ?? 0,
    });
  }

  return {
    date,
    volumeKgRep: sessions.reduce((sum, session) => sum + session.volumeKgRep, 0),
    sessions,
  };
}
