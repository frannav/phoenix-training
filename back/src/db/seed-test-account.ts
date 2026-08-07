import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { normalizeSearchText } from "../catalog/normalize-search-text";
import type { AppDatabase } from "./open-database";
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
} from "./schema";

/**
 * Cuenta fija para trabajar contra la SQLite local sin tener que registrarla
 * manualmente. No se usa desde la aplicación: se ejecuta expresamente con
 * `bun run db:seed`.
 */
export const testAccount = {
  userId: "test-user-phoenix-training",
  accountId: "test-account-phoenix-training",
  name: "Deportista",
  email: "deportista@example.com",
  password: "contraseña-segura",
} as const;

export type SeedTestAccountResult = "created" | "already-existed";

function testOpaqueId(number: number): string {
  return number.toString(16).padStart(32, "0");
}

const testIds = {
  exercises: {
    sentadillaBarra: testOpaqueId(1),
    pressBanca: testOpaqueId(2),
    remoBarra: testOpaqueId(3),
    pesoMuertoRumano: testOpaqueId(4),
    plancha: testOpaqueId(5),
  },
  routines: {
    fuerzaPierna: testOpaqueId(101),
    fuerzaTorso: testOpaqueId(102),
    hipertrofiaTorso: testOpaqueId(103),
    hipertrofiaPierna: testOpaqueId(104),
  },
  plans: {
    fuerzaBase: testOpaqueId(201),
    hipertrofia: testOpaqueId(202),
  },
} as const;

const testExercises = [
  {
    id: testIds.exercises.sentadillaBarra,
    name: "Sentadilla con barra",
    instructions: "Baja con control manteniendo el tronco estable y vuelve a la posición inicial.",
    recordingMode: "fuerza_con_carga" as const,
    category: "Fuerza",
    bodyPart: "Piernas",
    equipment: "Barra",
  },
  {
    id: testIds.exercises.pressBanca,
    name: "Press de banca",
    instructions: "Desciende la barra hacia el pecho y empuja manteniendo los pies apoyados.",
    recordingMode: "fuerza_con_carga" as const,
    category: "Fuerza",
    bodyPart: "Pecho",
    equipment: "Barra y banco",
  },
  {
    id: testIds.exercises.remoBarra,
    name: "Remo con barra",
    instructions: "Inclina el torso, lleva la barra hacia el abdomen y controla la bajada.",
    recordingMode: "fuerza_con_carga" as const,
    category: "Fuerza",
    bodyPart: "Espalda",
    equipment: "Barra",
  },
  {
    id: testIds.exercises.pesoMuertoRumano,
    name: "Peso muerto rumano",
    instructions: "Desplaza la cadera hacia atrás con la espalda neutra y vuelve extendiendo la cadera.",
    recordingMode: "fuerza_con_carga" as const,
    category: "Fuerza",
    bodyPart: "Cadena posterior",
    equipment: "Barra",
  },
  {
    id: testIds.exercises.plancha,
    name: "Plancha frontal",
    instructions: "Mantén el cuerpo alineado y el abdomen activo durante toda la serie.",
    recordingMode: "tiempo_por_serie" as const,
    category: "Core",
    bodyPart: "Abdomen",
    equipment: null,
  },
] as const;

type TestRoutine = {
  id: string;
  name: string;
  exercises: Array<{
    exerciseId: string;
    series: Array<{ carga?: number; repeticiones?: number; duracion?: number }>;
  }>;
};

