import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app";
import { loadCatalog, readCatalogAssets } from "../src/catalog/load-catalog";
import { migrateDatabase } from "../src/db/migrate";
import { openDatabase, type DatabaseConnection } from "../src/db/open-database";
import { plan as planTable } from "../src/db/schema";
import type { MailAdapter } from "../src/mail/mail-adapter";

const baseUrl = "http://127.0.0.1:3000";
const origin = baseUrl;

type SentEmail = { to: string; url: string };

type TestContext = {
  connection: DatabaseConnection;
  app: ReturnType<typeof createApp>;
  sentEmails: SentEmail[];
};

function createTestContext(): TestContext {
  const sentEmails: SentEmail[] = [];
  const mailAdapter: MailAdapter = {
    sendVerificationEmail: async ({ to, url }) => {
      sentEmails.push({ to, url });
    },
    sendPasswordResetEmail: async ({ to, url }) => {
      sentEmails.push({ to, url });
    },
  };
  const connection = openDatabase(":memory:");
  return {
    connection,
    app: createApp({
      database: connection.db,
      auth: { baseUrl, trustedOrigins: [origin] },
      mailAdapter,
    }),
    sentEmails,
  };
}

function tokenFromUrl(url: string): string {
  return new URL(url).searchParams.get("token") ?? "";
}

async function registerVerified(context: TestContext, email: string): Promise<string> {
  const registered = await context.app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ name: "Deportista", email, password: "contraseña-segura" }),
  });
  expect(registered.status).toBe(200);

  const sent = context.sentEmails.at(-1);
  expect(sent).toBeDefined();
  const verified = await context.app.request(
    `/api/auth/verify-email?token=${tokenFromUrl(sent!.url)}`,
  );
  expect(verified.status).toBe(302);

  const session = await context.app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, password: "contraseña-segura" }),
  });
  expect(session.status).toBe(200);
  const setCookies = session.headers.getSetCookie();
  const cookie = setCookies
    .map((entry: string) => entry.split(";")[0])
    .filter((entry): entry is string => entry !== undefined)
    .find((entry) => entry.startsWith("better-auth.session_token="));
  expect(cookie).toBeDefined();
  return cookie!;
}

async function loadRealCatalog(context: TestContext): Promise<void> {
  const assets = await readCatalogAssets();
  const result = await loadCatalog(context.connection.db, assets);
  expect(result.added).toBeGreaterThan(0);
}

export type ExerciseItem = {
  id: string;
  name: string;
  instructions: string;
  recordingMode: string;
  category: string;
  bodyPart: string | null;
  equipment: string | null;
  provenance: "catalogo" | "personalizado";
  available: boolean;
};

