import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { loadCatalog, readCatalogAssets } from "../src/catalog/load-catalog";
import { migrateDatabase } from "../src/db/migrate";
import { openDatabase, type DatabaseConnection } from "../src/db/open-database";
import type { MailAdapter } from "../src/mail/mail-adapter";

const baseUrl = "http://127.0.0.1:3000";
const origin = baseUrl;
const fixedNow = new Date("2025-03-10T09:30:00.000Z");

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
      now: () => new Date(fixedNow.getTime()),
    }),
    sentEmails,
  };
}

function tokenFromUrl(url: string): string {
  return new URL(url).searchParams.get("token") ?? "";
}

async function registerVerified(
  context: TestContext,
  email: string,
): Promise<string> {
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

export type SeriesDocument = {
  id: string;
  order: number;
  status: "pendiente" | "completada" | "omitida";
  added: boolean;
  goal: { carga: number | null; repeticiones: number | null; duracion: number | null };
  result: { carga: number | null; repeticiones: number | null; duracion: number | null };
  rpe: number | null;
};

export type SessionExerciseDocument = {
  id: string;
  exerciseId: string;
  sortOrder: number;
  /** Aparición añadida durante la Sesión (`true`) o prevista del origen (`false`). */
  added: boolean;
  exercise: {
    id: string;
    name: string;
    recordingMode: string;
    provenance: "catalogo" | "personalizado";
  };
  series: SeriesDocument[];
};

export type SessionOrigin = "libre" | "rutina" | "plan";

export type SessionDocument = {
  id: string;
  revision: number;
  origin: SessionOrigin;
  status: "activa" | "finalizada";
  datePerformed: string;
  /** Fecha prevista del Entrenamiento planificado de origen; solo un origen «plan» la tiene. */
  plannedDate: string | null;
  routineId: string | null;
  planTrainingId: string | null;
  lastExerciseId: string | null;
  exercises: SessionExerciseDocument[];
  startedAt: string;
  updatedAt: string;
};

const customInput = {
  name: "Peso muerto rumano",
  instructions:
    "Baja la barra hasta la mitad de la espinilla manteniendo la espalda recta.",
  recordingMode: "fuerza_con_carga",
  category: "Pierna",
  bodyPart: "Isquiotibiales",
  equipment: "Barra",
} as const;

async function startSessionRequest(
  context: TestContext,
  cookie: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function startFreeSession(
  context: TestContext,
  cookie: string,
): Promise<{ status: number; body: unknown }> {
  return startSessionRequest(context, cookie, { origin: "libre" });
}

async function getActiveSession(
  context: TestContext,
  cookie: string,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request("/api/sessions/active", {
    headers: { Cookie: cookie, Origin: origin },
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function getSession(
  context: TestContext,
  cookie: string,
  id: string,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(`/api/sessions/${id}`, {
    headers: { Cookie: cookie, Origin: origin },
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function replaceSession(
  context: TestContext,
  cookie: string,
  id: string,
  body: {
    revision: number;
    datePerformed?: string;
    exercises: {
      id?: string;
      exerciseId: string;
      series?: unknown[];
    }[];
  },
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(`/api/sessions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function catalogExerciseId(context: TestContext, cookie: string): Promise<string> {
  const response = await context.app.request("/api/exercises?limit=50", {
    headers: { Cookie: cookie, Origin: origin },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    items: { id: string; provenance: string; recordingMode: string }[];
  };
  // Una aparición de cardio continuo exige exactamente una Serie, así que el
  // helper elige un Ejercicio del catálogo de otra Forma de registro.
  const item = body.items.find(
    (entry) => entry.provenance === "catalogo" && entry.recordingMode !== "cardio_continuo",
  );
  expect(item).toBeDefined();
  return item!.id;
}

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
  series: { id: string; order: number; carga: number | null; repeticiones: number | null; duracion: number | null }[];
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

async function replaceRoutine(
  context: TestContext,
  cookie: string,
  routineId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(`/api/routines/${routineId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function archiveRoutine(
  context: TestContext,
  cookie: string,
  routineId: string,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(`/api/routines/${routineId}/archive`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: origin },
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

export type PlanSeriesGoalDocument = {
  id: string;
  order: number;
  carga: number | null;
  repeticiones: number | null;
  duracion: number | null;
};

export type PlanTrainingDocument = {
  id: string;
  day: number;
  plannedDate: string | null;
  status: "pendiente" | "omitido" | "realizado" | null;
  source: "rutina" | "especifico";
  routineId: string | null;
  routine: { id: string; name: string; archived: boolean } | null;
  content: {
    id: string;
    exerciseId: string;
    order: number;
    exercise: { id: string; name: string; recordingMode: string; available: boolean; provenance: "catalogo" | "personalizado" };
    series: PlanSeriesGoalDocument[];
  }[];
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
  startDate: string | null;
  revision: number;
  weeks: PlanWeekDocument[];
  createdAt: string;
  updatedAt: string;
};

async function createPlan(
  context: TestContext,
  cookie: string,
  body: Record<string, unknown>,
): Promise<PlanDocument> {
  const response = await context.app.request("/api/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { plan: PlanDocument }).plan;
}

async function getPlan(
  context: TestContext,
  cookie: string,
  planId: string,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(`/api/plans/${planId}`, {
    headers: { Cookie: cookie, Origin: origin },
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function activatePlan(
  context: TestContext,
  cookie: string,
  planId: string,
  revision: number,
  startDate: string,
): Promise<PlanDocument> {
  const response = await context.app.request(`/api/plans/${planId}/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({ revision, startDate }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { plan: PlanDocument }).plan;
}

async function omitPlanTraining(
  context: TestContext,
  cookie: string,
  planId: string,
  trainingId: string,
  revision: number,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(
    `/api/plans/${planId}/trainings/${trainingId}/omit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({ revision }),
    },
  );
  return { status: response.status, body: (await response.json()) as unknown };
}

async function completePlanRequest(
  context: TestContext,
  cookie: string,
  planId: string,
  revision: number,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(`/api/plans/${planId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({ revision }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

describe("iniciar una Sesión libre", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("crea atómicamente una Sesión activa sin origen con su revisión entera", async () => {
    const { status, body } = await startFreeSession(context!, cookie);
    expect(status).toBe(201);

    const session = (body as { session: SessionDocument }).session;
    expect(session.id).toMatch(/^[0-9a-f]{32}$/);
    expect(session.origin).toBe("libre");
    expect(session.status).toBe("activa");
    expect(session.revision).toBe(1);
    expect(session.datePerformed).toBe("2025-03-10");
    expect(session.lastExerciseId).toBeNull();
    expect(session.exercises).toEqual([]);
    expect(session.startedAt).toBe("2025-03-10T09:30:00.000Z");
    expect(session.updatedAt).toBe("2025-03-10T09:30:00.000Z");
  });

  test("sin sesión de Cuenta responde 401", async () => {
    const response = await context!.app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ origin: "libre" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Debes iniciar sesión para gestionar tus Sesiones.",
      },
    });
  });

  test("iniciar exige los datos del origen elegido", async () => {
    const response = await context!.app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({ origin: "rutina" }),
    });
    expect(response.status).toBe(400);
    const error = (await response.json()) as {
      error: { code: string; fields?: Record<string, string[]> };
    };
    expect(error.error.code).toBe("VALIDATION_ERROR");
    expect(error.error.fields?.routineId).toBeDefined();

    const planMissing = await context!.app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({ origin: "plan" }),
    });
    expect(planMissing.status).toBe(400);
    const planError = (await planMissing.json()) as {
      error: { fields?: Record<string, string[]> };
    };
    expect(planError.error.fields?.planId).toBeDefined();
  });

  test("una única Sesión activa por Cuenta: el segundo intento devuelve conflicto con la identidad de la existente", async () => {
    const first = await startFreeSession(context!, cookie);
    expect(first.status).toBe(201);
    const firstId = (first.body as { session: SessionDocument }).session.id;

    const second = await startFreeSession(context!, cookie);
    expect(second.status).toBe(409);
    const error = (second.body as { error: { code: string; sessionId: string } }).error;
    expect(error.code).toBe("ACTIVE_SESSION_EXISTS");
    expect(error.sessionId).toBe(firstId);

    // la Sesión existente es la misma y sigue activa
    const active = await getActiveSession(context!, cookie);
    expect(active.status).toBe(200);
    expect((active.body as { session: SessionDocument }).session.id).toBe(firstId);
  });
});

describe("iniciar una Sesión desde una Rutina", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("iniciar desde una Rutina copia los Ejercicios y Objetivos vigentes como previstas y conserva el origen", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const dominada = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [
        { exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] },
        { exerciseId: dominada, series: [{ repeticiones: 8 }, { repeticiones: 6 }] },
      ],
    });

    const { status, body } = await startSessionRequest(context!, cookie, {
      origin: "rutina",
      routineId: routine.id,
    });
    expect(status).toBe(201);

    const session = (body as { session: SessionDocument }).session;
    expect(session.origin).toBe("rutina");
    expect(session.routineId).toBe(routine.id);
    expect(session.planTrainingId).toBeNull();
    expect(session.plannedDate).toBeNull();
    expect(session.status).toBe("activa");
    expect(session.revision).toBe(1);
    expect(session.datePerformed).toBe("2025-03-10");
    expect(session.lastExerciseId).toBeNull();

    // el contenido del origen se copia como intención original: Series
    // previstas pendientes con sus Objetivos, sin resultados
    expect(session.exercises).toHaveLength(2);
    const first = session.exercises[0]!;
    expect(first.exerciseId).toBe(press);
    expect(first.sortOrder).toBe(0);
    expect(first.added).toBe(false);
    expect(first.series).toHaveLength(1);
    expect(first.series[0]).toMatchObject({
      status: "pendiente",
      added: false,
      goal: { carga: 60, repeticiones: 10, duracion: null },
      result: { carga: null, repeticiones: null, duracion: null },
      rpe: null,
    });

    const second = session.exercises[1]!;
    expect(second.exerciseId).toBe(dominada);
    expect(second.sortOrder).toBe(1);
    expect(second.added).toBe(false);
    expect(second.series).toHaveLength(2);
    expect(second.series[1]!.goal).toEqual({ carga: null, repeticiones: 6, duracion: null });
  });

  test("editar la Rutina después de iniciar no modifica los Objetivos copiados en la Sesión", async () => {
    const exerciseId = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId, series: [{ carga: 60, repeticiones: 10 }] }],
    });

    const started = await startSessionRequest(context!, cookie, {
      origin: "rutina",
      routineId: routine.id,
    });
    const session = (started.body as { session: SessionDocument }).session;
    const copiedGoal = session.exercises[0]!.series[0]!.goal;

    // la Rutina cambia después de iniciar: la Sesión conserva la copia
    const replaced = await replaceRoutine(context!, cookie, routine.id, {
      name: "Día de empuje v2",
      revision: routine.revision,
      exercises: [
        { id: routine.exercises[0]!.id, exerciseId, series: [{ carga: 100, repeticiones: 3 }] },
      ],
    });
    expect(replaced.status).toBe(200);

    const active = await getActiveSession(context!, cookie);
    const after = (active.body as { session: SessionDocument }).session;
    expect(after.id).toBe(session.id);
    expect(after.exercises[0]!.series[0]!.goal).toEqual(copiedGoal);
    expect(after.exercises[0]!.series[0]!.goal).toEqual({
      carga: 60,
      repeticiones: 10,
      duracion: null,
    });
  });

  test("iniciar desde una Rutina archivada se rechaza como uso nuevo", async () => {
    const exerciseId = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId, series: [{ repeticiones: 10 }] }],
    });
    await archiveRoutine(context!, cookie, routine.id);

    const { status, body } = await startSessionRequest(context!, cookie, {
      origin: "rutina",
      routineId: routine.id,
    });
    expect(status).toBe(400);
    const error = (body as { error: { code: string; fields?: Record<string, string[]> } }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.routineId).toBeDefined();
  });

  test("con una Sesión activa existente, iniciar desde una Rutina conduce a la existente", async () => {
    const first = await startFreeSession(context!, cookie);
    expect(first.status).toBe(201);
    const firstId = (first.body as { session: SessionDocument }).session.id;

    const exerciseId = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId, series: [{ repeticiones: 10 }] }],
    });
    const fromRoutine = await startSessionRequest(context!, cookie, {
      origin: "rutina",
      routineId: routine.id,
    });
    expect(fromRoutine.status).toBe(409);
    const error = (fromRoutine.body as { error: { code: string; sessionId: string } }).error;
    expect(error.code).toBe("ACTIVE_SESSION_EXISTS");
    expect(error.sessionId).toBe(firstId);
  });

  test("la Rutina ajena o inexistente responde inexistente", async () => {
    const cookieB = await registerVerified(context!, "otra@example.com");
    const exerciseId = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId, series: [{ repeticiones: 10 }] }],
    });

    const foreign = await startSessionRequest(context!, cookieB, {
      origin: "rutina",
      routineId: routine.id,
    });
    expect(foreign.status).toBe(404);

    const unknown = await startSessionRequest(context!, cookie, {
      origin: "rutina",
      routineId: "ffffffffffffffffffffffffffffffff",
    });
    expect(unknown.status).toBe(404);
  });
});

describe("iniciar una Sesión desde un Entrenamiento planificado", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  async function activePlanFixture(weeks: Record<string, unknown>[]): Promise<{
    plan: PlanDocument;
    trainings: PlanTrainingDocument[];
  }> {
    const plan = await createPlan(context!, cookie, {
      name: "Ciclo base",
      weeks: weeks.map((week) => ({
        ...week,
        trainings: (week.trainings as Record<string, unknown>[]).map((training) => ({
          ...training,
          specific: training.specific ?? [],
        })),
      })),
    });
    const activated = await activatePlan(context!, cookie, plan.id, plan.revision, "2025-03-03");
    return { plan: activated, trainings: activated.weeks.flatMap((week) => week.trainings) };
  }

  test("iniciar desde un Entrenamiento con Rutina copia el contenido vigente, el origen y las fechas por separado", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const dominada = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [
        { exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] },
        { exerciseId: dominada, series: [{ repeticiones: 8 }, { repeticiones: 6 }] },
      ],
    });
    const { plan, trainings } = await activePlanFixture([
      { trainings: [{ day: 0, source: "rutina", routineId: routine.id }] },
    ]);
    const training = trainings[0]!;
    // Fecha prevista pasada respecto de la Fecha realizada (2025-03-10)
    expect(training.plannedDate).toBe("2025-03-03");

    const { status, body } = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: plan.id,
      trainingId: training.id,
    });
    expect(status).toBe(201);

    const session = (body as { session: SessionDocument }).session;
    expect(session.origin).toBe("plan");
    expect(session.planTrainingId).toBe(training.id);
    expect(session.routineId).toBeNull();
    expect(session.plannedDate).toBe("2025-03-03");
    expect(session.datePerformed).toBe("2025-03-10");
    expect(session.status).toBe("activa");
    expect(session.revision).toBe(1);
    expect(session.lastExerciseId).toBeNull();

    // el contenido vigente de la referencia viva se copia como previstas
    expect(session.exercises).toHaveLength(2);
    expect(session.exercises[0]!.exerciseId).toBe(press);
    expect(session.exercises[0]!.added).toBe(false);
    expect(session.exercises[0]!.series[0]!.goal).toEqual({
      carga: 60,
      repeticiones: 10,
      duracion: null,
    });
    expect(session.exercises[0]!.series[0]!.status).toBe("pendiente");
    expect(session.exercises[0]!.series[0]!.added).toBe(false);
    expect(session.exercises[1]!.exerciseId).toBe(dominada);
    expect(session.exercises[1]!.series).toHaveLength(2);
  });

  test("iniciar desde un Entrenamiento específico copia sus Ejercicios y Objetivos", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const dominada = await catalogExerciseId(context!, cookie);
    const { plan, trainings } = await activePlanFixture([
      {
        trainings: [
          {
            day: 3,
            source: "especifico",
            specific: [
              { exerciseId: press, series: [{ carga: 100, repeticiones: 5 }] },
              { exerciseId: dominada, series: [{ repeticiones: 10 }] },
            ],
          },
        ],
      },
    ]);
    const training = trainings[0]!;
    // Fecha prevista futura (el lunes de la primera semana + 3 días) sin
    // impedir el inicio: la Fecha realizada se guarda por separado.
    expect(training.plannedDate).toBe("2025-03-06");

    const { status, body } = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: plan.id,
      trainingId: training.id,
    });
    expect(status).toBe(201);

    const session = (body as { session: SessionDocument }).session;
    expect(session.origin).toBe("plan");
    expect(session.planTrainingId).toBe(training.id);
    expect(session.plannedDate).toBe("2025-03-06");
    expect(session.datePerformed).toBe("2025-03-10");
    expect(session.exercises).toHaveLength(2);
    expect(session.exercises[0]!.series[0]!.goal).toEqual({
      carga: 100,
      repeticiones: 5,
      duracion: null,
    });
  });

  test("editar el Plan o su Rutina después de iniciar no modifica la Sesión", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const dominada = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] }],
    });
    const { plan, trainings } = await activePlanFixture([
      { trainings: [{ day: 0, source: "rutina", routineId: routine.id }] },
    ]);
    const training = trainings[0]!;

    const started = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: plan.id,
      trainingId: training.id,
    });
    const session = (started.body as { session: SessionDocument }).session;
    const copiedGoal = session.exercises[0]!.series[0]!.goal;

    // la Rutina cambia después de iniciar: la referencia viva del Plan cambia
    const replacedRoutine = await replaceRoutine(context!, cookie, routine.id, {
      name: "Día de empuje v2",
      revision: routine.revision,
      exercises: [
        { id: routine.exercises[0]!.id, exerciseId: dominada, series: [{ repeticiones: 20 }] },
      ],
    });
    expect(replacedRoutine.status).toBe(200);

    // el Plan también cambia después de iniciar (día pendiente: puede editarse)
    const planAfter = (await getPlan(context!, cookie, plan.id)).body as { plan: PlanDocument };
    const edited = await context!.app.request(`/api/plans/${plan.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({
        name: "Ciclo base v2",
        revision: planAfter.plan.revision,
        weeks: planAfter.plan.weeks.map((week) => ({
          id: week.id,
          trainings: week.trainings.map((entry) => ({
            id: entry.id,
            day: entry.day,
            source: "rutina",
            routineId: routine.id,
            specific: [],
          })),
        })),
      }),
    });
    expect(edited.status).toBe(200);

    const active = await getActiveSession(context!, cookie);
    const after = (active.body as { session: SessionDocument }).session;
    expect(after.id).toBe(session.id);
    expect(after.exercises[0]!.exerciseId).toBe(press);
    expect(after.exercises[0]!.series[0]!.goal).toEqual(copiedGoal);
    expect(after.exercises[0]!.series[0]!.goal).toEqual({
      carga: 60,
      repeticiones: 10,
      duracion: null,
    });
  });

  test("iniciar desde un Entrenamiento no pendiente es una transición imposible", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ repeticiones: 10 }] }],
    });
    const { plan, trainings } = await activePlanFixture([
      { trainings: [{ day: 0, source: "rutina", routineId: routine.id }] },
    ]);
    const training = trainings[0]!;

    const omitted = await omitPlanTraining(context!, cookie, plan.id, training.id, plan.revision);
    expect(omitted.status).toBe(200);

    const { status, body } = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: plan.id,
      trainingId: training.id,
    });
    expect(status).toBe(409);
    const error = (body as { error: { code: string; message: string } }).error;
    expect(error.code).toBe("TRANSITION_IMPOSSIBLE");
    expect(error.message).toContain("pendiente");
  });

  test("iniciar desde un Plan que no está activo es una transición imposible", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ repeticiones: 10 }] }],
    });
    const draft = await createPlan(context!, cookie, {
      name: "Ciclo base",
      weeks: [{ trainings: [{ day: 0, source: "rutina", routineId: routine.id }] }],
    });
    const draftTraining = draft.weeks[0]!.trainings[0]!;

    const fromDraft = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: draft.id,
      trainingId: draftTraining.id,
    });
    expect(fromDraft.status).toBe(409);

    const { plan, trainings } = await activePlanFixture([
      { trainings: [{ day: 0, source: "rutina", routineId: routine.id }] },
    ]);
    const training = trainings[0]!;
    const completed = await completePlanRequest(context!, cookie, plan.id, plan.revision);
    expect(completed.status).toBe(200);

    const fromCompleted = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: plan.id,
      trainingId: training.id,
    });
    expect(fromCompleted.status).toBe(409);
    expect(
      (fromCompleted.body as { error: { code: string } }).error.code,
    ).toBe("TRANSITION_IMPOSSIBLE");
  });

  test("el Entrenamiento de otro Plan o de otra Cuenta responde inexistente", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ repeticiones: 10 }] }],
    });
    const { plan, trainings } = await activePlanFixture([
      { trainings: [{ day: 0, source: "rutina", routineId: routine.id }] },
    ]);
    const training = trainings[0]!;

    // un Entrenamiento de otro Plan (aunque sea de la misma Cuenta) es
    // inexistente bajo ese Plan: la combinación planId + trainingId no casa
    const otherDraft = await createPlan(context!, cookie, {
      name: "Otro ciclo",
      weeks: [{ trainings: [{ day: 0, source: "rutina", routineId: routine.id }] }],
    });
    const wrongPlan = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: otherDraft.id,
      trainingId: training.id,
    });
    expect(wrongPlan.status).toBe(404);

    // un Entrenamiento desconocido responde inexistente
    const unknown = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: plan.id,
      trainingId: "ffffffffffffffffffffffffffffffff",
    });
    expect(unknown.status).toBe(404);

    // el Plan de otra Cuenta responde inexistente
    const cookieB = await registerVerified(context!, "otra@example.com");
    const foreign = await startSessionRequest(context!, cookieB, {
      origin: "plan",
      planId: plan.id,
      trainingId: training.id,
    });
    expect(foreign.status).toBe(404);
  });

  test("una Sesión iniciada desde una Rutina no cambia el estado de ningún día del Plan", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ repeticiones: 10 }] }],
    });
    const { plan } = await activePlanFixture([
      { trainings: [{ day: 0, source: "rutina", routineId: routine.id }] },
    ]);

    await startSessionRequest(context!, cookie, { origin: "rutina", routineId: routine.id });

    const after = (await getPlan(context!, cookie, plan.id)).body as { plan: PlanDocument };
    expect(after.plan.weeks[0]!.trainings[0]!.status).toBe("pendiente");
    expect(after.plan.revision).toBe(plan.revision);
  });

  test("con una Sesión activa existente, iniciar desde un Entrenamiento conduce a la existente", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ repeticiones: 10 }] }],
    });
    const { plan, trainings } = await activePlanFixture([
      { trainings: [{ day: 0, source: "rutina", routineId: routine.id }] },
    ]);
    const training = trainings[0]!;

    const first = await startSessionRequest(context!, cookie, { origin: "libre" });
    const firstId = (first.body as { session: SessionDocument }).session.id;

    const fromPlan = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: plan.id,
      trainingId: training.id,
    });
    expect(fromPlan.status).toBe(409);
    const error = (fromPlan.body as { error: { code: string; sessionId: string } }).error;
    expect(error.code).toBe("ACTIVE_SESSION_EXISTS");
    expect(error.sessionId).toBe(firstId);
  });
});