const testRoutines: TestRoutine[] = [
  {
    id: testIds.routines.fuerzaPierna,
    name: "Fuerza · Pierna",
    exercises: [
      { exerciseId: testIds.exercises.sentadillaBarra, series: [{ carga: 80, repeticiones: 5 }, { carga: 80, repeticiones: 5 }, { carga: 80, repeticiones: 5 }, { carga: 80, repeticiones: 5 }] },
      { exerciseId: testIds.exercises.pesoMuertoRumano, series: [{ carga: 60, repeticiones: 8 }, { carga: 60, repeticiones: 8 }, { carga: 60, repeticiones: 8 }] },
      { exerciseId: testIds.exercises.plancha, series: [{ duracion: 45 }, { duracion: 45 }, { duracion: 45 }] },
    ],
  },
  {
    id: testIds.routines.fuerzaTorso,
    name: "Fuerza · Torso",
    exercises: [
      { exerciseId: testIds.exercises.pressBanca, series: [{ carga: 60, repeticiones: 5 }, { carga: 60, repeticiones: 5 }, { carga: 60, repeticiones: 5 }, { carga: 60, repeticiones: 5 }] },
      { exerciseId: testIds.exercises.remoBarra, series: [{ carga: 50, repeticiones: 8 }, { carga: 50, repeticiones: 8 }, { carga: 50, repeticiones: 8 }] },
      { exerciseId: testIds.exercises.plancha, series: [{ duracion: 45 }, { duracion: 45 }, { duracion: 45 }] },
    ],
  },
  {
    id: testIds.routines.hipertrofiaTorso,
    name: "Hipertrofia · Torso",
    exercises: [
      { exerciseId: testIds.exercises.pressBanca, series: [{ carga: 50, repeticiones: 10 }, { carga: 50, repeticiones: 10 }, { carga: 50, repeticiones: 10 }] },
      { exerciseId: testIds.exercises.remoBarra, series: [{ carga: 40, repeticiones: 12 }, { carga: 40, repeticiones: 12 }, { carga: 40, repeticiones: 12 }] },
      { exerciseId: testIds.exercises.pesoMuertoRumano, series: [{ carga: 50, repeticiones: 10 }, { carga: 50, repeticiones: 10 }, { carga: 50, repeticiones: 10 }] },
    ],
  },
  {
    id: testIds.routines.hipertrofiaPierna,
    name: "Hipertrofia · Pierna",
    exercises: [
      { exerciseId: testIds.exercises.sentadillaBarra, series: [{ carga: 70, repeticiones: 8 }, { carga: 70, repeticiones: 8 }, { carga: 70, repeticiones: 8 }, { carga: 70, repeticiones: 8 }] },
      { exerciseId: testIds.exercises.pesoMuertoRumano, series: [{ carga: 50, repeticiones: 10 }, { carga: 50, repeticiones: 10 }, { carga: 50, repeticiones: 10 }] },
      { exerciseId: testIds.exercises.plancha, series: [{ duracion: 60 }, { duracion: 60 }, { duracion: 60 }] },
    ],
  },
];

const testPlans = [
  {
    id: testIds.plans.fuerzaBase,
    name: "Programa de fuerza",
    status: "activo" as const,
    revision: 2,
    startDate: "2026-08-03",
    weeks: [
      [
        { id: testOpaqueId(301), day: 0, routineId: testIds.routines.fuerzaPierna, plannedDate: "2026-08-03" },
        { id: testOpaqueId(302), day: 2, routineId: testIds.routines.fuerzaTorso, plannedDate: "2026-08-05" },
      ],
      [
        { id: testOpaqueId(303), day: 0, routineId: testIds.routines.fuerzaPierna, plannedDate: "2026-08-10" },
        { id: testOpaqueId(304), day: 2, routineId: testIds.routines.fuerzaTorso, plannedDate: "2026-08-12" },
      ],
    ],
  },
  {
    id: testIds.plans.hipertrofia,
    name: "Programa de hipertrofia",
    status: "borrador" as const,
    revision: 1,
    startDate: null,
    weeks: [
      [
        { id: testOpaqueId(305), day: 1, routineId: testIds.routines.hipertrofiaTorso, plannedDate: null },
        { id: testOpaqueId(306), day: 4, routineId: testIds.routines.hipertrofiaPierna, plannedDate: null },
      ],
    ],
  },
] as const;