async function exerciseOfMode(
  context: TestContext,
  cookie: string,
  recordingMode: string,
): Promise<ExerciseItem> {
  const response = await context.app.request(
    `/api/exercises?recordingMode=${recordingMode}&limit=1`,
    { headers: { Cookie: cookie, Origin: origin } },
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { items: ExerciseItem[] };
  expect(body.items.length).toBeGreaterThan(0);
  return body.items[0]!;
}

export type RoutineSeriesGoalDocument = {
  id: string;
  order: number;
  carga: number | null;
  repeticiones: number | null;
  duracion: number | null;
};

export type RoutineExerciseDocument = {
  id: string;
  exerciseId: string;
  order: number;
  exercise: {
    id: string;
    name: string;
    recordingMode: string;
    available: boolean;
    provenance: "catalogo" | "personalizado";
  };
  series: RoutineSeriesGoalDocument[];
};

export type RoutineDocument = {
  id: string;
  name: string;
  revision: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  exercises: RoutineExerciseDocument[];
};

export type PlanSeriesGoalDocument = {
  id: string;
  order: number;
  carga: number | null;
  repeticiones: number | null;
  duracion: number | null;
};

export type PlanExerciseDocument = {
  id: string;
  exerciseId: string;
  order: number;
  exercise: {
    id: string;
    name: string;
    recordingMode: string;
    available: boolean;
    provenance: "catalogo" | "personalizado";
  };
  series: PlanSeriesGoalDocument[];
};

export type PlanTrainingDocument = {
  id: string;
  day: number;
  source: "rutina" | "especifico";
  routineId: string | null;
  routine: { id: string; name: string; archived: boolean } | null;
  content: PlanExerciseDocument[];
};

export type PlanWeekDocument = {
  id: string;
  order: number;
  trainings: PlanTrainingDocument[];
};

export type PlanDocument = {
  id: string;
  name: string;
  status: "borrador" | "activo" | "completado";
  revision: number;
  weeks: PlanWeekDocument[];
  createdAt: string;
  updatedAt: string;
};

type SeriesInput = {
  id?: string;
  carga?: number | null;
  repeticiones?: number | null;
  duracion?: number | null;
};

type SpecificExerciseInput = {
  id?: string;
  exerciseId: string;
  series: SeriesInput[];
};

type TrainingInput = {
  id?: string;
  day: number;
  source: "rutina" | "especifico";
  routineId?: string | null;
  specific?: SpecificExerciseInput[];
};

type WeekInput = {
  id?: string;
  trainings: TrainingInput[];
};

function planPayload(weeks: WeekInput[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Ciclo base",
    weeks: weeks.map((week) => ({
      ...week,
      trainings: week.trainings.map((training) => ({
        ...training,
        specific: training.specific ?? [],
      })),
    })),
    ...overrides,
  };
}

async function createRoutine(
  context: TestContext,
  cookie: string,
  body: Record<string, unknown>,
): Promise<RoutineDocument> {
  const response = await context.app.request("/api/routines", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { routine: RoutineDocument }).routine;
}

async function createPlan(
  context: TestContext,
  cookie: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request("/api/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function replacePlan(
  context: TestContext,
  id: string,
  cookie: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(`/api/plans/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function getPlan(
  context: TestContext,
  id: string,
  cookie: string,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(`/api/plans/${id}`, {
    headers: { Cookie: cookie, Origin: origin },
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function deletePlan(
  context: TestContext,
  id: string,
  cookie: string,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(`/api/plans/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: origin },
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

describe("crear Planes borrador", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let press: ExerciseItem;
  let dominada: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
    press = await exerciseOfMode(context, cookie, "fuerza_con_carga");
    dominada = await exerciseOfMode(context, cookie, "repeticiones_sin_carga");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("crea un borrador privado con nombre, semanas y Entrenamientos planificados con referencia viva o contenido específico", async () => {
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [
        { exerciseId: press.id, series: [{ carga: 60, repeticiones: 10 }] },
        { exerciseId: dominada.id, series: [{ repeticiones: 6 }] },
      ],
    });

    const { status, body } = await createPlan(
      context!,
      cookie,
      planPayload([
        { trainings: [{ day: 0, source: "rutina", routineId: routine.id }] },
        {
          trainings: [
            {
              day: 2,
              source: "especifico",
              specific: [{ exerciseId: press.id, series: [{ carga: 70, repeticiones: 8 }] }],
            },
          ],
        },
      ]),
    );
    expect(status).toBe(201);

    const plan = (body as { plan: PlanDocument }).plan;
    expect(plan.id).toMatch(/^[0-9a-f]{32}$/);
    expect(plan.name).toBe("Ciclo base");
    expect(plan.status).toBe("borrador");
    expect(plan.revision).toBe(1);
    expect(typeof plan.createdAt).toBe("string");
    expect(typeof plan.updatedAt).toBe("string");

    expect(plan.weeks).toHaveLength(2);
    const firstWeek = plan.weeks[0]!;
    expect(firstWeek.id).toMatch(/^[0-9a-f]{32}$/);
    expect(firstWeek.order).toBe(0);
    expect(firstWeek.trainings).toHaveLength(1);

    // referencia viva a la Rutina: el servidor resuelve su contenido actual
    const routineTraining = firstWeek.trainings[0]!;
    expect(routineTraining).toMatchObject({
      day: 0,
      source: "rutina",
      routineId: routine.id,
      routine: { id: routine.id, name: "Día de empuje", archived: false },
    });
    expect(routineTraining.id).toMatch(/^[0-9a-f]{32}$/);
    expect(routineTraining.content).toHaveLength(2);
    expect(routineTraining.content[0]).toMatchObject({
      exerciseId: press.id,
      order: 0,
      exercise: { id: press.id, name: press.name, recordingMode: "fuerza_con_carga" },
      series: [{ order: 0, carga: 60, repeticiones: 10 }],
    });
    expect(routineTraining.content[0]!.id).toMatch(/^[0-9a-f]{32}$/);
    expect(routineTraining.content[1]).toMatchObject({ exerciseId: dominada.id });

    // Entrenamiento específico independiente con su propio contenido
    const specificTraining = plan.weeks[1]!.trainings[0]!;
    expect(specificTraining).toMatchObject({
      day: 2,
      source: "especifico",
      routineId: null,
      routine: null,
    });
    expect(specificTraining.content).toHaveLength(1);
    expect(specificTraining.content[0]).toMatchObject({
      exerciseId: press.id,
      order: 0,
      series: [{ order: 0, carga: 70, repeticiones: 8 }],
    });
    expect(specificTraining.content[0]!.id).toMatch(/^[0-9a-f]{32}$/);
  });

  test("sin sesión la creación responde 401", async () => {
    const response = await context!.app.request("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(planPayload([])),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Debes iniciar sesión para consultar los Planes.",
      },
    });
  });

  test("valida el nombre del Plan", async () => {
    const { status, body } = await createPlan(
      context!,
      cookie,
      planPayload(
        [{ trainings: [{ day: 0, source: "rutina", routineId: "r" }] }],
        { name: "   " },
      ),
    );
    expect(status).toBe(400);
    const error = (body as { error: { code: string; fields?: Record<string, string[]> } }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.name).toBeDefined();
  });
});