describe("conservación de la intención original en Sesiones con origen", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("las Series previstas no pueden eliminarse: se resuelven omitiéndolas", async () => {
    const exerciseId = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId, series: [{ repeticiones: 10 }, { repeticiones: 8 }] }],
    });
    const started = await startSessionRequest(context!, cookie, {
      origin: "rutina",
      routineId: routine.id,
    });
    const session = (started.body as { session: SessionDocument }).session;
    const occurrence = session.exercises[0]!;
    const keptId = occurrence.series[0]!.id;
    const removedId = occurrence.series[1]!.id;

    // soltar una Serie prevista del agregado: rechazado
    const dropped = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId,
          series: [{ id: keptId, status: "pendiente", goal: { repeticiones: 10 }, result: null }],
        },
      ],
    });
    expect(dropped.status).toBe(400);
    const error = (dropped.body as { error: { code: string; fields?: Record<string, string[]> } }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.["exercises[0].series"]).toBeDefined();

    // omitir la Serie prevista conserva la intención original
    const omitted = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId,
          series: [
            { id: keptId, status: "pendiente", goal: { repeticiones: 10 }, result: null },
            { id: removedId, status: "omitida", goal: { repeticiones: 8 }, result: null },
          ],
        },
      ],
    });
    expect(omitted.status).toBe(200);
    const after = (omitted.body as { session: SessionDocument }).session;
    expect(after.exercises[0]!.series).toHaveLength(2);
    expect(after.exercises[0]!.series[1]!.status).toBe("omitida");
    expect(after.exercises[0]!.series[1]!.added).toBe(false);
  });

  test("los Ejercicios del origen no pueden eliminarse de la Sesión", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const dominada = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [
        { exerciseId: press, series: [{ repeticiones: 10 }] },
        { exerciseId: dominada, series: [{ repeticiones: 8 }] },
      ],
    });
    const started = await startSessionRequest(context!, cookie, {
      origin: "rutina",
      routineId: routine.id,
    });
    const session = (started.body as { session: SessionDocument }).session;
    const kept = session.exercises[0]!;
    const removed = session.exercises[1]!;

    // soltar un Ejercicio del origen: rechazado
    const dropped = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: kept.id,
          exerciseId: press,
          series: [{ id: kept.series[0]!.id, status: "pendiente", goal: { repeticiones: 10 }, result: null }],
        },
      ],
    });
    expect(dropped.status).toBe(400);
    const error = (dropped.body as { error: { code: string; fields?: Record<string, string[]> } }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.exercises).toBeDefined();

    // conservar ambos Ejercicios (una Serie omitida) es válido
    const keptAll = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: kept.id,
          exerciseId: press,
          series: [{ id: kept.series[0]!.id, status: "pendiente", goal: { repeticiones: 10 }, result: null }],
        },
        {
          id: removed.id,
          exerciseId: dominada,
          series: [{ id: removed.series[0]!.id, status: "omitida", goal: { repeticiones: 8 }, result: null }],
        },
      ],
    });
    expect(keptAll.status).toBe(200);
    expect((keptAll.body as { session: SessionDocument }).session.exercises).toHaveLength(2);
  });

  test("las Series y Ejercicios añadidos mantienen las reglas del ticket 27", async () => {
    const exerciseId = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId, series: [{ repeticiones: 10 }] }],
    });
    const started = await startSessionRequest(context!, cookie, {
      origin: "rutina",
      routineId: routine.id,
    });
    const session = (started.body as { session: SessionDocument }).session;
    const prevista = session.exercises[0]!;
    const previstaSeriesId = prevista.series[0]!.id;

    // se añade una Serie y un Ejercicio durante la Sesión
    const added = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: prevista.id,
          exerciseId,
          series: [
            { id: previstaSeriesId, status: "pendiente", goal: { repeticiones: 10 }, result: null },
            { status: "pendiente", goal: null, result: null },
          ],
        },
        { exerciseId, series: [{ status: "pendiente", goal: null, result: null }] },
      ],
    });
    expect(added.status).toBe(200);
    let current = (added.body as { session: SessionDocument }).session;
    expect(current.exercises[0]!.series[1]!.added).toBe(true);
    expect(current.exercises[1]!.added).toBe(true);

    // la Serie añadida puede eliminarse
    const removedSeries = await replaceSession(context!, cookie, current.id, {
      revision: current.revision,
      exercises: current.exercises.map((entry, index) =>
        index === 0
          ? {
              id: entry.id,
              exerciseId: entry.exerciseId,
              series: [{ id: previstaSeriesId, status: "pendiente", goal: { repeticiones: 10 }, result: null }],
            }
          : { id: entry.id, exerciseId: entry.exerciseId, series: entry.series.map((series) => ({ id: series.id, status: series.status, goal: series.goal, result: series.result })) },
      ),
    });
    expect(removedSeries.status).toBe(200);
    current = (removedSeries.body as { session: SessionDocument }).session;
    expect(current.exercises[0]!.series).toHaveLength(1);
    expect(current.exercises[0]!.series[0]!.id).toBe(previstaSeriesId);

    // el Ejercicio añadido puede eliminarse conservando el del origen
    const removedExercise = await replaceSession(context!, cookie, current.id, {
      revision: current.revision,
      exercises: [
        {
          id: current.exercises[0]!.id,
          exerciseId,
          series: [{ id: previstaSeriesId, status: "pendiente", goal: { repeticiones: 10 }, result: null }],
        },
      ],
    });
    expect(removedExercise.status).toBe(200);
    const after = (removedExercise.body as { session: SessionDocument }).session;
    expect(after.exercises).toHaveLength(1);
    expect(after.exercises[0]!.added).toBe(false);
  });
});

