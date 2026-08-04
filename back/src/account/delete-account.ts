import { and, eq, inArray } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import type { AppDatabase } from "../db/open-database";
import {
  account,
  exercise,
  plan,
  planTraining,
  planTrainingExercise,
  planTrainingSeriesGoal,
  planWeek,
  recordedMax,
  routine,
  routineExercise,
  routineSeriesGoal,
  trainingSession,
  trainingSessionExercise,
  trainingSessionSeries,
  user,
} from "../db/schema";

export type DeleteAccountOutcome =
  | { ok: true }
  | { ok: false; reason: "invalid-password" }
  | { ok: false; reason: "not-confirmed" }
  | { ok: false; reason: "no-credential" };

/**
 * Elimina definitivamente la Cuenta autenticada en una única transacción:
 * credenciales, sesiones, Rutinas, Planes, Sesiones, Ejercicios
 * personalizados y RM registrados. Los Ejercicios compartidos del catálogo
 * (`account_id` nulo) y los datos de otras Cuentas no se tocan.
 *
 * La contraseña actual debe verificarse y la confirmación debe ser explícita
 * antes de borrar nada: una contraseña incorrecta o una confirmación ausente
 * devuelve antes de la primera escritura. Cualquier fallo posterior revierte
 * la transacción completa y conserva la Cuenta utilizable.
 *
 * El borrado escribe los hijos antes que los padres porque varias referencias
 * del dominio no propagan borrados (p. ej. `plan_training.routine_id` o
 * `training_session.last_exercise_id` usan `ON DELETE no action`): apoyarse
 * solo en la cascada de la Cuenta fallaría según el orden de propagación.
 */
export async function deleteAccount(
  database: AppDatabase,
  {
    userId,
    password,
    confirmed,
  }: { userId: string; password: string; confirmed: boolean },
): Promise<DeleteAccountOutcome> {
  if (!confirmed) {
    return { ok: false, reason: "not-confirmed" };
  }

  return database.transaction(async (tx) => {
    const credential = await tx
      .select({ password: account.password })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .get();
    if (!credential?.password) {
      return { ok: false, reason: "no-credential" };
    }
    const valid = await verifyPassword({
      hash: credential.password,
      password,
    });
    if (!valid) {
      return { ok: false, reason: "invalid-password" };
    }

    // --- Sesiones de entrenamiento (hijos antes que padres) -------------
    const sessionsOf = tx
      .select({ id: trainingSession.id })
      .from(trainingSession)
      .where(eq(trainingSession.accountId, userId));
    const sessionExercisesOf = tx
      .select({ id: trainingSessionExercise.id })
      .from(trainingSessionExercise)
      .where(inArray(trainingSessionExercise.sessionId, sessionsOf));
    const sessionSeriesOf = tx
      .select({ id: trainingSessionSeries.id })
      .from(trainingSessionSeries)
      .where(inArray(trainingSessionSeries.sessionExerciseId, sessionExercisesOf));

    await tx
      .delete(trainingSessionSeries)
      .where(inArray(trainingSessionSeries.id, sessionSeriesOf));
    await tx
      .delete(trainingSessionExercise)
      .where(inArray(trainingSessionExercise.id, sessionExercisesOf));
    await tx.delete(trainingSession).where(inArray(trainingSession.id, sessionsOf));

    // --- Planes (hijos antes que padres) ---------------------------------
    const plansOf = tx.select({ id: plan.id }).from(plan).where(eq(plan.accountId, userId));
    const planWeeksOf = tx
      .select({ id: planWeek.id })
      .from(planWeek)
      .where(inArray(planWeek.planId, plansOf));
    const planTrainingsOf = tx
      .select({ id: planTraining.id })
      .from(planTraining)
      .where(inArray(planTraining.planId, plansOf));
    const planTrainingExercisesOf = tx
      .select({ id: planTrainingExercise.id })
      .from(planTrainingExercise)
      .where(inArray(planTrainingExercise.planTrainingId, planTrainingsOf));
    const planTrainingSeriesGoalsOf = tx
      .select({ id: planTrainingSeriesGoal.id })
      .from(planTrainingSeriesGoal)
      .where(
        inArray(planTrainingSeriesGoal.planTrainingExerciseId, planTrainingExercisesOf),
      );

    await tx
      .delete(planTrainingSeriesGoal)
      .where(inArray(planTrainingSeriesGoal.id, planTrainingSeriesGoalsOf));
    await tx
      .delete(planTrainingExercise)
      .where(inArray(planTrainingExercise.id, planTrainingExercisesOf));
    await tx.delete(planTraining).where(inArray(planTraining.id, planTrainingsOf));
    await tx.delete(planWeek).where(inArray(planWeek.id, planWeeksOf));

    // --- Rutinas (hijos antes que padres) --------------------------------
    const routinesOf = tx
      .select({ id: routine.id })
      .from(routine)
      .where(eq(routine.accountId, userId));
    const routineExercisesOf = tx
      .select({ id: routineExercise.id })
      .from(routineExercise)
      .where(inArray(routineExercise.routineId, routinesOf));
    const routineSeriesGoalsOf = tx
      .select({ id: routineSeriesGoal.id })
      .from(routineSeriesGoal)
      .where(inArray(routineSeriesGoal.routineExerciseId, routineExercisesOf));

    await tx
      .delete(routineSeriesGoal)
      .where(inArray(routineSeriesGoal.id, routineSeriesGoalsOf));
    await tx.delete(routineExercise).where(inArray(routineExercise.id, routineExercisesOf));

    // --- RM registrados y agregados raíz ---------------------------------
    await tx.delete(recordedMax).where(eq(recordedMax.accountId, userId));
    await tx.delete(plan).where(inArray(plan.id, plansOf));
    await tx.delete(routine).where(inArray(routine.id, routinesOf));

    // Ejercicios personalizados: solo los que pertenecen a la Cuenta. Los
    // Ejercicios del catálogo (account_id nulo) permanecen intactos.
    await tx.delete(exercise).where(eq(exercise.accountId, userId));

    // La Cuenta: la cascada elimina sus credenciales (account), sesiones de
    // autenticación, verificación y enlaces de recuperación. Ya no quedan
    // filas del dominio que la referencien con referencias no propagadas.
    await tx.delete(user).where(eq(user.id, userId));

    return { ok: true };
  });
}