describe("validación del agregado de Planes", () => {
  let context: TestContext | undefined;
  let cookieA: string;
  let cookieB: string;
  let press: ExerciseItem;
  let trote: ExerciseItem;
  let custom: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookieA = await registerVerified(context, "a@example.com");
    cookieB = await registerVerified(context, "b@example.com");
    press = await exerciseOfMode(context, cookieA, "fuerza_con_carga");
    trote = await exerciseOfMode(context, cookieA, "cardio_continuo");

    const created = await context!.app.request("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieA, Origin: origin },
      body: JSON.stringify({
        name: "Peso muerto con mancuerna",
        instructions: "Extiende la cadera manteniendo la espalda neutra.",
        recordingMode: "fuerza_con_carga",
        category: "Espalda",
      }),
    });
    custom = ((await created.json()) as { exercise: ExerciseItem }).exercise;
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("un borrador necesita al menos una semana y un Entrenamiento planificado", async () => {
    const noWeeks = await createPlan(context!, cookieA, planPayload([]));
    expect(noWeeks.status).toBe(400);
    expect(
      (noWeeks.body as { error: { fields?: Record<string, string[]> } }).error.fields?.weeks,
    ).toBeDefined();

    const emptyWeek = await createPlan(context!, cookieA, planPayload([{ trainings: [] }]));
    expect(emptyWeek.status).toBe(400);
    expect(
      (emptyWeek.body as { error: { fields?: Record<string, string[]> } }).error.fields?.weeks,
    ).toBeDefined();
  });

  test("cada Entrenamiento ocupa un día concreto y un día solo contiene uno", async () => {
    const outOfRange = await createPlan(
      context!,
      cookieA,
      planPayload([{ trainings: [{ day: 7, source: "especifico", specific: [] }] }]),
    );
    expect(outOfRange.status).toBe(400);
    expect(
      (outOfRange.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].day"
      ],
    ).toBeDefined();

    const duplicateDay = await createPlan(
      context!,
      cookieA,
      planPayload([
        {
          trainings: [
            { day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }] },
            { day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 8 }] }] },
          ],
        },
      ]),
    );
    expect(duplicateDay.status).toBe(400);
    expect(
      (duplicateDay.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[1].day"
      ],
    ).toBeDefined();

    // el mismo día en semanas distintas sí está permitido
    const sameDayDifferentWeeks = await createPlan(
      context!,
      cookieA,
      planPayload([
        { trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }] }] },
        { trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 8 }] }] }] },
      ]),
    );
    expect(sameDayDifferentWeeks.status).toBe(201);
  });

  test("una referencia viva exige una Rutina propia disponible y sin contenido específico", async () => {
    const routine = await createRoutine(context!, cookieA, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press.id, series: [{ carga: 60, repeticiones: 10 }] }],
    });

    // sin Rutina elegida
    const missingRoutine = await createPlan(
      context!,
      cookieA,
      planPayload([{ trainings: [{ day: 0, source: "rutina" }] }]),
    );
    expect(missingRoutine.status).toBe(400);
    expect(
      (missingRoutine.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].routineId"
      ],
    ).toBeDefined();

    // Rutina inexistente
    const unknownRoutine = await createPlan(
      context!,
      cookieA,
      planPayload([
        { trainings: [{ day: 0, source: "rutina", routineId: "ffffffffffffffffffffffffffffffff" }] },
      ]),
    );
    expect(unknownRoutine.status).toBe(400);
    expect(
      (unknownRoutine.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].routineId"
      ],
    ).toBeDefined();

    // Rutina de la otra Cuenta: se comporta como inexistente
    const foreignRoutine = await createRoutine(context!, cookieB, {
      name: "De B",
      exercises: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }],
    });
    const foreign = await createPlan(
      context!,
      cookieA,
      planPayload([
        { trainings: [{ day: 0, source: "rutina", routineId: foreignRoutine.id }] },
      ]),
    );
    expect(foreign.status).toBe(400);
    expect(
      (foreign.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].routineId"
      ],
    ).toBeDefined();

    // Rutina archivada: retirada de los usos nuevos
    await context!.app.request(`/api/routines/${routine.id}/archive`, {
      method: "POST",
      headers: { Cookie: cookieA, Origin: origin },
    });
    const archived = await createPlan(
      context!,
      cookieA,
      planPayload([{ trainings: [{ day: 0, source: "rutina", routineId: routine.id }] }]),
    );
    expect(archived.status).toBe(400);
    expect(
      (archived.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].routineId"
      ],
    ).toBeDefined();

    // un Entrenamiento con Rutina no lleva contenido específico
    const mixed = await createPlan(
      context!,
      cookieA,
      planPayload([
        {
          trainings: [
            {
              day: 0,
              source: "rutina",
              routineId: routine.id,
              specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }],
            },
          ],
        },
      ]),
    );
    expect(mixed.status).toBe(400);
    expect(
      (mixed.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].specific"
      ],
    ).toBeDefined();
  });

  test("un Entrenamiento específico valida Ejercicios, Forma de registro y límites", async () => {
    // referencia a Rutina dentro de un Entrenamiento específico
    const routine = await createRoutine(context!, cookieA, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }],
    });
    const withRoutine = await createPlan(
      context!,
      cookieA,
      planPayload([
        {
          trainings: [
            {
              day: 0,
              source: "especifico",
              routineId: routine.id,
              specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }],
            },
          ],
        },
      ]),
    );
    expect(withRoutine.status).toBe(400);
    expect(
      (withRoutine.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].routineId"
      ],
    ).toBeDefined();

    // sin Ejercicios
    const empty = await createPlan(
      context!,
      cookieA,
      planPayload([{ trainings: [{ day: 0, source: "especifico", specific: [] }] }]),
    );
    expect(empty.status).toBe(400);
    expect(
      (empty.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].specific"
      ],
    ).toBeDefined();

    // cardio continuo con dos Series por aparición
    const cardio = await createPlan(
      context!,
      cookieA,
      planPayload([
        {
          trainings: [
            {
              day: 0,
              source: "especifico",
              specific: [
                { exerciseId: trote.id, series: [{ duracion: 1800 }, { duracion: 1800 }] },
              ],
            },
          ],
        },
      ]),
    );
    expect(cardio.status).toBe(400);
    expect(
      (cardio.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].specific[0].series"
      ],
    ).toBeDefined();

    // la duración no es un objetivo de la fuerza con carga
    const badTarget = await createPlan(
      context!,
      cookieA,
      planPayload([
        {
          trainings: [
            {
              day: 0,
              source: "especifico",
              specific: [{ exerciseId: press.id, series: [{ duracion: 600 }] }],
            },
          ],
        },
      ]),
    );
    expect(badTarget.status).toBe(400);
    expect(
      (badTarget.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].specific[0].series[0].duracion"
      ],
    ).toBeDefined();

    // límites de dominio: carga de 0 a 9999,99 con dos decimales
    const tooHeavy = await createPlan(
      context!,
      cookieA,
      planPayload([
        {
          trainings: [
            {
              day: 0,
              source: "especifico",
              specific: [{ exerciseId: press.id, series: [{ carga: 10000 }] }],
            },
          ],
        },
      ]),
    );
    expect(tooHeavy.status).toBe(400);
    expect(
      (tooHeavy.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].specific[0].series[0].carga"
      ],
    ).toBeDefined();

    // un Ejercicio ajeno o no disponible no entra en un Entrenamiento específico
    const createdB = await context!.app.request("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieB, Origin: origin },
      body: JSON.stringify({
        name: "Curl martillo",
        instructions: "Flexiona el codo con la palma mirando al cuerpo.",
        recordingMode: "fuerza_con_carga",
        category: "Brazos",
      }),
    });
    const foreignExerciseId = ((await createdB.json()) as { exercise: ExerciseItem }).exercise.id;
    const foreign = await createPlan(
      context!,
      cookieA,
      planPayload([
        {
          trainings: [
            {
              day: 0,
              source: "especifico",
              specific: [{ exerciseId: foreignExerciseId, series: [{ repeticiones: 10 }] }],
            },
          ],
        },
      ]),
    );
    expect(foreign.status).toBe(400);
    expect(
      (foreign.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].specific[0].exerciseId"
      ],
    ).toBeDefined();

    await context!.app.request(`/api/exercises/${custom.id}/archive`, {
      method: "POST",
      headers: { Cookie: cookieA, Origin: origin },
    });
    const archived = await createPlan(
      context!,
      cookieA,
      planPayload([
        {
          trainings: [
            {
              day: 0,
              source: "especifico",
              specific: [{ exerciseId: custom.id, series: [{ repeticiones: 10 }] }],
            },
          ],
        },
      ]),
    );
    expect(archived.status).toBe(400);
    expect(
      (archived.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "weeks[0].trainings[0].specific[0].exerciseId"
      ],
    ).toBeDefined();
  });
});