describe("finalizar una Sesión originada en un Plan", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  async function planFixture(): Promise<{ plan: PlanDocument; training: PlanTrainingDocument; routine: RoutineDocument }> {
    const press = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] }],
    });
    const plan = await createPlan(context!, cookie, {
      name: "Ciclo base",
      weeks: [{ trainings: [{ day: 0, source: "rutina", routineId: routine.id }] }],
    });
    const activated = await activatePlan(context!, cookie, plan.id, plan.revision, "2025-03-03");
    return {
      plan: activated,
      training: activated.weeks[0]!.trainings[0]!,
      routine,
    };
  }

  async function startFromPlan(plan: PlanDocument, training: PlanTrainingDocument): Promise<SessionDocument> {
    const started = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: plan.id,
      trainingId: training.id,
    });
    expect(started.status).toBe(201);
    return (started.body as { session: SessionDocument }).session;
  }

  test("finalizar la Sesión marca el Entrenamiento como realizado y conserva su Fecha prevista", async () => {
    const { plan, training } = await planFixture();
    const session = await startFromPlan(plan, training);
    // se completa una Serie para poder finalizar
    const seriesId = session.exercises[0]!.series[0]!.id;
    const completed = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: session.exercises[0]!.id,
          exerciseId: session.exercises[0]!.exerciseId,
          series: [
            { id: seriesId, status: "completada", goal: { carga: 60, repeticiones: 10 }, result: { carga: 62.5, repeticiones: 10 } },
          ],
        },
      ],
    });
    expect(completed.status).toBe(200);
    const afterComplete = (completed.body as { session: SessionDocument }).session;

    const finalized = await finalizeSessionRequest(
      context!, cookie, afterComplete.id, afterComplete.revision,
    );
    expect(finalized.status).toBe(200);

    // el Entrenamiento pasa a realizado únicamente al finalizar la Sesión
    const planAfter = (await getPlan(context!, cookie, plan.id)).body as { plan: PlanDocument };
    const day = planAfter.plan.weeks[0]!.trainings[0]!;
    expect(day.status).toBe("realizado");
    expect(day.plannedDate).toBe(training.plannedDate);
    expect(planAfter.plan.status).toBe("activo");
  });

  test("cada Entrenamiento planificado origina como máximo una Sesión finalizada", async () => {
    const { plan, training } = await planFixture();
    const session = await startFromPlan(plan, training);
    const seriesId = session.exercises[0]!.series[0]!.id;
    const completed = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: session.exercises[0]!.id,
          exerciseId: session.exercises[0]!.exerciseId,
          series: [
            { id: seriesId, status: "completada", goal: { carga: 60, repeticiones: 10 }, result: { carga: 62.5, repeticiones: 10 } },
          ],
        },
      ],
    });
    const afterComplete = (completed.body as { session: SessionDocument }).session;
    const finalized = await finalizeSessionRequest(
      context!, cookie, afterComplete.id, afterComplete.revision,
    );
    expect(finalized.status).toBe(200);

    // el Entrenamiento ya está realizado: no origina otra Sesión
    const again = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: plan.id,
      trainingId: training.id,
    });
    expect(again.status).toBe(409);
    expect((again.body as { error: { code: string } }).error.code).toBe(
      "TRANSITION_IMPOSSIBLE",
    );

    // una Sesión libre nueva no choca con el cupo del Entrenamiento
    const free = await startSessionRequest(context!, cookie, { origin: "libre" });
    expect(free.status).toBe(201);
  });

  test("completar el Plan devuelve conflicto con una Sesión activa originada y eliminar la Sesión lo desbloquea", async () => {
    const { plan, training } = await planFixture();
    const session = await startFromPlan(plan, training);

    const blocked = await completePlanRequest(context!, cookie, plan.id, plan.revision);
    expect(blocked.status).toBe(409);
    const error = (blocked.body as { error: { code: string; message: string } }).error;
    expect(error.code).toBe("TRANSITION_IMPOSSIBLE");
    expect(error.message).toContain("Sesión activa");

    // el día sigue pendiente y el Plan intacto
    const unchanged = (await getPlan(context!, cookie, plan.id)).body as { plan: PlanDocument };
    expect(unchanged.plan.weeks[0]!.trainings[0]!.status).toBe("pendiente");
    expect(unchanged.plan.status).toBe("activo");

    // eliminar la Sesión activa deja de bloquear el Plan
    const deleted = await deleteSessionRequest(
      context!, cookie, session.id, session.revision,
    );
    expect(deleted.status).toBe(200);

    const completed = await completePlanRequest(context!, cookie, plan.id, plan.revision);
    expect(completed.status).toBe(200);
    const doc = (completed.body as { plan: PlanDocument }).plan;
    expect(doc.status).toBe("completado");
    expect(doc.weeks[0]!.trainings[0]!.status).toBe("omitido");
  });
});

describe("reanudar la Sesión activa", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("GET /api/sessions/active devuelve el estado confirmado o una ausencia inequívoca", async () => {
    const before = await getActiveSession(context!, cookie);
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ session: null });

    const started = await startFreeSession(context!, cookie);
    const id = (started.body as { session: SessionDocument }).session.id;

    const after = await getActiveSession(context!, cookie);
    expect(after.status).toBe(200);
    expect((after.body as { session: SessionDocument }).session.id).toBe(id);
  });

  test("añadir el primer Ejercicio conserva la identidad y fija el último utilizado", async () => {
    const started = await startFreeSession(context!, cookie);
    const session = (started.body as { session: SessionDocument }).session;
    const exerciseId = await catalogExerciseId(context!, cookie);

    const { status, body } = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [{ exerciseId, series: [] }],
    });
    expect(status).toBe(200);

    const next = (body as { session: SessionDocument }).session;
    expect(next.revision).toBe(2);
    expect(next.lastExerciseId).toBe(exerciseId);
    expect(next.exercises).toHaveLength(1);
    expect(next.exercises[0]!.id).toMatch(/^[0-9a-f]{32}$/);
    expect(next.exercises[0]!.exerciseId).toBe(exerciseId);
    expect(next.exercises[0]!.sortOrder).toBe(0);
    expect(next.exercises[0]!.exercise.provenance).toBe("catalogo");
    expect(next.exercises[0]!.exercise.name).toBeTruthy();
  });

  test("recargar el navegador recupera la Sesión activa y el último Ejercicio confirmado", async () => {
    const started = await startFreeSession(context!, cookie);
    const session = (started.body as { session: SessionDocument }).session;
    const exerciseId = await catalogExerciseId(context!, cookie);
    await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [{ exerciseId, series: [] }],
    });

    // nueva lectura sin estado previo: la API es la única fuente
    const active = await getActiveSession(context!, cookie);
    const recovered = (active.body as { session: SessionDocument }).session;
    expect(recovered.id).toBe(session.id);
    expect(recovered.revision).toBe(2);
    expect(recovered.exercises).toHaveLength(1);
    expect(recovered.lastExerciseId).toBe(exerciseId);

    const byId = await getSession(context!, cookie, session.id);
    expect(byId.status).toBe(200);
    expect((byId.body as { session: SessionDocument }).session.revision).toBe(2);
  });

  test("una Sesión añade varios Ejercicios conservando los identificadores existentes", async () => {
    const started = await startFreeSession(context!, cookie);
    const session = (started.body as { session: SessionDocument }).session;
    const exerciseId = await catalogExerciseId(context!, cookie);

    const added = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [{ exerciseId, series: [] }],
    });
    const first = (added.body as { session: SessionDocument }).session;
    const occurrenceId = first.exercises[0]!.id;

    const second = await replaceSession(context!, cookie, session.id, {
      revision: first.revision,
      exercises: [
        { id: occurrenceId, exerciseId, series: [] },
        { exerciseId, series: [] },
      ],
    });
    const updated = (second.body as { session: SessionDocument }).session;
    expect(updated.revision).toBe(3);
    expect(updated.exercises).toHaveLength(2);
    expect(updated.exercises[0]!.id).toBe(occurrenceId);
    expect(updated.exercises[1]!.id).not.toBe(occurrenceId);
    expect(updated.lastExerciseId).toBe(exerciseId);
  });

  test("rechaza añadir un Ejercicio ajeno o retirado como entrada inválida", async () => {
    const started = await startFreeSession(context!, cookie);
    const session = (started.body as { session: SessionDocument }).session;

    const unknown = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [{ exerciseId: "ffffffffffffffffffffffffffffffff", series: [] }],
    });
    expect(unknown.status).toBe(400);
    const error = (unknown.body as {
      error: { code: string; fields?: Record<string, string[]> };
    }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.["exercises[0].exerciseId"]).toBeDefined();
  });
});

describe("conflicto recuperable entre escrituras", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("una revisión obsoleta devuelve 409 sin duplicar Ejercicios y permite reintentar", async () => {
    const started = await startFreeSession(context!, cookie);
    const session = (started.body as { session: SessionDocument }).session;
    const exerciseId = await catalogExerciseId(context!, cookie);

    const first = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [{ exerciseId, series: [] }],
    });
    expect(first.status).toBe(200);

    // repetición de la escritura con la revisión anterior: conflicto recuperable
    const stale = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        { exerciseId, series: [] },
        { exerciseId, series: [] },
      ],
    });
    expect(stale.status).toBe(409);
    const conflict = (stale.body as { error: { code: string; session?: SessionDocument } }).error;
    expect(conflict.code).toBe("REVISION_CONFLICT");
    // el conflicto carga la versión vigente sin aplicar la escritura obsoleta
    expect(conflict.session?.id).toBe(session.id);
    expect(conflict.session?.revision).toBe(2);

    // nada cambió: no se duplicó ningún Ejercicio
    const current = await getActiveSession(context!, cookie);
    const after = (current.body as { session: SessionDocument }).session;
    expect(after.revision).toBe(2);
    expect(after.exercises).toHaveLength(1);

    // reintentar con la revisión vigente funciona
    const retried = await replaceSession(context!, cookie, session.id, {
      revision: after.revision,
      exercises: [
        { id: after.exercises[0]!.id, exerciseId, series: [] },
        { exerciseId, series: [] },
      ],
    });
    expect(retried.status).toBe(200);
    expect((retried.body as { session: SessionDocument }).session.exercises).toHaveLength(2);
  });

  test("sustituir una Sesión ajena o inexistente responde 404", async () => {
    const unknown = await replaceSession(context!, cookie, "ffffffffffffffffffffffffffffffff", {
      revision: 1,
      exercises: [],
    });
    expect(unknown.status).toBe(404);
  });
});

describe("aislamiento entre dos Cuentas", () => {
  let context: TestContext | undefined;
  let cookieA: string;
  let cookieB: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookieA = await registerVerified(context, "a@example.com");
    cookieB = await registerVerified(context, "b@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("cada Cuenta solo ve y gestiona su propia Sesión activa", async () => {
    const startedA = await startFreeSession(context!, cookieA);
    expect(startedA.status).toBe(201);
    const idA = (startedA.body as { session: SessionDocument }).session.id;

    // B no ve ninguna Sesión activa y puede iniciar la suya
    const activeB = await getActiveSession(context!, cookieB);
    expect(activeB.body).toEqual({ session: null });

    const startedB = await startFreeSession(context!, cookieB);
    expect(startedB.status).toBe(201);
    const idB = (startedB.body as { session: SessionDocument }).session.id;
    expect(idB).not.toBe(idA);

    // B no puede leer ni sustituir la Sesión de A
    const read = await getSession(context!, cookieB, idA);
    expect(read.status).toBe(404);
    const write = await replaceSession(context!, cookieB, idA, {
      revision: 1,
      exercises: [],
    });
    expect(write.status).toBe(404);

    // A conserva su Sesión intacta y activa
    const activeA = await getActiveSession(context!, cookieA);
    expect((activeA.body as { session: SessionDocument }).session.id).toBe(idA);
  });

  test("la unicidad de la Sesión activa se aplica por Cuenta", async () => {
    await startFreeSession(context!, cookieA);
    await startFreeSession(context!, cookieB);

    const thirdA = await startFreeSession(context!, cookieA);
    expect(thirdA.status).toBe(409);
    const thirdB = await startFreeSession(context!, cookieB);
    expect(thirdB.status).toBe(409);
  });
});

