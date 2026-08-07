import { verifyPassword } from "better-auth/crypto";
import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrateDatabase } from "../src/db/migrate";
import { openDatabase, type DatabaseConnection } from "../src/db/open-database";
import { seedTestAccount, testAccount } from "../src/db/seed-test-account";
import {
  account,
  exercise,
  plan,
  planTraining,
  planWeek,
  routine,
  routineExercise,
  routineSeriesGoal,
  user,
} from "../src/db/schema";

describe("Cuenta de prueba local", () => {
  let connection: DatabaseConnection | undefined;

  afterEach(() => {
    connection?.close();
    connection = undefined;
  });

  test("crea una Cuenta verificada con credenciales compatibles con Better Auth", async () => {
    connection = openDatabase(":memory:");
    await migrateDatabase(connection.db);

    expect(await seedTestAccount(connection.db, new Date("2026-01-01T00:00:00.000Z"))).toBe(
      "created",
    );

    const seededUser = await connection.db
      .select()
      .from(user)
      .where(eq(user.id, testAccount.userId))
      .get();
    const seededAccount = await connection.db
      .select({ password: account.password })
      .from(account)
      .where(eq(account.id, testAccount.accountId))
      .get();

    expect(seededUser).toMatchObject({
      name: testAccount.name,
      email: testAccount.email,
      emailVerified: true,
    });
    expect(seededAccount?.password).toBeDefined();
    expect(seededAccount?.password).not.toBe(testAccount.password);
    expect(
      await verifyPassword({ hash: seededAccount!.password!, password: testAccount.password }),
    ).toBe(true);

    const seededExercises = await connection.db
      .select()
      .from(exercise)
      .where(eq(exercise.accountId, testAccount.userId));
    const seededRoutines = await connection.db
      .select()
      .from(routine)
      .where(eq(routine.accountId, testAccount.userId));
    const strengthLegRoutine = seededRoutines.find((entry) => entry.name === "Fuerza · Pierna")!;
    const seededRoutineExercises = await connection.db
      .select()
      .from(routineExercise)
      .where(eq(routineExercise.routineId, strengthLegRoutine.id));
    const seededSeriesGoals = await connection.db
      .select()
      .from(routineSeriesGoal)
      .where(eq(routineSeriesGoal.routineExerciseId, seededRoutineExercises[0]!.id));
    const seededPlans = await connection.db
      .select()
      .from(plan)
      .where(eq(plan.accountId, testAccount.userId));
    const strengthPlan = seededPlans.find((entry) => entry.name === "Programa de fuerza")!;
    const seededPlanWeeks = await connection.db
      .select()
      .from(planWeek)
      .where(eq(planWeek.planId, strengthPlan.id));
    const seededPlanTrainings = await connection.db
      .select()
      .from(planTraining)
      .where(eq(planTraining.planId, strengthPlan.id));

    expect(seededExercises).toHaveLength(5);
    expect(seededExercises.every((entry) => entry.accountId === testAccount.userId)).toBe(true);
    expect(seededRoutines.map((entry) => entry.name).sort()).toEqual([
      "Fuerza · Pierna",
      "Fuerza · Torso",
      "Hipertrofia · Pierna",
      "Hipertrofia · Torso",
    ]);
    expect(seededRoutineExercises).toHaveLength(3);
    expect(seededSeriesGoals).toHaveLength(4);
    expect(seededPlans.map((entry) => [entry.name, entry.status]).sort()).toEqual([
      ["Programa de fuerza", "activo"],
      ["Programa de hipertrofia", "borrador"],
    ]);
    expect(seededPlans.every((entry) => /^[0-9a-f]{32}$/.test(entry.id))).toBe(true);
    expect(seededPlanWeeks).toHaveLength(2);
    expect(seededPlanTrainings).toHaveLength(4);
    expect(seededPlanTrainings.every((entry) => entry.routineId !== null)).toBe(true);

    expect(await seedTestAccount(connection.db)).toBe("already-existed");
    expect(
      (await connection.db.select().from(plan).where(eq(plan.accountId, testAccount.userId))).length,
    ).toBe(2);
    expect(
      (await connection.db.select().from(routine).where(eq(routine.accountId, testAccount.userId))).length,
    ).toBe(4);
    expect(
      (await connection.db.select().from(exercise).where(eq(exercise.accountId, testAccount.userId))).length,
    ).toBe(5);
  });
});