describe("referencia viva y personalizar solo este día", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let press: ExerciseItem;
  let dominada: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
    press = await exerciseOfMode(context, cookie, "fuerza_con_carga");
    dominada = await exerciseOfMode(context, cookie, "repeticiones_sin_carga");
  });

  afterEach(() => {
    context?.connection.close();
  });

  async function routineWithPress(): Promise<RoutineDocument> {
    return createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [
        { exerciseId: press.id, series: [{ carga: 60, repeticiones: 10 }] },
        { exerciseId: dominada.id, series: [{ repeticiones: 6 }] },
      ],
    });
  }

  test("un Entrenamiento con Rutina muestra su contenido actual aunque la Rutina cambie después", async () => {
    const routine = await routineWithPress();
    const created = await createPlan(
      context!,
      cookie,
      planPayload([{ trainings: [{ day: 0, source: "rutina", routineId: routine.id }] }]),
    );
    expect(created.status).toBe(201);
    const plan = (created.body as { plan: PlanDocument }).plan;

    // la Rutina cambia después de crear el Plan
    const replaced = await context!.app.request(`/api/routines/${routine.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({
        revision: routine.revision,
        name: "Día de empuje v2",
        exercises: [{ exerciseId: press.id, series: [{ carga: 75, repeticiones: 8 }] }],
      }),
    });
    expect(replaced.status).toBe(200);

    // el Plan muestra el contenido vigente de la Rutina: la referencia es viva
    const fetched = (await getPlan(context!, plan.id, cookie)).body as { plan: PlanDocument };
    const training = fetched.plan.weeks[0]!.trainings[0]!;
    expect(training.routine).toMatchObject({ name: "Día de empuje v2" });
    expect(training.content).toHaveLength(1);
    expect(training.content[0]).toMatchObject({
      exerciseId: press.id,
      series: [{ order: 0, carga: 75, repeticiones: 8 }],
    });
  });

  test("personalizar un día copia el contenido actual y deja de seguir la Rutina", async () => {
    const routine = await routineWithPress();
    const created = await createPlan(
      context!,
      cookie,
      planPayload([{ trainings: [{ day: 0, source: "rutina", routineId: routine.id }] }]),
    );
    const plan = (created.body as { plan: PlanDocument }).plan;
    const training = plan.weeks[0]!.trainings[0]!;
    const routineExerciseIds = training.content.map((entry) => entry.id);
    const routineSeriesIds = training.content.flatMap((entry) => entry.series.map((series) => series.id));

    // «Personalizar solo este día»: el mismo Entrenamiento pasa a contenido
    // específico copiando el contenido vigente de la Rutina.
    const personalized = await replacePlan(context!, plan.id, cookie, {
      revision: plan.revision,
      name: plan.name,
      weeks: [
        {
          id: plan.weeks[0]!.id,
          trainings: [
            {
              id: training.id,
              day: 0,
              source: "especifico",
              specific: training.content.map((entry) => ({
                exerciseId: entry.exerciseId,
                series: entry.series.map((series) => ({
                  carga: series.carga,
                  repeticiones: series.repeticiones,
                  duracion: series.duracion,
                })),
              })),
            },
          ],
        },
      ],
    });
    expect(personalized.status).toBe(200);
    const updated = (personalized.body as { plan: PlanDocument }).plan;
    expect(updated.revision).toBe(2);
    const day = updated.weeks[0]!.trainings[0]!;
    expect(day.id).toBe(training.id);
    expect(day.source).toBe("especifico");
    expect(day.routineId).toBeNull();
    expect(day.routine).toBeNull();
    expect(day.content).toHaveLength(2);
    // las copias son independientes: identidades nuevas asignadas por el servidor
    for (const entry of day.content) {
      expect(entry.id).toMatch(/^[0-9a-f]{32}$/);
      expect(routineExerciseIds).not.toContain(entry.id);
      for (const series of entry.series) {
        expect(series.id).toMatch(/^[0-9a-f]{32}$/);
        expect(routineSeriesIds).not.toContain(series.id);
      }
    }
    expect(day.content[0]).toMatchObject({
      exerciseId: press.id,
      series: [{ carga: 60, repeticiones: 10 }],
    });

    // la Rutina cambia de nuevo: el día personalizado ya no la sigue
    await context!.app.request(`/api/routines/${routine.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({
        revision: routine.revision,
        name: "Día de empuje v3",
        exercises: [{ exerciseId: press.id, series: [{ carga: 90, repeticiones: 5 }] }],
      }),
    });

    const after = (await getPlan(context!, plan.id, cookie)).body as { plan: PlanDocument };
    const independent = after.plan.weeks[0]!.trainings[0]!;
    expect(independent.source).toBe("especifico");
    expect(independent.content[0]).toMatchObject({
      exerciseId: press.id,
      series: [{ carga: 60, repeticiones: 10 }],
    });
    expect(independent.content[1]).toMatchObject({ exerciseId: dominada.id });
  });
});