const seriesCustomInput = {
  name: "Fondos en paralelas",
  instructions: "Baja el cuerpo hasta que los hombros queden a la altura de los codos.",
  recordingMode: "fuerza_con_carga",
  category: "Pecho",
  bodyPart: "Pecho",
  equipment: "Paralelas",
} as const;

async function createCustomExercise(
  context: TestContext,
  cookie: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await context.app.request("/api/exercises", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({ ...seriesCustomInput, ...overrides }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { exercise: { id: string } }).exercise.id;
}

type SeriesInput = {
  id?: string;
  status: "pendiente" | "completada" | "omitida";
  goal?: { carga?: number | null; repeticiones?: number | null; duracion?: number | null } | null;
  result?: { carga?: number | null; repeticiones?: number | null; duracion?: number | null } | null;
  rpe?: number | null;
};

async function sessionWithExercise(
  context: TestContext,
  cookie: string,
  exerciseId: string,
  series: SeriesInput[] = [],
): Promise<SessionDocument> {
  const started = await startFreeSession(context, cookie);
  const session = (started.body as { session: SessionDocument }).session;
  const { status, body } = await replaceSession(context, cookie, session.id, {
    revision: session.revision,
    exercises: [{ exerciseId, series }],
  });
  expect(status).toBe(200);
  return (body as { session: SessionDocument }).session;
}

/**
 * Sustituye la única Serie de la única aparición de la Sesión. Lee primero el
 * estado vigente (como hace la interfaz) para escribir siempre con la última
 * revisión; un 400 o 409 no cambia el documento y el siguiente intento parte
 * del mismo estado.
 */
async function replaceSingleSeries(
  context: TestContext,
  cookie: string,
  session: SessionDocument,
  seriesInput: SeriesInput,
): Promise<{ status: number; body: unknown }> {
  const active = await getActiveSession(context, cookie);
  const current = (active.body as { session: SessionDocument }).session;
  const occurrence = current.exercises[0]!;
  return replaceSession(context, cookie, current.id, {
    revision: current.revision,
    exercises: [
      { id: occurrence.id, exerciseId: occurrence.exerciseId, series: [seriesInput] },
    ],
  });
}

/** Construye la entrada canónica de una Serie tal como la devuelve el documento. */
function echoSeriesInput(series: SeriesDocument): SeriesInput {
  return {
    id: series.id,
    status: series.status,
    goal: series.goal,
    result: series.result,
    rpe: series.rpe,
  };
}

/** Construye la entrada canónica de una aparición tal como la devuelve el documento. */
function echoExerciseInput(entry: SessionExerciseDocument): {
  id: string;
  exerciseId: string;
  series: SeriesInput[];
} {
  return {
    id: entry.id,
    exerciseId: entry.exerciseId,
    series: entry.series.map(echoSeriesInput),
  };
}

describe("registrar resultados por Serie", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("una Serie añadida a un Ejercicio se conserva con identidad propia y estado pendiente", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "fuerza_con_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null, rpe: null },
    ]);

    const occurrence = session.exercises[0]!;
    expect(occurrence.series).toHaveLength(1);
    const series = occurrence.series[0]!;
    expect(series.id).toMatch(/^[0-9a-f]{32}$/);
    expect(series.order).toBe(0);
    expect(series.status).toBe("pendiente");
    expect(series.added).toBe(true);
    expect(series.goal).toEqual({ carga: null, repeticiones: null, duracion: null });
    expect(series.result).toEqual({ carga: null, repeticiones: null, duracion: null });
    expect(series.rpe).toBeNull();
  });

  test("completar una Serie de fuerza con carga exige carga y repeticiones y conserva el RPE", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "fuerza_con_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null },
    ]);
    const seriesId = session.exercises[0]!.series[0]!.id;

    const { status, body } = await replaceSingleSeries(context!, cookie, session, {
      id: seriesId,
      status: "completada",
      goal: null,
      result: { carga: 100, repeticiones: 5 },
      rpe: 8.5,
    });
    expect(status).toBe(200);

    const series = (body as { session: SessionDocument }).session.exercises[0]!.series[0]!;
    expect(series.status).toBe("completada");
    expect(series.result).toEqual({ carga: 100, repeticiones: 5, duracion: null });
    expect(series.rpe).toBe(8.5);
    expect(series.added).toBe(true);
  });

  test("una entrada parcial no completa la Serie y responde el error junto al campo", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "fuerza_con_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null },
    ]);
    const seriesId = session.exercises[0]!.series[0]!.id;

    const partial = await replaceSingleSeries(context!, cookie, session, {
      id: seriesId,
      status: "completada",
      goal: null,
      result: { carga: 100, repeticiones: null },
    });
    expect(partial.status).toBe(400);
    const error = (partial.body as { error: { code: string; fields?: Record<string, string[]> } }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.["exercises[0].series[0].repeticiones"]).toBeDefined();

    // la entrada parcial no se persiste: la Serie sigue pendiente sin resultado
    const current = await getActiveSession(context!, cookie);
    const series = (current.body as { session: SessionDocument }).session.exercises[0]!.series[0]!;
    expect(series.status).toBe("pendiente");
    expect(series.result).toEqual({ carga: null, repeticiones: null, duracion: null });
  });

  test("repeticiones sin carga exige solo repeticiones al completar", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null },
    ]);
    const seriesId = session.exercises[0]!.series[0]!.id;

    const ok = await replaceSingleSeries(context!, cookie, session, {
      id: seriesId,
      status: "completada",
      goal: null,
      result: { repeticiones: 12 },
    });
    expect(ok.status).toBe(200);
    const series = (ok.body as { session: SessionDocument }).session.exercises[0]!.series[0]!;
    expect(series.result).toEqual({ carga: null, repeticiones: 12, duracion: null });

    const missing = await replaceSingleSeries(context!, cookie, session, {
      id: seriesId,
      status: "completada",
      goal: null,
      result: { repeticiones: null },
    });
    expect(missing.status).toBe(400);
    expect(
      ((missing.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].series[0].repeticiones"
      ]),
    ).toBeDefined();
  });

  test("tiempo por serie y cardio continuo exigen duración al completar", async () => {
    const tiempoId = await createCustomExercise(context!, cookie, { recordingMode: "tiempo_por_serie" });
    const cardioId = await createCustomExercise(context!, cookie, { recordingMode: "cardio_continuo" });
    const started = await startFreeSession(context!, cookie);
    const session = (started.body as { session: SessionDocument }).session;
    const { status, body } = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        { exerciseId: tiempoId, series: [{ status: "pendiente", goal: null, result: null }] },
        { exerciseId: cardioId, series: [{ status: "pendiente", goal: null, result: null }] },
      ],
    });
    expect(status).toBe(200);
    let current = (body as { session: SessionDocument }).session;

    for (const index of [0, 1]) {
      const seriesId = current.exercises[index]!.series[0]!.id;
      const ok = await replaceSession(context!, cookie, current.id, {
        revision: current.revision,
        exercises: current.exercises.map((entry, entryIndex) =>
          entryIndex === index
            ? {
                id: entry.id,
                exerciseId: entry.exerciseId,
                series: [{ id: seriesId, status: "completada", goal: null, result: { duracion: 300 } }],
              }
            : echoExerciseInput(entry),
        ),
      });
      expect(ok.status).toBe(200);
      current = (ok.body as { session: SessionDocument }).session;
      expect(current.exercises[index]!.series[0]!.result).toEqual({
        carga: null,
        repeticiones: null,
        duracion: 300,
      });

      const missing = await replaceSession(context!, cookie, current.id, {
        revision: current.revision,
        exercises: current.exercises.map((entry, entryIndex) =>
          entryIndex === index
            ? {
                id: entry.id,
                exerciseId: entry.exerciseId,
                series: [{ id: seriesId, status: "completada", goal: null, result: { duracion: null } }],
              }
            : echoExerciseInput(entry),
        ),
      });
      expect(missing.status).toBe(400);
      expect(
        ((missing.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
          `exercises[${index}].series[0].duracion`
        ]),
      ).toBeDefined();
    }
  });

  test("los límites de dominio se validan sin corrección silenciosa", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "fuerza_con_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null },
    ]);
    const seriesId = session.exercises[0]!.series[0]!.id;

    const expectRejected = async (result: SeriesInput["result"]) => {
      const { status } = await replaceSingleSeries(context!, cookie, session, {
        id: seriesId,
        status: "completada",
        goal: null,
        result,
      });
      expect(status).toBe(400);
    };
    const expectAccepted = async (result: SeriesInput["result"]) => {
      const { status } = await replaceSingleSeries(context!, cookie, session, {
        id: seriesId,
        status: "completada",
        goal: null,
        result,
      });
      expect(status).toBe(200);
    };

    await expectRejected({ carga: -1, repeticiones: 5 });
    await expectRejected({ carga: 9999.991, repeticiones: 5 });
    await expectRejected({ carga: 10000, repeticiones: 5 });
    await expectRejected({ carga: 100, repeticiones: 0 });
    await expectRejected({ carga: 100, repeticiones: 10000 });
    await expectAccepted({ carga: 0, repeticiones: 1 });
    await expectAccepted({ carga: 9999.99, repeticiones: 9999 });
    await expectAccepted({ carga: 123.45, repeticiones: 2 });

    // duración: enteros de 1 a 359999 — segunda aparición en la misma Sesión
    const tiempoId = await createCustomExercise(context!, cookie, { recordingMode: "tiempo_por_serie" });
    const active = await getActiveSession(context!, cookie);
    let current = (active.body as { session: SessionDocument }).session;
    const withTiempo = await replaceSession(context!, cookie, current.id, {
      revision: current.revision,
      exercises: [
        ...current.exercises.map(echoExerciseInput),
        { exerciseId: tiempoId, series: [{ status: "pendiente", goal: null, result: null }] },
      ],
    });
    expect(withTiempo.status).toBe(200);
    current = (withTiempo.body as { session: SessionDocument }).session;
    const tiempoSeriesId = current.exercises[1]!.series[0]!.id;

    const tiempoPut = async (result: SeriesInput["result"]) => {
      const fresh = await getActiveSession(context!, cookie);
      const latest = (fresh.body as { session: SessionDocument }).session;
      current = latest;
      return replaceSession(context!, cookie, latest.id, {
        revision: latest.revision,
        exercises: latest.exercises.map((entry, index) =>
          index === 1
            ? {
                id: entry.id,
                exerciseId: entry.exerciseId,
                series: [{ id: tiempoSeriesId, status: "completada", goal: null, result }],
              }
            : echoExerciseInput(entry),
        ),
      });
    };

    expect((await tiempoPut({ duracion: 0 })).status).toBe(400);
    expect((await tiempoPut({ duracion: 360000 })).status).toBe(400);
    expect((await tiempoPut({ duracion: 1 })).status).toBe(200);
    expect((await tiempoPut({ duracion: 359999 })).status).toBe(200);
  });

  test("el RPE solo existe en Series completadas y admite pasos de 0,5", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null },
    ]);
    const seriesId = session.exercises[0]!.series[0]!.id;

    // RPE en una Serie pendiente: rechazado
    const pendingWithRpe = await replaceSingleSeries(context!, cookie, session, {
      id: seriesId,
      status: "pendiente",
      goal: null,
      result: null,
      rpe: 7,
    });
    expect(pendingWithRpe.status).toBe(400);
    expect(
      ((pendingWithRpe.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].series[0].rpe"
      ]),
    ).toBeDefined();

    for (const invalid of [0.5, 7.3, 10.5]) {
      const rejected = await replaceSingleSeries(context!, cookie, session, {
        id: seriesId,
        status: "completada",
        goal: null,
        result: { repeticiones: 10 },
        rpe: invalid,
      });
      expect(rejected.status).toBe(400);
    }

    for (const valid of [1, 5.5, 10]) {
      const accepted = await replaceSingleSeries(context!, cookie, session, {
        id: seriesId,
        status: "completada",
        goal: null,
        result: { repeticiones: 10 },
        rpe: valid,
      });
      expect(accepted.status).toBe(200);
    }
  });

  test("un resultado no admite magnitudes ajenas a la Forma de registro", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null },
    ]);
    const seriesId = session.exercises[0]!.series[0]!.id;

    const rejected = await replaceSingleSeries(context!, cookie, session, {
      id: seriesId,
      status: "completada",
      goal: null,
      result: { repeticiones: 10, duracion: 60 },
    });
    expect(rejected.status).toBe(400);
    expect(
      ((rejected.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].series[0].duracion"
      ]),
    ).toBeDefined();
  });

  test("los Objetivos de serie inicializan los campos sin completar la Serie", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "fuerza_con_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: { carga: 80, repeticiones: 10 }, result: null },
    ]);

    // la Serie permanece pendiente con sus objetivos, sin resultado ni RPE
    const series = session.exercises[0]!.series[0]!;
    expect(series.status).toBe("pendiente");
    expect(series.goal).toEqual({ carga: 80, repeticiones: 10, duracion: null });
    expect(series.result).toEqual({ carga: null, repeticiones: null, duracion: null });
    expect(series.rpe).toBeNull();

    // los objetivos conservan los límites de dominio
    const invalidGoal = await replaceSingleSeries(context!, cookie, session, {
      id: series.id,
      status: "pendiente",
      goal: { carga: 80, repeticiones: 0 },
      result: null,
    });
    expect(invalidGoal.status).toBe(400);
    expect(
      ((invalidGoal.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].series[0].repeticiones"
      ]),
    ).toBeDefined();

    // un objetivo ajeno a la Forma se rechaza: cardio añadido a la misma Sesión
    const cardioId = await createCustomExercise(context!, cookie, { recordingMode: "cardio_continuo" });
    const active = await getActiveSession(context!, cookie);
    let current = (active.body as { session: SessionDocument }).session;
    const withCardio = await replaceSession(context!, cookie, current.id, {
      revision: current.revision,
      exercises: [
        ...current.exercises.map(echoExerciseInput),
        { exerciseId: cardioId, series: [{ status: "pendiente", goal: { duracion: 600 }, result: null }] },
      ],
    });
    expect(withCardio.status).toBe(200);
    current = (withCardio.body as { session: SessionDocument }).session;
    expect(current.exercises[1]!.series[0]!.goal).toEqual({
      carga: null,
      repeticiones: null,
      duracion: 600,
    });

    const wrongGoal = await replaceSession(context!, cookie, current.id, {
      revision: current.revision,
      exercises: current.exercises.map((entry, index) =>
        index === 1
          ? {
              id: entry.id,
              exerciseId: entry.exerciseId,
              series: [
                { id: current.exercises[1]!.series[0]!.id, status: "pendiente", goal: { carga: 80 }, result: null },
              ],
            }
          : echoExerciseInput(entry),
      ),
    });
    expect(wrongGoal.status).toBe(400);
    expect(
      ((wrongGoal.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[1].series[0].carga"
      ]),
    ).toBeDefined();
  });

  test("omitir y restaurar una Serie conservan los objetivos sin resultado", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "fuerza_con_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: { carga: 60, repeticiones: 8 }, result: null },
    ]);
    const seriesId = session.exercises[0]!.series[0]!.id;

    const omitted = await replaceSingleSeries(context!, cookie, session, {
      id: seriesId,
      status: "omitida",
      goal: { carga: 60, repeticiones: 8 },
      result: null,
    });
    expect(omitted.status).toBe(200);
    let series = (omitted.body as { session: SessionDocument }).session.exercises[0]!.series[0]!;
    expect(series.status).toBe("omitida");
    expect(series.goal).toEqual({ carga: 60, repeticiones: 8, duracion: null });
    expect(series.result).toEqual({ carga: null, repeticiones: null, duracion: null });

    const restored = await replaceSingleSeries(context!, cookie, session, {
      id: seriesId,
      status: "pendiente",
      goal: { carga: 60, repeticiones: 8 },
      result: null,
    });
    expect(restored.status).toBe(200);
    series = (restored.body as { session: SessionDocument }).session.exercises[0]!.series[0]!;
    expect(series.status).toBe("pendiente");

    // restaurar como completada exige un resultado completo
    const restoredCompleted = await replaceSingleSeries(context!, cookie, session, {
      id: seriesId,
      status: "completada",
      goal: { carga: 60, repeticiones: 8 },
      result: { carga: 62.5, repeticiones: 8 },
      rpe: 7,
    });
    expect(restoredCompleted.status).toBe(200);
    series = (restoredCompleted.body as { session: SessionDocument }).session.exercises[0]!.series[0]!;
    expect(series.status).toBe("completada");
    expect(series.result).toEqual({ carga: 62.5, repeticiones: 8, duracion: null });
  });

  test("cardio continuo admite exactamente una Serie por aparición del Ejercicio", async () => {
    const cardioId = await createCustomExercise(context!, cookie, { recordingMode: "cardio_continuo" });
    const session = await sessionWithExercise(context!, cookie, cardioId, [
      { status: "pendiente", goal: null, result: null },
    ]);
    const occurrenceId = session.exercises[0]!.id;
    const seriesId = session.exercises[0]!.series[0]!.id;

    // añadir una segunda Serie a la misma aparición: rechazado
    const twoSeries = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: occurrenceId,
          exerciseId: cardioId,
          series: [
            { id: seriesId, status: "pendiente", goal: null, result: null },
            { status: "pendiente", goal: null, result: null },
          ],
        },
      ],
    });
    expect(twoSeries.status).toBe(400);
    expect(
      ((twoSeries.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].series"
      ]),
    ).toBeDefined();

    // un segundo esfuerzo se registra añadiendo de nuevo el Ejercicio
    const secondAppearance = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: occurrenceId,
          exerciseId: cardioId,
          series: [{ id: seriesId, status: "pendiente", goal: null, result: null }],
        },
        { exerciseId: cardioId, series: [{ status: "pendiente", goal: null, result: null }] },
      ],
    });
    expect(secondAppearance.status).toBe(200);
    const next = (secondAppearance.body as { session: SessionDocument }).session;
    expect(next.exercises).toHaveLength(2);
    expect(next.exercises[1]!.series).toHaveLength(1);
  });

  test("repetir una escritura con revisión anterior no duplica Series", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null },
    ]);
    const seriesId = session.exercises[0]!.series[0]!.id;

    const first = await replaceSingleSeries(context!, cookie, session, {
      id: seriesId,
      status: "completada",
      goal: null,
      result: { repeticiones: 10 },
    });
    expect(first.status).toBe(200);
    const afterFirst = (first.body as { session: SessionDocument }).session;

    // repetición de la escritura con la revisión anterior: conflicto sin duplicar
    const stale = await replaceSession(context!, cookie, afterFirst.id, {
      revision: session.revision,
      exercises: [
        {
          id: afterFirst.exercises[0]!.id,
          exerciseId,
          series: [
            { id: seriesId, status: "completada", goal: null, result: { repeticiones: 10 } },
            { status: "completada", goal: null, result: { repeticiones: 12 } },
          ],
        },
      ],
    });
    expect(stale.status).toBe(409);
    expect((stale.body as { error: { code: string } }).error.code).toBe("REVISION_CONFLICT");

    const current = await getActiveSession(context!, cookie);
    const afterStale = (current.body as { session: SessionDocument }).session;
    expect(afterStale.revision).toBe(afterFirst.revision);
    expect(afterStale.exercises[0]!.series).toHaveLength(1);

    // reintentar con la revisión vigente añade la Serie sin duplicar la primera
    const retried = await replaceSession(context!, cookie, afterFirst.id, {
      revision: afterStale.revision,
      exercises: [
        {
          id: afterStale.exercises[0]!.id,
          exerciseId,
          series: [
            { id: seriesId, status: "completada", goal: null, result: { repeticiones: 10 } },
            { status: "completada", goal: null, result: { repeticiones: 12 } },
          ],
        },
      ],
    });
    expect(retried.status).toBe(200);
    const series = (retried.body as { session: SessionDocument }).session.exercises[0]!.series!;
    expect(series).toHaveLength(2);
    expect(series[0]!.id).toBe(seriesId);
    expect(series[1]!.id).not.toBe(seriesId);
  });

  test("una Serie ajena o de otra aparición es un hijo desconocido", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null },
      { status: "pendiente", goal: null, result: null },
    ]);
    const occurrenceId = session.exercises[0]!.id;
    const firstSeriesId = session.exercises[0]!.series[0]!.id;
    const secondSeriesId = session.exercises[0]!.series[1]!.id;

    // un identificador de Serie inexistente es rechazado
    const unknown = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: occurrenceId,
          exerciseId,
          series: [{ id: "ffffffffffffffffffffffffffffffff", status: "pendiente", goal: null, result: null }],
        },
      ],
    });
    expect(unknown.status).toBe(400);
    expect(
      ((unknown.body as { error: { fields?: Record<string, string[]> } }).error.fields?.["exercises"]),
    ).toBeDefined();

    // el mismo identificador repetido dos veces es rechazado
    const duplicated = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: occurrenceId,
          exerciseId,
          series: [
            { id: firstSeriesId, status: "pendiente", goal: null, result: null },
            { id: firstSeriesId, status: "pendiente", goal: null, result: null },
          ],
        },
      ],
    });
    expect(duplicated.status).toBe(400);

    // una Serie de otra aparición es un hijo desconocido: primero se añade la
    // segunda aparición y después se intenta colocar bajo ella una Serie de la
    // primera
    const withSecond = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: occurrenceId,
          exerciseId,
          series: [
            { id: firstSeriesId, status: "pendiente", goal: null, result: null },
            { id: secondSeriesId, status: "pendiente", goal: null, result: null },
          ],
        },
        { exerciseId, series: [] },
      ],
    });
    expect(withSecond.status).toBe(200);
    const afterSecond = (withSecond.body as { session: SessionDocument }).session;

    const misplaced = await replaceSession(context!, cookie, afterSecond.id, {
      revision: afterSecond.revision,
      exercises: [
        echoExerciseInput(afterSecond.exercises[0]!),
        {
          id: afterSecond.exercises[1]!.id,
          exerciseId,
          series: [{ id: secondSeriesId, status: "pendiente", goal: null, result: null }],
        },
      ],
    });
    expect(misplaced.status).toBe(400);
  });
});