async function seedTestTrainingData(database: AppDatabase, now: Date): Promise<void> {
  await database.transaction(async (transaction) => {
    for (const entry of testExercises) {
      await transaction
        .insert(exercise)
        .values({
          id: entry.id,
          accountId: testAccount.userId,
          source: null,
          upstreamId: null,
          sourceRevision: null,
          name: entry.name,
          nameNormalized: normalizeSearchText(entry.name),
          instructions: entry.instructions,
          recordingMode: entry.recordingMode,
          category: entry.category,
          bodyPart: entry.bodyPart,
          equipment: entry.equipment,
          available: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
    }

    for (const [routinePosition, entry] of testRoutines.entries()) {
      await transaction
        .insert(routine)
        .values({
          id: entry.id,
          accountId: testAccount.userId,
          name: entry.name,
          revision: 1,
          archived: false,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();

      for (const [position, routineEntry] of entry.exercises.entries()) {
        const routineExerciseId = testOpaqueId(1001 + routinePosition * 10 + position);
        await transaction
          .insert(routineExercise)
          .values({
            id: routineExerciseId,
            routineId: entry.id,
            exerciseId: routineEntry.exerciseId,
            position,
          })
          .onConflictDoNothing();

        for (const [seriesPosition, series] of routineEntry.series.entries()) {
          await transaction
            .insert(routineSeriesGoal)
            .values({
              id: testOpaqueId(10001 + routinePosition * 100 + position * 10 + seriesPosition),
              routineExerciseId,
              position: seriesPosition,
              carga: series.carga ?? null,
              repeticiones: series.repeticiones ?? null,
              duracion: series.duracion ?? null,
            })
            .onConflictDoNothing();
        }
      }
    }

    for (const [planPosition, entry] of testPlans.entries()) {
      await transaction
        .insert(plan)
        .values({
          id: entry.id,
          accountId: testAccount.userId,
          name: entry.name,
          status: entry.status,
          revision: entry.revision,
          startDate: entry.startDate,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();

      for (const [weekPosition, trainings] of entry.weeks.entries()) {
        const weekId = testOpaqueId(2001 + planPosition * 10 + weekPosition);
        await transaction
          .insert(planWeek)
          .values({ id: weekId, planId: entry.id, position: weekPosition })
          .onConflictDoNothing();

        for (const training of trainings) {
          await transaction
            .insert(planTraining)
            .values({
              id: training.id,
              planId: entry.id,
              weekId,
              day: training.day,
              plannedDate: training.plannedDate,
              status: entry.status === "activo" ? "pendiente" : null,
              source: "rutina",
              routineId: training.routineId,
            })
            .onConflictDoNothing();
        }
      }
    }
  });
}

/**
 * Crea la cuenta de desarrollo una sola vez y conserva cualquier cambio
 * posterior que se haga sobre ella. La contraseña nunca se persiste en claro:
 * Better Auth recibe el mismo formato de hash que usa el registro normal.
 */
export async function seedTestAccount(
  database: AppDatabase,
  now = new Date(),
): Promise<SeedTestAccountResult> {
  const result = await database.transaction(async (transaction) => {
    const existingUserById = await transaction
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, testAccount.userId))
      .get();
    const existingUserByEmail = await transaction
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testAccount.email))
      .get();

    if (existingUserByEmail && existingUserByEmail.id !== testAccount.userId) {
      throw new Error(
        `No se puede sembrar ${testAccount.email}: ya pertenece a otra Cuenta.`,
      );
    }

    if (existingUserById && existingUserById.email !== testAccount.email) {
      throw new Error(
        `No se puede sembrar ${testAccount.userId}: ya pertenece a otra dirección de correo.`,
      );
    }

    if (!existingUserById) {
      await transaction.insert(user).values({
        id: testAccount.userId,
        name: testAccount.name,
        email: testAccount.email,
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingCredential = await transaction
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, testAccount.userId), eq(account.providerId, "credential")))
      .get();

    if (!existingCredential) {
      await transaction.insert(account).values({
        id: testAccount.accountId,
        accountId: testAccount.userId,
        providerId: "credential",
        userId: testAccount.userId,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
        password: await hashPassword(testAccount.password),
        createdAt: now,
        updatedAt: now,
      });
    }

    return existingCredential ? "already-existed" : "created";
  });

  await seedTestTrainingData(database, now);
  return result;
}