describe("editar Planes con concurrencia optimista", () => {
  let context: TestContext | undefined;
  let cookieA: string;
  let cookieB: string;
  let press: ExerciseItem;
  let dominada: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookieA = await registerVerified(context, "a@example.com");
    cookieB = await registerVerified(context, "b@example.com");
    press = await exerciseOfMode(context, cookieA, "fuerza_con_carga");
    dominada = await exerciseOfMode(context, cookieA, "repeticiones_sin_carga");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("la edición sustituye el agregado completo y conserva las identidades de los hijos", async () => {
    const routine = await createRoutine(context!, cookieA, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }],
    });
    const created = await createPlan(
      context!,
      cookieA,
      planPayload([
        {
          trainings: [
            { day: 0, source: "rutina", routineId: routine.id },
            {
              day: 2,
              source: "especifico",
              specific: [
                { exerciseId: press.id, series: [{ carga: 60, repeticiones: 10 }, { repeticiones: 8 }] },
              ],
            },
          ],
        },
      ]),
    );
    const before = (created.body as { plan: PlanDocument }).plan;
    const week = before.weeks[0]!;
    const routineDay = week.trainings[0]!;
    const specificDay = week.trainings[1]!;
    const specificExercise = specificDay.content[0]!;
    const firstSeries = specificExercise.series[0]!;

    const { status, body } = await replacePlan(context!, before.id, cookieA, {
      revision: before.revision,
      name: "Ciclo base v2",
      weeks: [
        {
          id: week.id,
          trainings: [
            {
              id: routineDay.id,
              day: 1,
              source: "rutina",
              routineId: routine.id,
            },
            {
              id: specificDay.id,
              day: 3,
              source: "especifico",
              specific: [
                {
                  id: specificExercise.id,
                  exerciseId: press.id,
                  series: [
                    { id: firstSeries.id, carga: 65, repeticiones: 8 },
                    { repeticiones: 6 },
                  ],
                },
              ],
            },
          ],
        },
        {
          trainings: [{ day: 0, source: "rutina", routineId: routine.id }],
        },
      ],
    });
    expect(status).toBe(200);

    const updated = (body as { plan: PlanDocument }).plan;
    expect(updated.revision).toBe(2);
    expect(updated.name).toBe("Ciclo base v2");
    expect(updated.weeks).toHaveLength(2);

    // semana y Entrenamientos existentes conservan su identidad y su día cambia
    expect(updated.weeks[0]!.id).toBe(week.id);
    const movedRoutine = updated.weeks[0]!.trainings[0]!;
    expect(movedRoutine.id).toBe(routineDay.id);
    expect(movedRoutine.day).toBe(1);
    const movedSpecific = updated.weeks[0]!.trainings[1]!;
    expect(movedSpecific.id).toBe(specificDay.id);
    expect(movedSpecific.day).toBe(3);
    expect(movedSpecific.content[0]!.id).toBe(specificExercise.id);
    expect(movedSpecific.content[0]!.series[0]!.id).toBe(firstSeries.id);
    expect(movedSpecific.content[0]!.series[0]).toMatchObject({ carga: 65, repeticiones: 8 });
    expect(movedSpecific.content[0]!.series[1]!.id).toMatch(/^[0-9a-f]{32}$/);

    // la semana nueva recibe identidad del servidor
    expect(updated.weeks[1]!.id).toMatch(/^[0-9a-f]{32}$/);
    expect(updated.weeks[1]!.id).not.toBe(week.id);
    expect(updated.weeks[1]!.trainings[0]!.id).toMatch(/^[0-9a-f]{32}$/);
  });

  test("una edición con revisión obsoleta devuelve conflicto y no sobrescribe", async () => {
    const created = await createPlan(
      context!,
      cookieA,
      planPayload([{ trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }] }] }]),
    );
    const plan = (created.body as { plan: PlanDocument }).plan;

    const firstEdit = await replacePlan(context!, plan.id, cookieA, {
      revision: plan.revision,
      name: "Primera edición",
      weeks: plan.weeks.map((week) => ({
        id: week.id,
        trainings: week.trainings.map((training) => ({
          id: training.id,
          day: training.day,
          source: training.source,
          routineId: training.routineId,
          specific: training.content.map((entry) => ({
            id: entry.id,
            exerciseId: entry.exerciseId,
            series: entry.series.map((series) => ({
              id: series.id,
              carga: series.carga,
              repeticiones: series.repeticiones,
              duracion: series.duracion,
            })),
          })),
        })),
      })),
    });
    expect(firstEdit.status).toBe(200);
    expect((firstEdit.body as { plan: PlanDocument }).plan.revision).toBe(2);

    const staleEdit = await replacePlan(context!, plan.id, cookieA, {
      revision: plan.revision,
      name: "Edición obsoleta",
      weeks: [
        {
          trainings: [
            {
              day: 0,
              source: "especifico",
              specific: [{ exerciseId: dominada.id, series: [{ repeticiones: 5 }] }],
            },
          ],
        },
      ],
    });
    expect(staleEdit.status).toBe(409);
    expect(staleEdit.body).toEqual({
      error: {
        code: "STALE_REVISION",
        message: "El Plan fue modificado por otra sesión. Carga la versión actual antes de guardar.",
      },
    });

    const current = (await getPlan(context!, plan.id, cookieA)).body as { plan: PlanDocument };
    expect(current.plan.name).toBe("Primera edición");
    expect(current.plan.revision).toBe(2);
  });

  test("dos escrituras concurrentes con la misma revisión no se sobrescriben", async () => {
    const created = await createPlan(
      context!,
      cookieA,
      planPayload([{ trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }] }] }]),
    );
    const plan = (created.body as { plan: PlanDocument }).plan;

    const [editA, editB] = await Promise.all([
      replacePlan(context!, plan.id, cookieA, {
        revision: plan.revision,
        name: "Edición A",
        weeks: [{ trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 5 }] }] }] }],
      }),
      replacePlan(context!, plan.id, cookieA, {
        revision: plan.revision,
        name: "Edición B",
        weeks: [{ trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: dominada.id, series: [{ repeticiones: 12 }] }] }] }],
      }),
    ]);

    expect([editA.status, editB.status].sort()).toEqual([200, 409]);
    const conflict = editA.status === 409 ? editA : editB;
    expect(conflict.body).toEqual({
      error: {
        code: "STALE_REVISION",
        message: "El Plan fue modificado por otra sesión. Carga la versión actual antes de guardar.",
      },
    });

    const winner = editA.status === 200 ? editA : editB;
    const winnerDocument = (winner.body as { plan: PlanDocument }).plan;
    const current = (await getPlan(context!, plan.id, cookieA)).body as { plan: PlanDocument };
    expect(current.plan.revision).toBe(2);
    expect(current.plan.name).toBe(winnerDocument.name);
    expect(current.plan.weeks[0]!.trainings).toHaveLength(1);
    expect(current.plan.weeks[0]!.trainings[0]).toMatchObject(
      winnerDocument.weeks[0]!.trainings[0]!,
    );
  });

  test("editar el Plan de otra Cuenta responde inexistente", async () => {
    const created = await createPlan(
      context!,
      cookieA,
      planPayload([{ trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }] }] }]),
    );
    const id = (created.body as { plan: PlanDocument }).plan.id;

    const fromB = await replacePlan(context!, id, cookieB, {
      revision: 1,
      name: "Renombrado ajeno",
      weeks: [
        {
          trainings: [
            {
              day: 0,
              source: "especifico",
              specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }],
            },
          ],
        },
      ],
    });
    expect(fromB.status).toBe(404);
  });
});