async function finalizeSessionRequest(
  context: TestContext,
  cookie: string,
  id: string,
  revision: number,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(`/api/sessions/${id}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({ revision }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

/**
 * Crea una Sesión libre con una Serie completada y una pendiente y la
 * finaliza: el resultado es un registro del Historial con una Serie
 * completada y otra omitida.
 */
async function finalizedFreeSession(
  context: TestContext,
  cookie: string,
): Promise<SessionDocument> {
  const exerciseId = await createCustomExercise(context, cookie, { recordingMode: "fuerza_con_carga" });
  const session = await sessionWithExercise(context, cookie, exerciseId, [
    { status: "completada", goal: null, result: { carga: 80, repeticiones: 10 }, rpe: 8 },
    { status: "pendiente", goal: null, result: null },
  ]);
  const finalized = await finalizeSessionRequest(context, cookie, session.id, session.revision);
  expect(finalized.status).toBe(200);
  return (finalized.body as { session: SessionDocument }).session;
}

describe("finalizar una Sesión", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("finaliza una Sesión con Series completadas y pendientes: estas pasan a omitidas y deja de estar activa", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "fuerza_con_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      {
        status: "completada",
        goal: { carga: 80, repeticiones: 10 },
        result: { carga: 80, repeticiones: 10 },
        rpe: 8.5,
      },
      { status: "pendiente", goal: { carga: 80, repeticiones: 10 }, result: null },
      { status: "pendiente", goal: null, result: null },
    ]);
    const seriesIds = session.exercises[0]!.series.map((series) => series.id);

    const { status, body } = await finalizeSessionRequest(
      context!, cookie, session.id, session.revision,
    );
    expect(status).toBe(200);

    const finalized = (body as { session: SessionDocument }).session;
    expect(finalized.status).toBe("finalizada");
    expect(finalized.revision).toBe(session.revision + 1);
    expect(finalized.exercises).toHaveLength(1);
    const series = finalized.exercises[0]!.series;
    expect(series.map((entry) => entry.id)).toEqual(seriesIds);
    // la completada conserva resultado y RPE; las pendientes pasan a omitidas
    // conservando sus objetivos y sin resultado ni RPE
    expect(series[0]!.status).toBe("completada");
    expect(series[0]!.result).toEqual({ carga: 80, repeticiones: 10, duracion: null });
    expect(series[0]!.rpe).toBe(8.5);
    expect(series[1]!.status).toBe("omitida");
    expect(series[1]!.goal).toEqual({ carga: 80, repeticiones: 10, duracion: null });
    expect(series[1]!.result).toEqual({ carga: null, repeticiones: null, duracion: null });
    expect(series[1]!.rpe).toBeNull();
    expect(series[2]!.status).toBe("omitida");
    expect(finalized.exercises[0]!.series.some((entry) => entry.status === "pendiente")).toBe(false);

    // ya no aparece como activa y una nueva Sesión puede iniciarse
    const active = await getActiveSession(context!, cookie);
    expect(active.status).toBe(200);
    expect(active.body).toEqual({ session: null });

    const restarted = await startFreeSession(context!, cookie);
    expect(restarted.status).toBe(201);
  });

  test("finalizar sin ninguna Serie completada responde 400", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null },
      { status: "omitida", goal: null, result: null },
    ]);

    const { status, body } = await finalizeSessionRequest(
      context!, cookie, session.id, session.revision,
    );
    expect(status).toBe(400);
    const error = (body as { error: { code: string; message: string } }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain("al menos una Serie completada");

    // nada cambió: la Sesión sigue activa con sus Series pendientes
    const active = await getActiveSession(context!, cookie);
    const after = (active.body as { session: SessionDocument }).session;
    expect(after.status).toBe("activa");
    expect(after.exercises[0]!.series[0]!.status).toBe("pendiente");
  });

  test("finalizar con una revisión obsoleta responde 409 sin cambiar el estado", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "completada", goal: null, result: { repeticiones: 10 } },
    ]);

    const stale = await finalizeSessionRequest(context!, cookie, session.id, session.revision - 1);
    expect(stale.status).toBe(409);
    expect((stale.body as { error: { code: string } }).error.code).toBe("REVISION_CONFLICT");

    const active = await getActiveSession(context!, cookie);
    const after = (active.body as { session: SessionDocument }).session;
    expect(after.status).toBe("activa");
    expect(after.revision).toBe(session.revision);

    // con la revisión vigente finaliza
    const ok = await finalizeSessionRequest(context!, cookie, session.id, after.revision);
    expect(ok.status).toBe(200);
  });

  test("una Sesión ya finalizada no puede finalizarse de nuevo", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "completada", goal: null, result: { repeticiones: 10 } },
    ]);
    const first = await finalizeSessionRequest(context!, cookie, session.id, session.revision);
    expect(first.status).toBe(200);
    const finalized = (first.body as { session: SessionDocument }).session;

    const again = await finalizeSessionRequest(
      context!, cookie, finalized.id, finalized.revision,
    );
    expect(again.status).toBe(409);
    expect((again.body as { error: { code: string } }).error.code).toBe("SESSION_NOT_ACTIVE");
  });

  test("finalizar una Sesión ajena o inexistente responde 404", async () => {
    const { status } = await finalizeSessionRequest(
      context!, cookie, "ffffffffffffffffffffffffffffffff", 1,
    );
    expect(status).toBe(404);
  });

  test("finalizar sin revisión es entrada inválida", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "completada", goal: null, result: { repeticiones: 10 } },
    ]);
    const response = await context!.app.request(`/api/sessions/${session.id}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });
});

