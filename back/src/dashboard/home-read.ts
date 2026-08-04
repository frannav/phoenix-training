import { and, asc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "../db/open-database";
import {
  plan,
  planTraining,
  planWeek,
  routine,
  trainingSession,
  trainingSessionExercise,
  trainingSessionSeries,
} from "../db/schema";
import { parseDomainDate } from "../domain/domain-dates";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Progreso de un conjunto de Entrenamientos planificados del Plan: cuántos
 * quedaron realizados (Sesión finalizada), omitidos y pendientes, junto con
 * el avance y el cumplimiento en porcentaje. Ambos se calculan con precisión
 * completa (spec «Métricas»: `(realizados + omitidos) / total × 100` y
 * `realizados / total × 100`) y se exponen también redondeados al entero más
 * próximo, que es la presentación acordada. Un conjunto vacío (una semana sin
 * Entrenamientos) se expresa como 0 % y no como una división indefinida.
 */
export type PlanProgress = {
  realizados: number;
  omitidos: number;
  pendientes: number;
  total: number;
  /** Avance con precisión completa: `(realizados + omitidos) / total × 100`. */
  avance: number;
  /** Cumplimiento con precisión completa: `realizados / total × 100`. */
  cumplimiento: number;
  /** Avance redondeado al entero más próximo para presentación. */
  avanceRedondeado: number;
  /** Cumplimiento redondeado al entero más próximo para presentación. */
  cumplimientoRedondeado: number;
};

/** Calcula el progreso de un grupo de Entrenamientos a partir de sus estados. */
export function planProgress(
  realizados: number,
  omitidos: number,
  pendientes: number,
): PlanProgress {
  const total = realizados + omitidos + pendientes;
  const avance = total === 0 ? 0 : ((realizados + omitidos) / total) * 100;
  const cumplimiento = total === 0 ? 0 : (realizados / total) * 100;
  return {
    realizados,
    omitidos,
    pendientes,
    total,
    avance,
    cumplimiento,
    avanceRedondeado: Math.round(avance),
    cumplimientoRedondeado: Math.round(cumplimiento),
  };
}

/**
 * Acción prioritaria del bloque «entrenamiento actual» de Inicio (spec
 * «Inicio, navegación y presentación adaptable»): continuar la Sesión activa;
 * si no existe, iniciar el próximo Entrenamiento planificado pendiente; y, si
 * tampoco existe, iniciar una Sesión libre. Cada variante conserva la
 * referencia opaca que el cliente necesita para continuar o iniciar sin
 * reconstruir reglas de dominio.
 */
export type HomeAction =
  | {
      kind: "continuar";
      /** Identificador de la Sesión activa para abrirla y reanudarla. */
      sessionId: string;
      /** Nombre presentable de la Sesión según su Origen de sesión. */
      name: string;
      /** Progreso de la Sesión activa: Series completadas sobre el total. */
      progress: { completadas: number; total: number };
    }
  | {
      kind: "iniciar-plan";
      /** Referencia del Plan del Entrenamiento planificado. */
      planId: string;
      /** Referencia del Entrenamiento planificado para iniciar desde él. */
      trainingId: string;
      /** Nombre del Plan al que pertenece el Entrenamiento. */
      planName: string;
      /**
       * Nombre presentable del Entrenamiento: la Rutina que usa mediante
       * referencia viva o, si es específico, el nombre de su Plan.
       */
      name: string;
      /** Fecha prevista del Entrenamiento (YYYY-MM-DD); siempre existe en un Plan activo. */
      plannedDate: string | null;
      /** Día de la semana del Entrenamiento (0 = lunes … 6 = domingo). */
      day: number;
    }
  | { kind: "iniciar-libre" };

/** Progreso de una semana del Plan activo, en orden. */
export type PlanWeekSummary = {
  order: number;
  progress: PlanProgress;
};

/**
 * Resumen del Plan activo para el bloque «Plan activo» de Inicio: nombre,
 * semana actual, y el progreso —realizados, omitidos, avance y cumplimiento—
 * por semana y para el Plan completo. Se lee el estado vigente en cada
 * consulta, sin cachés ni tablas derivadas.
 */
export type ActivePlanSummary = {
  id: string;
  name: string;
  /** Lunes de la primera semana del Plan (YYYY-MM-DD). */
  startDate: string;
  /** Semana actual (1-based) en la que cae la fecha consultada, acotada al calendario del Plan. */
  currentWeek: number;
  weeks: PlanWeekSummary[];
  progress: PlanProgress;
};

/** Estado de Inicio leído al momento: la acción prioritaria y el resumen del Plan activo. */
export type HomeState = {
  action: HomeAction;
  activePlan: ActivePlanSummary | null;
};

type PlanTrainingRow = typeof planTraining.$inferSelect;

/**
 * Lee el estado del bloque «entrenamiento actual» y del «Plan activo» de
 * Inicio para la Cuenta autenticada. Cada consulta lee el estado vigente de
 * Planes y Sesiones sin cachés ni tablas derivadas: finalizar, eliminar u
 * omitir cambia la siguiente lectura.
 */
export async function readHomeState(
  database: AppDatabase,
  { accountId, today }: { accountId: string; today: string },
): Promise<HomeState> {
  const [activeSession, activePlanRow] = await Promise.all([
    database
      .select()
      .from(trainingSession)
      .where(
        and(eq(trainingSession.accountId, accountId), eq(trainingSession.status, "activa")),
      )
      .get(),
    database
      .select()
      .from(plan)
      .where(and(eq(plan.accountId, accountId), eq(plan.status, "activo")))
      .get(),
  ]);

  let action: HomeAction;
  if (activeSession) {
    action = await continueAction(database, { session: activeSession });
  } else {
    const nextTraining = await nextPendingTraining(database, { accountId });
    action = nextTraining ?? { kind: "iniciar-libre" };
  }

  const activePlan = activePlanRow
    ? await activePlanSummary(database, { planRow: activePlanRow, today })
    : null;

  return { action, activePlan };
}

/** Nombre presentable de la Sesión activa según su Origen de sesión. */
async function continueAction(
  database: AppDatabase,
  { session }: { session: typeof trainingSession.$inferSelect },
): Promise<Extract<HomeAction, { kind: "continuar" }>> {
  let name: string;
  if (session.origin === "rutina" && session.routineId) {
    name = (await routineName(database, session.routineId)) ?? "Sesión de Rutina";
  } else if (session.origin === "plan" && session.planTrainingId) {
    name = await planOriginSessionName(database, { planTrainingId: session.planTrainingId });
  } else {
    name = "Sesión libre";
  }

  const progress = await sessionSeriesProgress(database, { sessionId: session.id });
  return { kind: "continuar", sessionId: session.id, name, progress };
}

/**
 * Nombre de una Sesión originada en un Entrenamiento planificado: la Rutina
 * de su referencia viva cuando el Entrenamiento usa una y, si es específico,
 * el nombre del Plan. Un Entrenamiento eliminado entre tanto conserva su
 * Origen como hecho histórico y recibe el título genérico.
 */
async function planOriginSessionName(
  database: AppDatabase,
  { planTrainingId }: { planTrainingId: string },
): Promise<string> {
  const row = await database
    .select({
      planName: plan.name,
      source: planTraining.source,
      routineId: planTraining.routineId,
    })
    .from(planTraining)
    .innerJoin(planWeek, eq(planWeek.id, planTraining.weekId))
    .innerJoin(plan, eq(plan.id, planWeek.planId))
    .where(eq(planTraining.id, planTrainingId))
    .get();
  if (!row) {
    return "Sesión del Plan";
  }
  if (row.source === "rutina" && row.routineId) {
    return (await routineName(database, row.routineId)) ?? row.planName;
  }
  return row.planName;
}

/** Nombre de la Rutina por su identificador, o `null` si ya no existe. */
async function routineName(database: AppDatabase, routineId: string): Promise<string | null> {
  const routineRow = await database
    .select()
    .from(routine)
    .where(eq(routine.id, routineId))
    .get();
  return routineRow?.name ?? null;
}

/** Series completadas y totales de la Sesión para el progreso de «continuar». */
async function sessionSeriesProgress(
  database: AppDatabase,
  { sessionId }: { sessionId: string },
): Promise<{ completadas: number; total: number }> {
  const stats = await database
    .select({
      completadas: sql<number>`COALESCE(SUM(CASE WHEN ${trainingSessionSeries.status} = 'completada' THEN 1 ELSE 0 END), 0)`,
      total: sql<number>`COUNT(${trainingSessionSeries.id})`,
    })
    .from(trainingSessionExercise)
    .leftJoin(
      trainingSessionSeries,
      eq(trainingSessionSeries.sessionExerciseId, trainingSessionExercise.id),
    )
    .where(eq(trainingSessionExercise.sessionId, sessionId))
    .get();
  return { completadas: stats?.completadas ?? 0, total: stats?.total ?? 0 };
}

/**
 * Próximo Entrenamiento planificado pendiente del Plan activo de la Cuenta:
 * el de menor Fecha prevista (las semanas van de lunes a domingo y solo el
 * Plan activo tiene Entrenamientos pendientes iniciables). Un Entrenamiento
 * pendiente de un Plan completado no es iniciable y nunca se propone.
 */
async function nextPendingTraining(
  database: AppDatabase,
  { accountId }: { accountId: string },
): Promise<Extract<HomeAction, { kind: "iniciar-plan" }> | null> {
  const row = await database
    .select({
      planId: plan.id,
      planName: plan.name,
      trainingId: planTraining.id,
      day: planTraining.day,
      plannedDate: planTraining.plannedDate,
      source: planTraining.source,
      routineId: planTraining.routineId,
    })
    .from(planTraining)
    .innerJoin(planWeek, eq(planWeek.id, planTraining.weekId))
    .innerJoin(plan, eq(plan.id, planWeek.planId))
    .where(
      and(
        eq(plan.accountId, accountId),
        eq(plan.status, "activo"),
        eq(planTraining.status, "pendiente"),
      ),
    )
    .orderBy(asc(planTraining.plannedDate), asc(planTraining.id))
    .limit(1)
    .get();
  if (!row) {
    return null;
  }

  let name = row.planName;
  if (row.source === "rutina" && row.routineId) {
    name = (await routineName(database, row.routineId)) ?? row.planName;
  }

  return {
    kind: "iniciar-plan",
    planId: row.planId,
    trainingId: row.trainingId,
    planName: row.planName,
    name,
    plannedDate: row.plannedDate,
    day: row.day,
  };
}

/** Resumen del Plan activo con su progreso por semana y completo. */
async function activePlanSummary(
  database: AppDatabase,
  {
    planRow,
    today,
  }: {
    planRow: typeof plan.$inferSelect;
    today: string;
  },
): Promise<ActivePlanSummary | null> {
  // La activación fija el lunes de la primera semana: un Plan activo siempre
  // lo tiene; el resto de la lectura no puede continuar sin calendario.
  if (!planRow.startDate) {
    return null;
  }

  const weekRows = await database
    .select()
    .from(planWeek)
    .where(eq(planWeek.planId, planRow.id))
    .orderBy(asc(planWeek.position), asc(planWeek.id))
    .all();
  const trainingRows = await database
    .select()
    .from(planTraining)
    .where(eq(planTraining.planId, planRow.id))
    .all();

  const trainingsByWeekId = new Map<string, PlanTrainingRow[]>();
  for (const training of trainingRows) {
    const existing = trainingsByWeekId.get(training.weekId) ?? [];
    existing.push(training);
    trainingsByWeekId.set(training.weekId, existing);
  }

  const weeks = weekRows.map((week, index) => {
    const counts = countTrainingStatuses(trainingsByWeekId.get(week.id) ?? []);
    return {
      order: index,
      progress: planProgress(counts.realizados, counts.omitidos, counts.pendientes),
    };
  });

  const whole = countTrainingStatuses(trainingRows);

  return {
    id: planRow.id,
    name: planRow.name,
    startDate: planRow.startDate,
    currentWeek: currentWeekNumber(planRow.startDate, today, weekRows.length),
    weeks,
    progress: planProgress(whole.realizados, whole.omitidos, whole.pendientes),
  };
}

/**
 * Cuenta los Entrenamientos de un grupo por estado resuelto. Un Entrenamiento
 * solo cuenta como realizado cuando su Sesión está finalizada («realizado»);
 * los omitidos se cuentan aparte y todo lo demás (pendiente, o sin estado en
 * un caso imposible dentro de un Plan activo) se conserva como pendiente.
 */
function countTrainingStatuses(rows: PlanTrainingRow[]): {
  realizados: number;
  omitidos: number;
  pendientes: number;
} {
  let realizados = 0;
  let omitidos = 0;
  let pendientes = 0;
  for (const row of rows) {
    if (row.status === "realizado") {
      realizados += 1;
    } else if (row.status === "omitido") {
      omitidos += 1;
    } else {
      pendientes += 1;
    }
  }
  return { realizados, omitidos, pendientes };
}

/**
 * Semana actual del Plan (1-based) para una fecha consultada: cuántas
 * semanas completas de lunes a domingo han transcurrido desde el lunes de la
 * primera semana. Antes de la primera semana se muestra la primera y después
 * de la última se muestra la última (el Plan activo es el calendario vigente).
 */
function currentWeekNumber(startDate: string, today: string, weekCount: number): number {
  const start = parseDomainDate(startDate);
  const current = parseDomainDate(today);
  if (!start || !current || weekCount <= 0) {
    return 1;
  }
  const elapsedDays = Math.floor((current.getTime() - start.getTime()) / DAY_MS);
  const weekIndex = Math.floor(elapsedDays / 7);
  return Math.min(Math.max(weekIndex + 1, 1), weekCount);
}