describe("eliminar borradores", () => {
  let context: TestContext | undefined;
  let cookieA: string;
  let cookieB: string;
  let press: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookieA = await registerVerified(context, "a@example.com");
    cookieB = await registerVerified(context, "b@example.com");
    press = await exerciseOfMode(context, cookieA, "fuerza_con_carga");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("eliminar un borrador no elimina las Rutinas ni Ejercicios que referencia", async () => {
    const routine = await createRoutine(context!, cookieA, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }],
    });
    const created = await createPlan(
      context!,
      cookieA,
      planPayload([
        {
          trainings: [
            { day: 0, source: "rutina", routineId: routine.id },
            {
              day: 2,
              source: "especifico",
              specific: [{ exerciseId: press.id, series: [{ repeticiones: 8 }] }],
            },
          ],
        },
      ]),
    );
    const planId = (created.body as { plan: PlanDocument }).plan.id;

    const deleted = await deletePlan(context!, planId, cookieA);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ deleted: true });

    // el Plan desaparece
    const afterDelete = await getPlan(context!, planId, cookieA);
    expect(afterDelete.status).toBe(404);

    // la Rutina y el Ejercicio siguen existiendo
    const routineAfter = await context!.app.request(`/api/routines/${routine.id}`, {
      headers: { Cookie: cookieA, Origin: origin },
    });
    expect(routineAfter.status).toBe(200);
    const exerciseAfter = await context!.app.request(`/api/exercises/${press.id}`, {
      headers: { Cookie: cookieA, Origin: origin },
    });
    expect(exerciseAfter.status).toBe(200);

    // eliminar de nuevo responde inexistente
    const again = await deletePlan(context!, planId, cookieA);
    expect(again.status).toBe(404);
  });

  test("un Plan que ya no es borrador no puede eliminarse", async () => {
    const created = await createPlan(
      context!,
      cookieA,
      planPayload([{ trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }] }] }]),
    );
    const planId = (created.body as { plan: PlanDocument }).plan.id;

    // Preparación de estado: la activación (ticket 23) todavía no existe por
    // la API, así que el test pone el Plan en «activo» directamente para
    // comprobar la guarda de la transición imposible por la operación pública.
    await context!.connection.db
      .update(planTable)
      .set({ status: "activo" })
      .where(eq(planTable.id, planId));

    const deleted = await deletePlan(context!, planId, cookieA);
    expect(deleted.status).toBe(409);
    expect(deleted.body).toEqual({
      error: {
        code: "TRANSITION_IMPOSSIBLE",
        message: "Solo un Plan borrador puede eliminarse.",
      },
    });
  });

  test("no se puede eliminar el Plan de otra Cuenta ni uno inexistente", async () => {
    const created = await createPlan(
      context!,
      cookieA,
      planPayload([{ trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }] }] }]),
    );
    const id = (created.body as { plan: PlanDocument }).plan.id;

    const foreign = await deletePlan(context!, id, cookieB);
    expect(foreign.status).toBe(404);
    const unknown = await deletePlan(context!, "ffffffffffffffffffffffffffffffff", cookieA);
    expect(unknown.status).toBe(404);
  });
});