async function deleteSessionRequest(
  context: TestContext,
  cookie: string,
  id: string,
  revision: number,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(
    `/api/sessions/${id}?revision=${revision}`,
    { method: "DELETE", headers: { Cookie: cookie, Origin: origin } },
  );
  return { status: response.status, body: (await response.json()) as unknown };
}

describe("eliminar una Sesión activa", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("elimina el agregado en una transacción y permite iniciar una nueva Sesión", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "fuerza_con_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "completada", goal: null, result: { carga: 80, repeticiones: 10 }, rpe: 7 },
      { status: "pendiente", goal: null, result: null },
    ]);

    const { status, body } = await deleteSessionRequest(
      context!, cookie, session.id, session.revision,
    );
    expect(status).toBe(200);
    expect(body).toEqual({ deleted: true });

    // el agregado y sus hijos desaparecen: lectura y activa responden como inexistentes
    const byId = await getSession(context!, cookie, session.id);
    expect(byId.status).toBe(404);
    const active = await getActiveSession(context!, cookie);
    expect(active.status).toBe(200);
    expect(active.body).toEqual({ session: null });

    // una nueva Sesión puede iniciarse: la unicidad de la activa quedó libre
    const restarted = await startFreeSession(context!, cookie);
    expect(restarted.status).toBe(201);
  });

  test("una revisión obsoleta responde 409 y conserva la Sesión", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null },
    ]);

    const stale = await deleteSessionRequest(context!, cookie, session.id, session.revision - 1);
    expect(stale.status).toBe(409);
    const conflict = (stale.body as { error: { code: string; session?: SessionDocument } }).error;
    expect(conflict.code).toBe("REVISION_CONFLICT");
    // el conflicto carga la versión vigente sin eliminar ni mezclar cambios
    expect(conflict.session?.id).toBe(session.id);
    expect(conflict.session?.revision).toBe(session.revision);

    const active = await getActiveSession(context!, cookie);
    const after = (active.body as { session: SessionDocument }).session;
    expect(after.id).toBe(session.id);
    expect(after.revision).toBe(session.revision);

    // con la revisión vigente elimina
    const ok = await deleteSessionRequest(context!, cookie, session.id, after.revision);
    expect(ok.status).toBe(200);
  });

  test("una Sesión finalizada puede eliminarse por este canal: el Historial corrige y elimina registros (ticket 29)", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "completada", goal: null, result: { repeticiones: 10 } },
    ]);
    const finalized = await finalizeSessionRequest(context!, cookie, session.id, session.revision);
    expect(finalized.status).toBe(200);
    const after = (finalized.body as { session: SessionDocument }).session;

    const { status, body } = await deleteSessionRequest(
      context!, cookie, after.id, after.revision,
    );
    expect(status).toBe(200);
    expect(body).toEqual({ deleted: true });

    const gone = await getSession(context!, cookie, after.id);
    expect(gone.status).toBe(404);
  });

  test("eliminar una Sesión ajena o inexistente responde 404", async () => {
    const { status } = await deleteSessionRequest(
      context!, cookie, "ffffffffffffffffffffffffffffffff", 1,
    );
    expect(status).toBe(404);
  });

  test("eliminar sin revisión es entrada inválida", async () => {
    const response = await context!.app.request("/api/sessions/sesion-sin-revision", {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: origin },
    });
    expect(response.status).toBe(400);
  });
});

describe("eliminar y transicionar Series y Ejercicios añadidos", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("una Serie añadida pendiente puede eliminarse de la Sesión", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null },
      { status: "pendiente", goal: null, result: null },
    ]);
    const occurrence = session.exercises[0]!;
    const keptId = occurrence.series[0]!.id;
    const removedId = occurrence.series[1]!.id;

    const { status, body } = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId,
          series: [{ id: keptId, status: "pendiente", goal: null, result: null }],
        },
      ],
    });
    expect(status).toBe(200);

    const next = (body as { session: SessionDocument }).session;
    expect(next.revision).toBe(session.revision + 1);
    expect(next.exercises[0]!.series).toHaveLength(1);
    expect(next.exercises[0]!.series[0]!.id).toBe(keptId);
    expect(next.exercises[0]!.series[0]!.id).not.toBe(removedId);
  });

  test("una Serie añadida con resultado puede eliminarse: la confirmación es de la interfaz", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "completada", goal: null, result: { repeticiones: 10 }, rpe: 7 },
    ]);
    const occurrence = session.exercises[0]!;

    const { status, body } = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [{ id: occurrence.id, exerciseId, series: [] }],
    });
    expect(status).toBe(200);
    const next = (body as { session: SessionDocument }).session;
    expect(next.exercises[0]!.series).toEqual([]);
    expect(next.revision).toBe(session.revision + 1);
  });

  test("pasar una Serie completada a omitida elimina resultado y RPE y conserva los objetivos", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "fuerza_con_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "completada", goal: { carga: 80, repeticiones: 10 }, result: { carga: 82.5, repeticiones: 10 }, rpe: 9 },
    ]);
    const seriesId = session.exercises[0]!.series[0]!.id;

    const { status, body } = await replaceSingleSeries(context!, cookie, session, {
      id: seriesId,
      status: "omitida",
      goal: { carga: 80, repeticiones: 10 },
      result: null,
      rpe: null,
    });
    expect(status).toBe(200);

    const series = (body as { session: SessionDocument }).session.exercises[0]!.series[0]!;
    expect(series.status).toBe("omitida");
    expect(series.goal).toEqual({ carga: 80, repeticiones: 10, duracion: null });
    expect(series.result).toEqual({ carga: null, repeticiones: null, duracion: null });
    expect(series.rpe).toBeNull();
  });

  test("devolver una Serie completada a pendiente elimina resultado y RPE", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "completada", goal: null, result: { repeticiones: 12 }, rpe: 8 },
    ]);
    const seriesId = session.exercises[0]!.series[0]!.id;

    const { status, body } = await replaceSingleSeries(context!, cookie, session, {
      id: seriesId,
      status: "pendiente",
      goal: null,
      result: null,
      rpe: null,
    });
    expect(status).toBe(200);

    const series = (body as { session: SessionDocument }).session.exercises[0]!.series[0]!;
    expect(series.status).toBe("pendiente");
    expect(series.result).toEqual({ carga: null, repeticiones: null, duracion: null });
    expect(series.rpe).toBeNull();
  });

  test("un Ejercicio añadido puede eliminarse con todas sus Series", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "pendiente", goal: null, result: null },
      { status: "completada", goal: null, result: { repeticiones: 10 }, rpe: 6 },
    ]);
    const occurrenceId = session.exercises[0]!.id;

    const { status, body } = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [],
    });
    expect(status).toBe(200);

    const next = (body as { session: SessionDocument }).session;
    expect(next.exercises).toEqual([]);
    expect(next.revision).toBe(session.revision + 1);
    expect(next.lastExerciseId).toBeNull();
    expect(occurrenceId).toBeTruthy();
  });

  test("un Ejercicio añadido con resultados en sus Series puede eliminarse", async () => {
    const ejercicioA = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const ejercicioB = await createCustomExercise(context!, cookie, { recordingMode: "tiempo_por_serie" });
    const started = await startFreeSession(context!, cookie);
    const session = (started.body as { session: SessionDocument }).session;
    const { status, body } = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        { exerciseId: ejercicioA, series: [{ status: "completada", goal: null, result: { repeticiones: 10 } }] },
        { exerciseId: ejercicioB, series: [{ status: "completada", goal: null, result: { duracion: 60 } }] },
      ],
    });
    expect(status).toBe(200);
    let current = (body as { session: SessionDocument }).session;
    expect(current.exercises).toHaveLength(2);

    const removed = await replaceSession(context!, cookie, current.id, {
      revision: current.revision,
      exercises: [echoExerciseInput(current.exercises[1]!)],
    });
    expect(removed.status).toBe(200);
    const next = (removed.body as { session: SessionDocument }).session;
    expect(next.exercises).toHaveLength(1);
    expect(next.exercises[0]!.id).toBe(current.exercises[1]!.id);
    expect(next.exercises[0]!.series[0]!.status).toBe("completada");
    expect(next.lastExerciseId).toBe(ejercicioB);
  });
});

export type SessionHistoryItem = {
  id: string;
  origin: SessionOrigin;
  datePerformed: string;
  plannedDate: string | null;
  startedAt: string;
  updatedAt: string;
  exerciseCount: number;
  completedSeries: number;
  omittedSeries: number;
};

