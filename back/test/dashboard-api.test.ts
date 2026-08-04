import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import type { DashboardResponse } from "../src/dashboard/dashboard-router";
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

type ExerciseDocument = {
  id: string;
  name: string;
  recordingMode: string;
  provenance: "catalogo" | "personalizado";
};

async function createExercise(
  context: TestContext,
  cookie: string,
  overrides: Record<string, unknown> = {},
): Promise<ExerciseDocument> {
  const response = await context.app.request("/api/exercises", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({
      name: "Peso muerto rumano",
      instructions:
        "Baja la barra hasta la mitad de la espinilla manteniendo la espalda recta.",
      recordingMode: "fuerza_con_carga",
      category: "Pierna",
      bodyPart: "Isquiotibiales",
      equipment: "Barra",
      ...overrides,
    }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { exercise: ExerciseDocument }).exercise;
}

type SeriesDocument = {
  id: string;
  order: number;
  status: "pendiente" | "completada" | "omitida";
  added: boolean;
  goal: { carga: number | null; repeticiones: number | null; duracion: number | null };
  result: { carga: number | null; repeticiones: number | null; duracion: number | null };
  rpe: number | null;
};

type SessionExerciseDocument = {
  id: string;
  exerciseId: string;
  sortOrder: number;
  added: boolean;
  series: SeriesDocument[];
};

type SessionDocument = {
  id: string;
  revision: number;
  origin: "libre" | "rutina" | "plan";
  status: "activa" | "finalizada";
  datePerformed: string;
  plannedDate: string | null;
  exercises: SessionExerciseDocument[];
};

type SeriesInput = {
  id?: string;
  status: "pendiente" | "completada" | "omitida";
  goal?: { carga?: number | null; repeticiones?: number | null; duracion?: number | null } | null;
  result?: { carga?: number | null; repeticiones?: number | null; duracion?: number | null } | null;
  rpe?: number | null;
};

/** Series de un Entrenamiento específico: solo magnitudes previstas. */
type PlanSeriesInput = {
  id?: string;
  carga?: number | null;
  repeticiones?: number | null;
  duracion?: number | null;
};

async function startFreeSession(
  context: TestContext,
  cookie: string,
): Promise<SessionDocument> {
  const response = await context.app.request("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({ origin: "libre" }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { session: SessionDocument }).session;
}

async function replaceSession(
  context: TestContext,
  cookie: string,
  session: SessionDocument,
  body: { revision: number; datePerformed?: string; exercises: unknown[] },
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(`/api/sessions/${session.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function finalizeSession(
  context: TestContext,
  cookie: string,
  session: SessionDocument,
): Promise<SessionDocument> {
  const response = await context.app.request(`/api/sessions/${session.id}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({ revision: session.revision }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { session: SessionDocument }).session;
}

/** Entrada canónica de la Sesión para las sustituciones (PUT). */
function echoSession(session: SessionDocument): {
  revision: number;
  exercises: unknown[];
} {
  return {
    revision: session.revision,
    exercises: session.exercises.map((entry) => ({
      id: entry.id,
      exerciseId: entry.exerciseId,
      series: entry.series.map((series) => ({
        id: series.id,
        status: series.status,
        goal: series.goal,
        result: series.result,
        rpe: series.rpe,
      })),
    })),
  };
}

/** Corrige la Fecha realizada de una Sesión finalizada (ticket 29). */
async function setPerformedDate(
  context: TestContext,
  cookie: string,
  session: SessionDocument,
  date: string,
): Promise<SessionDocument> {
  const { status, body } = await replaceSession(context, cookie, session, {
    ...echoSession(session),
    datePerformed: date,
  });
  expect(status).toBe(200);
  return (body as { session: SessionDocument }).session;
}

/** Elimina una Sesión finalizada (ticket 29). */
async function deleteSession(
  context: TestContext,
  cookie: string,
  session: SessionDocument,
): Promise<void> {
  const response = await context.app.request(
    `/api/sessions/${session.id}?revision=${session.revision}`,
    { method: "DELETE", headers: { Cookie: cookie, Origin: origin } },
  );
  expect(response.status).toBe(200);
}

/**
 * Crea y finaliza una Sesión libre con un Ejercicio y sus Series; opcionalmente
 * corrige la Fecha realizada al valor indicado.
 */
async function finalizedSessionWithSeries(
  context: TestContext,
  cookie: string,
  exerciseId: string,
  series: SeriesInput[],
  datePerformed?: string,
): Promise<SessionDocument> {
  const session = await startFreeSession(context, cookie);
  const replaced = await replaceSession(context, cookie, session, {
    revision: session.revision,
    exercises: [{ exerciseId, series }],
  });
  expect(replaced.status).toBe(200);
  const withSeries = (replaced.body as { session: SessionDocument }).session;
  const finalized = await finalizeSession(context, cookie, withSeries);
  return datePerformed === undefined
    ? finalized
    : setPerformedDate(context, cookie, finalized, datePerformed);
}

async function createRecordedMax(
  context: TestContext,
  cookie: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await context.app.request("/api/rms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { rm: Record<string, unknown> }).rm;
}

type RoutineDocument = { id: string; name: string; revision: number };

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

export type PlanTrainingDocument = {
  id: string;
  day: number;
  plannedDate: string | null;
  status: "pendiente" | "omitido" | "realizado" | null;
  source: "rutina" | "especifico";
  routineId: string | null;
  routine: { id: string; name: string; archived: boolean } | null;
  content: unknown[];
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
};

type TrainingInput = {
  day: number;
  source: "rutina" | "especifico";
  routineId?: string | null;
  specific?: { exerciseId: string; series: PlanSeriesInput[] }[];
};

function planPayload(weeks: { trainings: TrainingInput[] }[]): Record<string, unknown> {
  return {
    name: "Ciclo base",
    weeks: weeks.map((week) => ({
      trainings: week.trainings.map((training) => ({
        ...training,
        specific: training.specific ?? [],
      })),
    })),
  };
}

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

async function startSessionFromPlan(
  context: TestContext,
  cookie: string,
  planId: string,
  trainingId: string,
): Promise<SessionDocument> {
  const response = await context.app.request("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({ origin: "plan", planId, trainingId }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { session: SessionDocument }).session;
}

async function getActiveSession(
  context: TestContext,
  cookie: string,
): Promise<SessionDocument> {
  const response = await context.app.request("/api/sessions/active", {
    headers: { Cookie: cookie, Origin: origin },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { session: SessionDocument | null };
  expect(body.session).toBeDefined();
  return body.session!;
}

async function replaceActiveSession(
  context: TestContext,
  cookie: string,
  session: SessionDocument,
  body: { revision: number; exercises: unknown[] },
): Promise<SessionDocument> {
  const response = await context.app.request(`/api/sessions/${session.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { session: SessionDocument }).session;
}

async function getDashboard(
  context: TestContext,
  cookie: string,
  query = "",
): Promise<Response> {
  return context.app.request(`/api/dashboard${query}`, {
    headers: { Cookie: cookie, Origin: origin },
  });
}

async function dashboardOf(
  context: TestContext,
  cookie: string,
  query = "",
): Promise<DashboardResponse> {
  const response = await getDashboard(context, cookie, query);
  expect(response.status).toBe(200);
  return (await response.json()) as DashboardResponse;
}

/**
 * Escenario completo del dashboard sobre la semana actual (lunes 2025-03-10):
 * un Plan activo de dos semanas, Sesiones finalizadas de fuerza y otras
 * Formas de registro, un RM registrado y una Sesión activa opcional. Devuelve
 * los identificadores y documentos necesarios para aseverar la composición.
 */
async function fullFixture(
  context: TestContext,
  cookie: string,
): Promise<{
  sentadilla: string;
  dominada: string;
  cinta: string;
  plan: PlanDocument;
  trainingIds: string[];
  sessions: SessionDocument[];
}> {
  const sentadilla = (
    await createExercise(context, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })
  ).id;
  const dominada = (
    await createExercise(context, cookie, { name: "Dominada", recordingMode: "repeticiones_sin_carga" })
  ).id;
  const cinta = (
    await createExercise(context, cookie, { name: "Cinta", recordingMode: "cardio_continuo" })
  ).id;

  const routine = await createRoutine(context, cookie, {
    name: "Día de empuje",
    exercises: [{ exerciseId: sentadilla, series: [{ carga: 60, repeticiones: 10 }] }],
  });
  const draft = await createPlan(
    context,
    cookie,
    planPayload([
      {
        trainings: [
          { day: 0, source: "rutina", routineId: routine.id },
          { day: 3, source: "especifico", specific: [{ exerciseId: dominada, series: [{ repeticiones: 8 }] }] },
        ],
      },
      {
        trainings: [
          { day: 1, source: "rutina", routineId: routine.id },
          { day: 4, source: "especifico", specific: [{ exerciseId: dominada, series: [{ repeticiones: 8 }] }] },
        ],
      },
    ]),
  );
  const plan = await activatePlan(context, cookie, draft.id, draft.revision, "2025-03-10");
  const trainingIds = plan.weeks
    .flatMap((week) => week.trainings)
    .sort((a, b) => (a.plannedDate ?? "").localeCompare(b.plannedDate ?? ""))
    .map((training) => training.id);

  const sessions: SessionDocument[] = [];
  sessions.push(
    await finalizedSessionWithSeries(context, cookie, sentadilla, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12"),
  );
  sessions.push(
    await finalizedSessionWithSeries(context, cookie, sentadilla, [
      { status: "completada", goal: null, result: { carga: 50, repeticiones: 10 }, rpe: null },
    ], "2025-03-05"),
  );
  sessions.push(
    await finalizedSessionWithSeries(context, cookie, dominada, [
      { status: "completada", goal: null, result: { repeticiones: 20 }, rpe: null },
    ], "2025-03-05"),
  );
  sessions.push(
    await finalizedSessionWithSeries(context, cookie, cinta, [
      { status: "completada", goal: null, result: { duracion: 1800 }, rpe: null },
    ], "2025-03-11"),
  );

  return { sentadilla, dominada, cinta, plan, trainingIds, sessions };
}

describe("autenticación y verificación de la ruta", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("sin sesión la ruta responde 401 UNAUTHORIZED", async () => {
    const response = await getDashboard(context!, "");
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("una Cuenta sin verificar no alcanza la ruta", async () => {
    const registered = await context!.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ name: "Deportista", email: "pendiente@example.com", password: "contraseña-segura" }),
    });
    expect(registered.status).toBe(200);

    // Better Auth exige la verificación del correo antes de emitir una sesión.
    const denied = await context!.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email: "pendiente@example.com", password: "contraseña-segura" }),
    });
    expect(denied.status).toBe(403);
    const deniedBody = (await denied.json()) as { error?: { code?: string } };
    expect(deniedBody.error?.code).toBe("EMAIL_NOT_VERIFIED");

    // Sin sesión la ruta queda fuera del alcance de la Cuenta pendiente.
    const dashboard = await getDashboard(context!, "");
    expect(dashboard.status).toBe(401);
  });
});

describe("composición completa y forma estable", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("una sola lectura compone los cinco bloques con la forma estable", async () => {
    const fixture = await fullFixture(context!, cookie);
    const { sentadilla, dominada, cinta, plan, trainingIds, sessions } = fixture;
    const sentadillaRecent = sessions[0]!;
    const sentadillaPrev = sessions[1]!;
    const dominadaSession = sessions[2]!;
    const cintaSession = sessions[3]!;

    await createRecordedMax(context!, cookie, {
      exerciseId: sentadilla,
      load: 120,
      repetitions: 1,
      date: "2025-03-01",
    });

    const body = await dashboardOf(context!, cookie);

    expect(body).toEqual({
      training: {
        kind: "iniciar-plan",
        planId: plan.id,
        trainingId: trainingIds[0]!,
        planName: "Ciclo base",
        name: "Día de empuje",
        plannedDate: "2025-03-10",
        day: 0,
      },
      activePlan: {
        id: plan.id,
        name: "Ciclo base",
        startDate: "2025-03-10",
        currentWeek: 1,
        weeks: [
          {
            order: 0,
            progress: {
              realizados: 0,
              omitidos: 0,
              pendientes: 2,
              total: 2,
              avance: 0,
              cumplimiento: 0,
              avanceRedondeado: 0,
              cumplimientoRedondeado: 0,
            },
          },
          {
            order: 1,
            progress: {
              realizados: 0,
              omitidos: 0,
              pendientes: 2,
              total: 2,
              avance: 0,
              cumplimiento: 0,
              avanceRedondeado: 0,
              cumplimientoRedondeado: 0,
            },
          },
        ],
        progress: {
          realizados: 0,
          omitidos: 0,
          pendientes: 4,
          total: 4,
          avance: 0,
          cumplimiento: 0,
          avanceRedondeado: 0,
          cumplimientoRedondeado: 0,
        },
      },
      weeklyVolume: {
        currentWeekStart: "2025-03-10",
        currentTotal: 1000,
        previousTotal: 500,
        changePercent: 100,
        weeks: [
          { weekStart: "2025-02-03", total: 0 },
          { weekStart: "2025-02-10", total: 0 },
          { weekStart: "2025-02-17", total: 0 },
          { weekStart: "2025-02-24", total: 0 },
          { weekStart: "2025-03-03", total: 500 },
          { weekStart: "2025-03-10", total: 1000 },
        ],
      },
      recentRecordedMaxes: [
        {
          id: expect.any(String),
          exerciseId: sentadilla,
          exerciseName: "Sentadilla",
          load: 120,
          repetitions: 1,
          date: "2025-03-01",
        },
      ],
      evolution: {
        options: [
          { id: sentadilla, name: "Sentadilla", recordingMode: "fuerza_con_carga", metric: "carga_maxima" },
          { id: cinta, name: "Cinta", recordingMode: "cardio_continuo", metric: null },
          { id: dominada, name: "Dominada", recordingMode: "repeticiones_sin_carga", metric: "repeticiones_totales" },
        ],
        current: {
          exerciseId: sentadilla,
          name: "Sentadilla",
          recordingMode: "fuerza_con_carga",
          metric: "carga_maxima",
          points: [
            {
              sessionId: sentadillaPrev.id,
              date: "2025-03-05",
              value: 50,
              rpeMedio: null,
              intensidadRelativaMax: 41.7,
            },
            {
              sessionId: sentadillaRecent.id,
              date: "2025-03-12",
              value: 100,
              rpeMedio: null,
              intensidadRelativaMax: 83.3,
            },
          ],
        },
      },
    });
    expect(dominadaSession.id).toBeDefined();
    expect(cintaSession.id).toBeDefined();
  });

  test("una Sesión activa tiene prioridad sobre los Entrenamientos pendientes", async () => {
    const fixture = await fullFixture(context!, cookie);
    const session = await startSessionFromPlan(
      context!,
      cookie,
      fixture.plan.id,
      fixture.trainingIds[0]!,
    );

    const body = await dashboardOf(context!, cookie);
    expect(body.training).toEqual({
      kind: "continuar",
      sessionId: session.id,
      name: "Día de empuje",
      progress: { completadas: 0, total: 1 },
    });

    // Al completar la primera Serie, el progreso de la Sesión activa avanza.
    const active = await getActiveSession(context!, cookie);
    const occurrence = active.exercises[0]!;
    const series = occurrence.series[0]!;
    await replaceActiveSession(context!, cookie, active, {
      revision: active.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [
            {
              id: series.id,
              status: "completada",
              goal: series.goal,
              result: series.goal,
              rpe: null,
            },
          ],
        },
      ],
    });

    const updated = await dashboardOf(context!, cookie);
    expect(updated.training).toMatchObject({
      kind: "continuar",
      sessionId: session.id,
      progress: { completadas: 1, total: 1 },
    });
  });
});

describe("estados vacíos y ausencia explícita", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("sin Plan, sin Sesiones ni analítica el bloque expresa ausencia explícita", async () => {
    const body = await dashboardOf(context!, cookie);

    expect(body).toEqual({
      training: { kind: "iniciar-libre" },
      activePlan: null,
      weeklyVolume: {
        currentWeekStart: "2025-03-10",
        currentTotal: 0,
        previousTotal: 0,
        changePercent: null,
        weeks: [
          { weekStart: "2025-02-03", total: 0 },
          { weekStart: "2025-02-10", total: 0 },
          { weekStart: "2025-02-17", total: 0 },
          { weekStart: "2025-02-24", total: 0 },
          { weekStart: "2025-03-03", total: 0 },
          { weekStart: "2025-03-10", total: 0 },
        ],
      },
      recentRecordedMaxes: [],
      evolution: { options: [], current: null },
    });
  });

  test("una consulta con parámetros desconocidos se rechaza", async () => {
    const response = await getDashboard(context!, cookie, "?desconocido=1");
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("correcciones recientes", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("corregir la Fecha realizada mueve el volumen y el punto de evolución entre semanas", async () => {
    const fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    const session = await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");

    const before = await dashboardOf(context!, cookie);
    expect(before.weeklyVolume.currentTotal).toBe(1000);
    expect(before.weeklyVolume.previousTotal).toBe(0);
    expect(before.evolution.current?.points).toEqual([
      expect.objectContaining({ sessionId: session.id, date: "2025-03-12", value: 100 }),
    ]);

    const corrected = await setPerformedDate(context!, cookie, session, "2025-03-05");

    const after = await dashboardOf(context!, cookie);
    expect(after.weeklyVolume.currentTotal).toBe(0);
    expect(after.weeklyVolume.previousTotal).toBe(1000);
    expect(after.weeklyVolume.changePercent).toBe(-100);
    expect(after.evolution.current?.points).toEqual([
      expect.objectContaining({ sessionId: corrected.id, date: "2025-03-05", value: 100 }),
    ]);
  });

  test("corregir un resultado y eliminar la Sesión cambia la siguiente lectura", async () => {
    const fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    const session = await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");

    const echoed = echoSession(session);
    const series = (echoed.exercises[0] as { series: SeriesInput[] }).series;
    series[0] = {
      id: series[0]!.id,
      status: "completada",
      goal: null,
      result: { carga: 120, repeticiones: 5 },
      rpe: null,
    };
    const { status, body } = await replaceSession(context!, cookie, session, echoed);
    expect(status).toBe(200);
    const corrected = (body as { session: SessionDocument }).session;

    const correctedRead = await dashboardOf(context!, cookie);
    expect(correctedRead.weeklyVolume.currentTotal).toBe(600);
    expect(correctedRead.evolution.current?.points).toEqual([
      expect.objectContaining({ sessionId: corrected.id, value: 120 }),
    ]);

    await deleteSession(context!, cookie, corrected);

    const afterDelete = await dashboardOf(context!, cookie);
    expect(afterDelete.weeklyVolume.currentTotal).toBe(0);
    expect(afterDelete.weeklyVolume.previousTotal).toBe(0);
    expect(afterDelete.weeklyVolume.changePercent).toBeNull();
    // Sin Series completadas, el Ejercicio deja de ser una opción de evolución.
    expect(afterDelete.evolution.options).toEqual([]);
    expect(afterDelete.evolution.current).toBeNull();
  });
});

describe("aislamiento entre Cuentas", () => {
  let context: TestContext | undefined;
  let cookie: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    cookie = await registerVerified(context, "deportista@example.com");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("los datos de otra Cuenta se comportan como inexistentes", async () => {
    await fullFixture(context!, cookie);
    const otherCookie = await registerVerified(context!, "otra@example.com");

    const body = await dashboardOf(context!, otherCookie);
    expect(body.training).toEqual({ kind: "iniciar-libre" });
    expect(body.activePlan).toBeNull();
    expect(body.weeklyVolume.currentTotal).toBe(0);
    expect(body.recentRecordedMaxes).toEqual([]);
    expect(body.evolution.options).toEqual([]);
    expect(body.evolution.current).toBeNull();
  });
});

describe("selector de evolución", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let sentadillaId: string;
  let dominadaId: string;
  let cintaId: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    cookie = await registerVerified(context, "deportista@example.com");
    sentadillaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    dominadaId = (await createExercise(context!, cookie, { name: "Dominada", recordingMode: "repeticiones_sin_carga" })).id;
    cintaId = (await createExercise(context!, cookie, { name: "Cinta", recordingMode: "cardio_continuo" })).id;
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("sin ejercicio pedido se muestra el más reciente y con exerciseId el elegido", async () => {
    await finalizedSessionWithSeries(context!, cookie, sentadillaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");
    await finalizedSessionWithSeries(context!, cookie, dominadaId, [
      { status: "completada", goal: null, result: { repeticiones: 20 }, rpe: null },
    ], "2025-03-05");

    const defaultBody = await dashboardOf(context!, cookie);
    expect(defaultBody.evolution.options.map((option) => option.id)).toEqual([
      sentadillaId,
      dominadaId,
    ]);
    expect(defaultBody.evolution.current).toMatchObject({
      exerciseId: sentadillaId,
      name: "Sentadilla",
      metric: "carga_maxima",
    });

    const chosen = await dashboardOf(context!, cookie, `?exerciseId=${dominadaId}`);
    expect(chosen.evolution.current).toMatchObject({
      exerciseId: dominadaId,
      name: "Dominada",
      metric: "repeticiones_totales",
    });
    expect(chosen.evolution.current?.points).toEqual([
      expect.objectContaining({ date: "2025-03-05", value: 20 }),
    ]);
  });

  test("un Ejercicio ajeno o inexistente se comporta como ausente", async () => {
    await finalizedSessionWithSeries(context!, cookie, sentadillaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");

    const otherCookie = await registerVerified(context!, "otra@example.com");
    const otherExercise = (await createExercise(context!, otherCookie, { name: "Prensa", recordingMode: "fuerza_con_carga" })).id;

    const missing = await dashboardOf(context!, cookie, "?exerciseId=00000000000000000000000000000000");
    expect(missing.evolution.current).toBeNull();
    expect(missing.evolution.options.map((option) => option.id)).toEqual([sentadillaId]);

    const foreign = await dashboardOf(context!, cookie, `?exerciseId=${otherExercise}`);
    expect(foreign.evolution.current).toBeNull();
    expect(foreign.evolution.options.map((option) => option.id)).toEqual([sentadillaId]);
  });

  test("un Ejercicio propio sin Series completadas pedido por exerciseId es ausencia explícita", async () => {
    await finalizedSessionWithSeries(context!, cookie, sentadillaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");

    // El Ejercicio sin analítica no es opción del selector: pedirlo
    // expresamente no crea una gráfica vacía (spec «Inicio»).
    const requested = await dashboardOf(context!, cookie, `?exerciseId=${dominadaId}`);
    expect(requested.evolution.current).toBeNull();
    expect(requested.evolution.options.map((option) => option.id)).toEqual([sentadillaId]);

    // Sin exerciseId el bloque sigue mostrando la opción más reciente.
    const defaultBody = await dashboardOf(context!, cookie);
    expect(defaultBody.evolution.current).toMatchObject({ exerciseId: sentadillaId });
  });

  test("cardio continuo aparece como opción sin analítica", async () => {
    await finalizedSessionWithSeries(context!, cookie, cintaId, [
      { status: "completada", goal: null, result: { duracion: 1800 }, rpe: null },
    ], "2025-03-11");

    const body = await dashboardOf(context!, cookie, `?exerciseId=${cintaId}`);
    const option = body.evolution.options.find((entry) => entry.id === cintaId);
    expect(option).toEqual({ id: cintaId, name: "Cinta", recordingMode: "cardio_continuo", metric: null });
    expect(body.evolution.current).toMatchObject({
      exerciseId: cintaId,
      name: "Cinta",
      recordingMode: "cardio_continuo",
      metric: null,
    });
    expect(body.evolution.current?.points).toEqual([]);
  });
});