describe("listar y aislar Planes por Cuenta", () => {
  let context: TestContext | undefined;
  let cookieA: string;
  let cookieB: string;
  let press: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookieA = await registerVerified(context, "a@example.com");
    cookieB = await registerVerified(context, "b@example.com");
    press = await exerciseOfMode(context, cookieA, "fuerza_con_carga");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("el listado devuelve Planes completos y cada Cuenta solo ve los suyos", async () => {
    await createPlan(
      context!,
      cookieA,
      planPayload([{ trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }] }] }], {
        name: "De A",
      }),
    );
    await createPlan(
      context!,
      cookieB,
      planPayload([{ trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 12 }] }] }] }], {
        name: "De B",
      }),
    );

    const fromA = (await (await context!.app.request("/api/plans", {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { items: PlanDocument[] };
    const fromB = (await (await context!.app.request("/api/plans", {
      headers: { Cookie: cookieB, Origin: origin },
    })).json()) as { items: PlanDocument[] };

    expect(fromA.items.map((item) => item.name)).toEqual(["De A"]);
    expect(fromB.items.map((item) => item.name)).toEqual(["De B"]);
    const listed = fromA.items[0]!;
    expect(listed.status).toBe("borrador");
    expect(listed.weeks[0]!.trainings).toHaveLength(1);
    expect(listed.weeks[0]!.trainings[0]!.content[0]!.exerciseId).toBe(press.id);
  });

  test("obtener un Plan devuelve su documento canónico con la misma identidad", async () => {
    const created = await createPlan(
      context!,
      cookieA,
      planPayload([{ trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }] }] }]),
    );
    const createdPlan = (created.body as { plan: PlanDocument }).plan;

    const response = await context!.app.request(`/api/plans/${createdPlan.id}`, {
      headers: { Cookie: cookieA, Origin: origin },
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { plan: PlanDocument };
    expect(payload.plan).toEqual(createdPlan);
  });

  test("el Plan de otra Cuenta o inexistente responde 404", async () => {
    const created = await createPlan(
      context!,
      cookieA,
      planPayload([{ trainings: [{ day: 0, source: "especifico", specific: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }] }] }]),
    );
    const id = (created.body as { plan: PlanDocument }).plan.id;

    const fromB = await context!.app.request(`/api/plans/${id}`, {
      headers: { Cookie: cookieB, Origin: origin },
    });
    expect(fromB.status).toBe(404);

    const unknown = await context!.app.request(
      "/api/plans/ffffffffffffffffffffffffffffffff",
      { headers: { Cookie: cookieA, Origin: origin } },
    );
    expect(unknown.status).toBe(404);
  });
});