async function listSessions(
  context: TestContext,
  cookie: string,
  query: Record<string, string | number> = {},
): Promise<{ status: number; body: unknown }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    params.set(key, String(value));
  }
  const qs = params.toString();
  const response = await context.app.request(`/api/sessions${qs ? `?${qs}` : ""}`, {
    headers: { Cookie: cookie, Origin: origin },
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

describe("corregir una Sesión finalizada", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  async function finalizedWithSeries(series: SeriesInput[]): Promise<SessionDocument> {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "fuerza_con_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, series);
    const finalized = await finalizeSessionRequest(context!, cookie, session.id, session.revision);
    expect(finalized.status).toBe(200);
    return (finalized.body as { session: SessionDocument }).session;
  }

  test("una corrección edita objetivos, resultados, RPE y Fecha realizada y devuelve la representación canónica", async () => {
    const finalized = await finalizedWithSeries([
      { status: "completada", goal: { carga: 80, repeticiones: 10 }, result: { carga: 82.5, repeticiones: 10 }, rpe: 8.5 },
      { status: "pendiente", goal: { carga: 80, repeticiones: 10 }, result: null },
    ]);
    const occurrence = finalized.exercises[0]!;

    const { status, body } = await replaceSession(context!, cookie, finalized.id, {
      revision: finalized.revision,
      datePerformed: "2025-03-08",
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [
            { id: occurrence.series[0]!.id, status: "completada", goal: { carga: 85, repeticiones: 8 }, result: { carga: 85, repeticiones: 8 }, rpe: 9 },
            { id: occurrence.series[1]!.id, status: "omitida", goal: { carga: 80, repeticiones: 10 }, result: null },
          ],
        },
      ],
    });
    expect(status).toBe(200);

    const corrected = (body as { session: SessionDocument }).session;
    expect(corrected.status).toBe("finalizada");
    expect(corrected.revision).toBe(finalized.revision + 1);
    expect(corrected.datePerformed).toBe("2025-03-08");
    expect(corrected.plannedDate).toBeNull();
    expect(corrected.exercises).toHaveLength(1);
    const series = corrected.exercises[0]!.series;
    expect(series[0]!.status).toBe("completada");
    expect(series[0]!.goal).toEqual({ carga: 85, repeticiones: 8, duracion: null });
    expect(series[0]!.result).toEqual({ carga: 85, repeticiones: 8, duracion: null });
    expect(series[0]!.rpe).toBe(9);
    expect(series[1]!.status).toBe("omitida");
    expect(series[1]!.goal).toEqual({ carga: 80, repeticiones: 10, duracion: null });
    expect(series[1]!.result).toEqual({ carga: null, repeticiones: null, duracion: null });
    expect(series[1]!.rpe).toBeNull();
  });

  test("corregir la Fecha realizada no mueve la Fecha prevista del Entrenamiento de origen", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] }],
    });
    const plan = await createPlan(context!, cookie, {
      name: "Ciclo base",
      weeks: [{ trainings: [{ day: 0, source: "rutina", routineId: routine.id }] }],
    });
    const activated = await activatePlan(context!, cookie, plan.id, plan.revision, "2025-03-03");
    const training = activated.weeks[0]!.trainings[0]!;
    const started = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: activated.id,
      trainingId: training.id,
    });
    expect(started.status).toBe(201);
    let session = (started.body as { session: SessionDocument }).session;
    const occurrence = session.exercises[0]!;
    const completed = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [
            { id: occurrence.series[0]!.id, status: "completada", goal: { carga: 60, repeticiones: 10 }, result: { carga: 62.5, repeticiones: 10 }, rpe: 8 },
          ],
        },
      ],
    });
    expect(completed.status).toBe(200);
    session = (completed.body as { session: SessionDocument }).session;
    const finalized = await finalizeSessionRequest(context!, cookie, session.id, session.revision);
    expect(finalized.status).toBe(200);
    const after = (finalized.body as { session: SessionDocument }).session;
    expect(after.plannedDate).toBe(training.plannedDate);

    const { status, body } = await replaceSession(context!, cookie, after.id, {
      revision: after.revision,
      datePerformed: "2025-03-12",
      exercises: after.exercises.map(echoExerciseInput),
    });
    expect(status).toBe(200);
    const corrected = (body as { session: SessionDocument }).session;
    expect(corrected.datePerformed).toBe("2025-03-12");
    expect(corrected.plannedDate).toBe(training.plannedDate);
  });

  test("cambia una Serie entre completada y omitida conservando los objetivos", async () => {
    const finalized = await finalizedWithSeries([
      { status: "completada", goal: { carga: 80, repeticiones: 10 }, result: { carga: 82.5, repeticiones: 10 }, rpe: 8.5 },
      { status: "pendiente", goal: { carga: 80, repeticiones: 10 }, result: null },
    ]);
    const occurrence = finalized.exercises[0]!;
    const firstId = occurrence.series[0]!.id;
    const secondId = occurrence.series[1]!.id;

    const { status, body } = await replaceSession(context!, cookie, finalized.id, {
      revision: finalized.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [
            { id: firstId, status: "omitida", goal: { carga: 80, repeticiones: 10 }, result: null },
            { id: secondId, status: "completada", goal: { carga: 80, repeticiones: 10 }, result: { carga: 85, repeticiones: 10 }, rpe: 9 },
          ],
        },
      ],
    });
    expect(status).toBe(200);

    const series = (body as { session: SessionDocument }).session.exercises[0]!.series;
    expect(series[0]!.status).toBe("omitida");
    expect(series[0]!.result).toEqual({ carga: null, repeticiones: null, duracion: null });
    expect(series[0]!.rpe).toBeNull();
    expect(series[0]!.goal).toEqual({ carga: 80, repeticiones: 10, duracion: null });
    expect(series[1]!.status).toBe("completada");
    expect(series[1]!.result).toEqual({ carga: 85, repeticiones: 10, duracion: null });
    expect(series[1]!.rpe).toBe(9);
    expect(series[1]!.goal).toEqual({ carga: 80, repeticiones: 10, duracion: null });
  });

  test("añade una Serie con resultado completo a una Sesión finalizada", async () => {
    const finalized = await finalizedWithSeries([
      { status: "completada", goal: null, result: { carga: 80, repeticiones: 10 }, rpe: 8 },
    ]);
    const occurrence = finalized.exercises[0]!;

    const { status, body } = await replaceSession(context!, cookie, finalized.id, {
      revision: finalized.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [
            echoSeriesInput(occurrence.series[0]!),
            { status: "completada", goal: { carga: 80, repeticiones: 10 }, result: { carga: 85, repeticiones: 6 }, rpe: 9 },
          ],
        },
      ],
    });
    expect(status).toBe(200);

    const next = (body as { session: SessionDocument }).session;
    expect(next.exercises[0]!.series).toHaveLength(2);
    const added = next.exercises[0]!.series[1]!;
    expect(added.added).toBe(true);
    expect(added.status).toBe("completada");
    expect(added.result).toEqual({ carga: 85, repeticiones: 6, duracion: null });
    expect(added.rpe).toBe(9);
    expect(next.revision).toBe(finalized.revision + 1);
  });

  test("una Sesión finalizada rechaza Series pendientes", async () => {
    const finalized = await finalizedWithSeries([
      { status: "completada", goal: null, result: { carga: 80, repeticiones: 10 } },
    ]);
    const occurrence = finalized.exercises[0]!;

    const { status, body } = await replaceSession(context!, cookie, finalized.id, {
      revision: finalized.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [{ id: occurrence.series[0]!.id, status: "pendiente", goal: null, result: null }],
        },
      ],
    });
    expect(status).toBe(400);
    const error = (body as { error: { code: string; fields?: Record<string, string[]> } }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.["exercises[0].series[0].status"]).toBeDefined();

    // nada cambió: sigue finalizada con su Serie completada y la misma revisión
    const current = (await getSession(context!, cookie, finalized.id)).body as { session: SessionDocument };
    expect(current.session.status).toBe("finalizada");
    expect(current.session.revision).toBe(finalized.revision);
    expect(current.session.exercises[0]!.series[0]!.status).toBe("completada");
  });

  test("una Sesión finalizada no puede quedar sin al menos una Serie completada", async () => {
    const finalized = await finalizedWithSeries([
      { status: "completada", goal: null, result: { carga: 80, repeticiones: 10 }, rpe: 8 },
      { status: "completada", goal: null, result: { carga: 85, repeticiones: 8 }, rpe: 9 },
    ]);
    const occurrence = finalized.exercises[0]!;

    const { status, body } = await replaceSession(context!, cookie, finalized.id, {
      revision: finalized.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [
            { id: occurrence.series[0]!.id, status: "omitida", goal: null, result: null },
            { id: occurrence.series[1]!.id, status: "omitida", goal: null, result: null },
          ],
        },
      ],
    });
    expect(status).toBe(400);
    const error = (body as { error: { code: string; fields?: Record<string, string[]> } }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.["exercises"]).toBeDefined();
  });

  test("una Serie prevista no puede eliminarse de una Sesión finalizada", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de tracción",
      exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }, { carga: 60, repeticiones: 8 }] }],
    });
    const plan = await createPlan(context!, cookie, {
      name: "Ciclo base",
      weeks: [{ trainings: [{ day: 0, source: "rutina", routineId: routine.id }] }],
    });
    const activated = await activatePlan(context!, cookie, plan.id, plan.revision, "2025-03-03");
    const training = activated.weeks[0]!.trainings[0]!;
    const started = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: activated.id,
      trainingId: training.id,
    });
    expect(started.status).toBe(201);
    let session = (started.body as { session: SessionDocument }).session;
    const occurrence = session.exercises[0]!;
    const completed = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [
            { id: occurrence.series[0]!.id, status: "completada", goal: { carga: 60, repeticiones: 10 }, result: { carga: 62.5, repeticiones: 10 }, rpe: 8 },
            { id: occurrence.series[1]!.id, status: "completada", goal: { carga: 60, repeticiones: 8 }, result: { carga: 62.5, repeticiones: 8 }, rpe: 8 },
          ],
        },
      ],
    });
    expect(completed.status).toBe(200);
    session = (completed.body as { session: SessionDocument }).session;
    const finalized = await finalizeSessionRequest(context!, cookie, session.id, session.revision);
    expect(finalized.status).toBe(200);
    const after = (finalized.body as { session: SessionDocument }).session;
    const plannedOccurrence = after.exercises[0]!;
    expect(plannedOccurrence.added).toBe(false);
    expect(plannedOccurrence.series.every((entry) => !entry.added)).toBe(true);

    // se intenta conservar solo la primera Serie prevista
    const { status, body } = await replaceSession(context!, cookie, after.id, {
      revision: after.revision,
      exercises: [
        {
          id: plannedOccurrence.id,
          exerciseId: plannedOccurrence.exerciseId,
          series: [echoSeriesInput(plannedOccurrence.series[0]!)],
        },
      ],
    });
    expect(status).toBe(400);
    const error = (body as { error: { code: string; fields?: Record<string, string[]> } }).error;
    expect(error.fields?.["exercises[0].series"]).toContain(
      "Las Series previstas no pueden eliminarse; omítelas en su lugar.",
    );
  });

  test("una Serie añadida puede eliminarse de una Sesión finalizada", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "repeticiones_sin_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "completada", goal: null, result: { repeticiones: 10 }, rpe: 7 },
      { status: "completada", goal: null, result: { repeticiones: 8 }, rpe: 6 },
    ]);
    const finalized = await finalizeSessionRequest(context!, cookie, session.id, session.revision);
    expect(finalized.status).toBe(200);
    const after = (finalized.body as { session: SessionDocument }).session;
    const occurrence = after.exercises[0]!;
    expect(occurrence.added).toBe(true);
    const keptId = occurrence.series[0]!.id;
    const removedId = occurrence.series[1]!.id;

    const { status, body } = await replaceSession(context!, cookie, after.id, {
      revision: after.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [echoSeriesInput(occurrence.series[0]!)],
        },
      ],
    });
    expect(status).toBe(200);

    const next = (body as { session: SessionDocument }).session;
    expect(next.exercises[0]!.series).toHaveLength(1);
    expect(next.exercises[0]!.series[0]!.id).toBe(keptId);
    expect(next.exercises[0]!.series[0]!.id).not.toBe(removedId);
    expect(next.exercises[0]!.series[0]!.status).toBe("completada");
  });

  test("una revisión obsoleta responde 409 sin mezclar cambios y la versión vigente se conserva", async () => {
    const finalized = await finalizedWithSeries([
      { status: "completada", goal: null, result: { carga: 80, repeticiones: 10 } },
    ]);
    const occurrence = finalized.exercises[0]!;

    const stale = await replaceSession(context!, cookie, finalized.id, {
      revision: finalized.revision - 1,
      datePerformed: "2025-03-08",
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [echoSeriesInput(occurrence.series[0]!)],
        },
      ],
    });
    expect(stale.status).toBe(409);
    const conflict = (stale.body as { error: { code: string; session?: SessionDocument } }).error;
    expect(conflict.code).toBe("REVISION_CONFLICT");
    // el conflicto carga la versión vigente sin aplicar la corrección obsoleta
    expect(conflict.session?.id).toBe(finalized.id);
    expect(conflict.session?.revision).toBe(finalized.revision);
    expect(conflict.session?.datePerformed).toBe(finalized.datePerformed);
    expect(conflict.session?.exercises[0]!.series[0]!.result).toEqual({ carga: 80, repeticiones: 10, duracion: null });

    const current = (await getSession(context!, cookie, finalized.id)).body as { session: SessionDocument };
    expect(current.session.revision).toBe(finalized.revision);
    expect(current.session.datePerformed).toBe(finalized.datePerformed);
    expect(current.session.exercises[0]!.series[0]!.result).toEqual({ carga: 80, repeticiones: 10, duracion: null });

    // con la revisión vigente la corrección sí se aplica
    const ok = await replaceSession(context!, cookie, finalized.id, {
      revision: current.session.revision,
      datePerformed: "2025-03-08",
      exercises: current.session.exercises.map(echoExerciseInput),
    });
    expect(ok.status).toBe(200);
    expect((ok.body as { session: SessionDocument }).session.datePerformed).toBe("2025-03-08");
  });

  test("una Fecha realizada inválida responde 400", async () => {
    const finalized = await finalizedWithSeries([
      { status: "completada", goal: null, result: { carga: 80, repeticiones: 10 } },
    ]);

    const { status } = await replaceSession(context!, cookie, finalized.id, {
      revision: finalized.revision,
      datePerformed: "2025-02-30",
      exercises: finalized.exercises.map(echoExerciseInput),
    });
    expect(status).toBe(400);
  });

  test("una Sesión activa no admite la corrección de la Fecha realizada: solo el Historial la corrige (ticket 29)", async () => {
    const exerciseId = await createCustomExercise(context!, cookie, { recordingMode: "fuerza_con_carga" });
    const session = await sessionWithExercise(context!, cookie, exerciseId, [
      { status: "completada", goal: null, result: { carga: 80, repeticiones: 10 } },
    ]);
    expect(session.status).toBe("activa");

    // la Fecha realizada se fija al iniciar; una Sesión activa no puede moverla
    const rejected = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      datePerformed: "2025-03-08",
      exercises: session.exercises.map(echoExerciseInput),
    });
    expect(rejected.status).toBe(400);
    const error = (rejected.body as { error: { code: string; fields?: Record<string, string[]> } }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.datePerformed).toBeDefined();

    const after = (await getActiveSession(context!, cookie)).body as { session: SessionDocument };
    expect(after.session.datePerformed).toBe(session.datePerformed);
    expect(after.session.revision).toBe(session.revision);

    // sin Fecha realizada la sustitución de la Sesión activa sigue funcionando
    const ok = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: session.exercises.map(echoExerciseInput),
    });
    expect(ok.status).toBe(200);
  });

  test("corregir una Sesión finalizada ajena se comporta como inexistente", async () => {
    const cookieB = await registerVerified(context!, "b@example.com");
    const finalized = await finalizedWithSeries([
      { status: "completada", goal: null, result: { carga: 80, repeticiones: 10 } },
    ]);

    const { status } = await replaceSession(context!, cookieB, finalized.id, {
      revision: finalized.revision,
      datePerformed: "2025-03-08",
      exercises: finalized.exercises.map(echoExerciseInput),
    });
    expect(status).toBe(404);

    // la Sesión original queda intacta para su dueña
    const own = (await getSession(context!, cookie, finalized.id)).body as { session: SessionDocument };
    expect(own.session.datePerformed).toBe(finalized.datePerformed);
  });
});

describe("Historial: listar Sesiones finalizadas", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  async function setPerformedDate(session: SessionDocument, date: string): Promise<SessionDocument> {
    const { status, body } = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      datePerformed: date,
      exercises: session.exercises.map(echoExerciseInput),
    });
    expect(status).toBe(200);
    return (body as { session: SessionDocument }).session;
  }

  async function finalizedFromRoutine(): Promise<SessionDocument> {
    const press = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] }],
    });
    const started = await startSessionRequest(context!, cookie, {
      origin: "rutina",
      routineId: routine.id,
    });
    expect(started.status).toBe(201);
    let session = (started.body as { session: SessionDocument }).session;
    const occurrence = session.exercises[0]!;
    const completed = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [
            { id: occurrence.series[0]!.id, status: "completada", goal: { carga: 60, repeticiones: 10 }, result: { carga: 62.5, repeticiones: 10 }, rpe: 8 },
          ],
        },
      ],
    });
    expect(completed.status).toBe(200);
    session = (completed.body as { session: SessionDocument }).session;
    const finalized = await finalizeSessionRequest(context!, cookie, session.id, session.revision);
    expect(finalized.status).toBe(200);
    return (finalized.body as { session: SessionDocument }).session;
  }

  test("lista solo Sesiones finalizadas, de más reciente a más antigua, y permite abrir su detalle", async () => {
    const a = await setPerformedDate(await finalizedFreeSession(context!, cookie), "2025-03-01");
    const b = await setPerformedDate(await finalizedFreeSession(context!, cookie), "2025-03-10");
    const c = await setPerformedDate(await finalizedFreeSession(context!, cookie), "2025-03-20");
    const active = await startFreeSession(context!, cookie);
    expect(active.status).toBe(201);
    const activeId = (active.body as { session: SessionDocument }).session.id;

    const { status, body } = await listSessions(context!, cookie);
    expect(status).toBe(200);
    const page = body as { items: SessionHistoryItem[]; nextCursor: string | null };
    expect(page.items.map((item) => item.id)).toEqual([c.id, b.id, a.id]);
    expect(page.items.some((item) => item.id === activeId)).toBe(false);
    expect(page.nextCursor).toBeNull();

    const first = page.items[0]!;
    expect(first.origin).toBe("libre");
    expect(first.datePerformed).toBe("2025-03-20");
    expect(first.plannedDate).toBeNull();
    expect(first.exerciseCount).toBe(1);
    expect(first.completedSeries).toBe(1);
    expect(first.omittedSeries).toBe(1);

    // el detalle conserva objetivos, resultados, RPE y procedencia de Series
    const detail = (await getSession(context!, cookie, first.id)).body as { session: SessionDocument };
    expect(detail.session.status).toBe("finalizada");
    expect(detail.session.datePerformed).toBe("2025-03-20");
    expect(detail.session.exercises[0]!.series[0]!.result).toEqual({ carga: 80, repeticiones: 10, duracion: null });
    expect(detail.session.exercises[0]!.series[0]!.rpe).toBe(8);
    expect(detail.session.exercises[0]!.series[1]!.status).toBe("omitida");
    expect(detail.session.exercises[0]!.series[1]!.goal).toEqual({ carga: null, repeticiones: null, duracion: null });
  });

  test("aplica un límite y pagina con el cursor opaco sin repetir ni perder Sesiones", async () => {
    const one = await setPerformedDate(await finalizedFreeSession(context!, cookie), "2025-03-01");
    const two = await setPerformedDate(await finalizedFreeSession(context!, cookie), "2025-03-10");
    const three = await setPerformedDate(await finalizedFreeSession(context!, cookie), "2025-03-20");

    const first = await listSessions(context!, cookie, { limit: 2 });
    expect(first.status).toBe(200);
    const page1 = first.body as { items: SessionHistoryItem[]; nextCursor: string | null };
    expect(page1.items.map((item) => item.id)).toEqual([three.id, two.id]);
    expect(page1.nextCursor).toBeTruthy();

    const second = await listSessions(context!, cookie, { limit: 2, cursor: page1.nextCursor! });
    expect(second.status).toBe(200);
    const page2 = second.body as { items: SessionHistoryItem[]; nextCursor: string | null };
    expect(page2.items.map((item) => item.id)).toEqual([one.id]);
    expect(page2.nextCursor).toBeNull();
  });

  test("filtra por origen de Sesión", async () => {
    const libre = await setPerformedDate(await finalizedFreeSession(context!, cookie), "2025-03-10");
    const rutina = await finalizedFromRoutine();
    expect(rutina.origin).toBe("rutina");

    const libreOnly = await listSessions(context!, cookie, { origin: "libre" });
    expect(libreOnly.status).toBe(200);
    expect((libreOnly.body as { items: SessionHistoryItem[] }).items.map((item) => item.id)).toEqual([libre.id]);

    const rutinaOnly = await listSessions(context!, cookie, { origin: "rutina" });
    expect(rutinaOnly.status).toBe(200);
    expect((rutinaOnly.body as { items: SessionHistoryItem[] }).items.map((item) => item.id)).toEqual([rutina.id]);
  });

  test("filtra por rango de Fecha realizada", async () => {
    const a = await setPerformedDate(await finalizedFreeSession(context!, cookie), "2025-03-01");
    const b = await setPerformedDate(await finalizedFreeSession(context!, cookie), "2025-03-10");
    const c = await setPerformedDate(await finalizedFreeSession(context!, cookie), "2025-03-20");

    const range = await listSessions(context!, cookie, { from: "2025-03-05", to: "2025-03-15" });
    expect(range.status).toBe(200);
    const page = range.body as { items: SessionHistoryItem[] };
    expect(page.items.map((item) => item.id)).toEqual([b.id]);

    const fromOnly = await listSessions(context!, cookie, { from: "2025-03-10" });
    expect((fromOnly.body as { items: SessionHistoryItem[] }).items.map((item) => item.id)).toEqual([c.id, b.id]);

    const toOnly = await listSessions(context!, cookie, { to: "2025-03-01" });
    expect((toOnly.body as { items: SessionHistoryItem[] }).items.map((item) => item.id)).toEqual([a.id]);
  });

  test("un Historial vacío devuelve items vacíos sin cursor", async () => {
    const { status, body } = await listSessions(context!, cookie);
    expect(status).toBe(200);
    expect(body).toEqual({ items: [], nextCursor: null });
  });

  test("un cursor manipulado, un límite superior a 50 y filtros inválidos responden 400", async () => {
    await finalizedFreeSession(context!, cookie);

    const badLimit = await listSessions(context!, cookie, { limit: 51 });
    expect(badLimit.status).toBe(400);

    const badDate = await listSessions(context!, cookie, { from: "2025-02-30" });
    expect(badDate.status).toBe(400);

    const badOrigin = await listSessions(context!, cookie, { origin: "otra-cosa" });
    expect(badOrigin.status).toBe(400);

    const tampered = await listSessions(context!, cookie, { cursor: "cursor-manipulado" });
    expect(tampered.status).toBe(400);
  });

  test("el Historial de otra Cuenta se comporta como inexistente", async () => {
    const cookieB = await registerVerified(context!, "b@example.com");
    const mine = await setPerformedDate(await finalizedFreeSession(context!, cookie), "2025-03-10");

    const exerciseB = await createCustomExercise(context!, cookieB, { recordingMode: "repeticiones_sin_carga" });
    const sessionB = await sessionWithExercise(context!, cookieB, exerciseB, [
      { status: "completada", goal: null, result: { repeticiones: 12 } },
    ]);
    const finalizedB = await finalizeSessionRequest(context!, cookieB, sessionB.id, sessionB.revision);
    expect(finalizedB.status).toBe(200);

    const mineList = await listSessions(context!, cookie);
    expect((mineList.body as { items: SessionHistoryItem[] }).items.map((item) => item.id)).toEqual([mine.id]);

    const bList = await listSessions(context!, cookieB);
    const theirs = (finalizedB.body as { session: SessionDocument }).session;
    expect((bList.body as { items: SessionHistoryItem[] }).items.map((item) => item.id)).toEqual([theirs.id]);
    expect((bList.body as { items: SessionHistoryItem[] }).items.some((item) => item.id === mine.id)).toBe(false);
  });
});

describe("eliminar una Sesión finalizada", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  async function finalizedFromActivePlan(): Promise<{
    plan: PlanDocument;
    training: PlanTrainingDocument;
    session: SessionDocument;
  }> {
    const press = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] }],
    });
    const plan = await createPlan(context!, cookie, {
      name: "Ciclo base",
      weeks: [{ trainings: [{ day: 0, source: "rutina", routineId: routine.id }] }],
    });
    const activated = await activatePlan(context!, cookie, plan.id, plan.revision, "2025-03-03");
    const training = activated.weeks[0]!.trainings[0]!;
    const started = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: activated.id,
      trainingId: training.id,
    });
    expect(started.status).toBe(201);
    let session = (started.body as { session: SessionDocument }).session;
    const occurrence = session.exercises[0]!;
    const completed = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [
            { id: occurrence.series[0]!.id, status: "completada", goal: { carga: 60, repeticiones: 10 }, result: { carga: 62.5, repeticiones: 10 }, rpe: 8 },
          ],
        },
      ],
    });
    expect(completed.status).toBe(200);
    session = (completed.body as { session: SessionDocument }).session;
    const finalized = await finalizeSessionRequest(context!, cookie, session.id, session.revision);
    expect(finalized.status).toBe(200);
    return {
      plan: activated,
      training,
      session: (finalized.body as { session: SessionDocument }).session,
    };
  }

  test("eliminar una Sesión finalizada de un Plan activo devuelve el Entrenamiento a pendiente y permite iniciar otra", async () => {
    const { plan, training, session } = await finalizedFromActivePlan();
    const before = (await getPlan(context!, cookie, plan.id)).body as { plan: PlanDocument };
    expect(before.plan.weeks[0]!.trainings[0]!.status).toBe("realizado");

    const { status, body } = await deleteSessionRequest(context!, cookie, session.id, session.revision);
    expect(status).toBe(200);
    expect(body).toEqual({ deleted: true });

    const after = (await getPlan(context!, cookie, plan.id)).body as { plan: PlanDocument };
    expect(after.plan.status).toBe("activo");
    expect(after.plan.weeks[0]!.trainings[0]!.status).toBe("pendiente");
    expect(after.plan.weeks[0]!.trainings[0]!.plannedDate).toBe(training.plannedDate);

    // el día vuelve a poder iniciar una Sesión nueva
    const again = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: plan.id,
      trainingId: training.id,
    });
    expect(again.status).toBe(201);

    // el registro eliminado ya no está en el Historial ni se puede leer
    const gone = await getSession(context!, cookie, session.id);
    expect(gone.status).toBe(404);
    const history = await listSessions(context!, cookie);
    expect((history.body as { items: SessionHistoryItem[] }).items.some((item) => item.id === session.id)).toBe(false);
  });

  test("eliminar una Sesión finalizada de un Plan completado conserva el estado del Plan y no permite iniciar otra desde el día", async () => {
    const { plan, training, session } = await finalizedFromActivePlan();

    const completed = await completePlanRequest(context!, cookie, plan.id, plan.revision);
    expect(completed.status).toBe(200);
    const before = (await getPlan(context!, cookie, plan.id)).body as { plan: PlanDocument };
    expect(before.plan.status).toBe("completado");
    expect(before.plan.weeks[0]!.trainings[0]!.status).toBe("realizado");

    const { status } = await deleteSessionRequest(context!, cookie, session.id, session.revision);
    expect(status).toBe(200);

    const after = (await getPlan(context!, cookie, plan.id)).body as { plan: PlanDocument };
    expect(after.plan.status).toBe("completado");
    expect(after.plan.weeks[0]!.trainings[0]!.status).toBe("pendiente");

    // un Plan completado no se reactiva: el día no origina otra Sesión
    const restart = await startSessionRequest(context!, cookie, {
      origin: "plan",
      planId: plan.id,
      trainingId: training.id,
    });
    expect(restart.status).toBe(409);
    expect((restart.body as { error: { code: string } }).error.code).toBe("TRANSITION_IMPOSSIBLE");
  });

  test("eliminar Sesiones finalizadas libres o iniciadas desde una Rutina no altera ningún Plan", async () => {
    const press = await catalogExerciseId(context!, cookie);
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] }],
    });
    const plan = await createPlan(context!, cookie, {
      name: "Ciclo base",
      weeks: [{ trainings: [{ day: 0, source: "rutina", routineId: routine.id }] }],
    });
    const activated = await activatePlan(context!, cookie, plan.id, plan.revision, "2025-03-03");
    const trainingId = activated.weeks[0]!.trainings[0]!.id;

    // Sesión libre finalizada
    const free = await finalizedFreeSession(context!, cookie);
    // Sesión iniciada desde la Rutina y finalizada
    const fromRoutine = await startSessionRequest(context!, cookie, { origin: "rutina", routineId: routine.id });
    expect(fromRoutine.status).toBe(201);
    let routineSession = (fromRoutine.body as { session: SessionDocument }).session;
    const occurrence = routineSession.exercises[0]!;
    const completed = await replaceSession(context!, cookie, routineSession.id, {
      revision: routineSession.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [
            { id: occurrence.series[0]!.id, status: "completada", goal: { carga: 60, repeticiones: 10 }, result: { carga: 62.5, repeticiones: 10 } },
          ],
        },
      ],
    });
    expect(completed.status).toBe(200);
    routineSession = (completed.body as { session: SessionDocument }).session;
    const routineFinalized = await finalizeSessionRequest(context!, cookie, routineSession.id, routineSession.revision);
    expect(routineFinalized.status).toBe(200);
    const routineAfter = (routineFinalized.body as { session: SessionDocument }).session;

    const freeDeleted = await deleteSessionRequest(context!, cookie, free.id, free.revision);
    expect(freeDeleted.status).toBe(200);
    const routineDeleted = await deleteSessionRequest(context!, cookie, routineAfter.id, routineAfter.revision);
    expect(routineDeleted.status).toBe(200);

    // el Plan activo queda intacto: su Entrenamiento sigue pendiente
    const after = (await getPlan(context!, cookie, plan.id)).body as { plan: PlanDocument };
    expect(after.plan.status).toBe("activo");
    expect(after.plan.weeks[0]!.trainings[0]!.status).toBe("pendiente");
    expect(after.plan.weeks[0]!.trainings[0]!.id).toBe(trainingId);
  });

  test("una revisión obsoleta responde 409 y conserva la Sesión finalizada", async () => {
    const { session } = await finalizedFromActivePlan();

    const stale = await deleteSessionRequest(context!, cookie, session.id, session.revision - 1);
    expect(stale.status).toBe(409);
    const conflict = (stale.body as { error: { code: string; session?: SessionDocument } }).error;
    expect(conflict.code).toBe("REVISION_CONFLICT");
    // el conflicto carga la versión vigente sin eliminar ni mezclar cambios
    expect(conflict.session?.id).toBe(session.id);
    expect(conflict.session?.status).toBe("finalizada");
    expect(conflict.session?.revision).toBe(session.revision);

    const current = (await getSession(context!, cookie, session.id)).body as { session: SessionDocument };
    expect(current.session.status).toBe("finalizada");
    expect(current.session.revision).toBe(session.revision);

    // con la revisión vigente elimina
    const ok = await deleteSessionRequest(context!, cookie, session.id, session.revision);
    expect(ok.status).toBe(200);
  });

  test("eliminar una Sesión finalizada ajena se comporta como inexistente", async () => {
    const cookieB = await registerVerified(context!, "b@example.com");
    const { session } = await finalizedFromActivePlan();

    const { status } = await deleteSessionRequest(context!, cookieB, session.id, session.revision);
    expect(status).toBe(404);

    // la Sesión de la dueña sigue en el Historial
    const own = (await getSession(context!, cookie, session.id)).body as { session: SessionDocument };
    expect(own.session.id).toBe(session.id);
  });
});
