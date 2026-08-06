import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { readHomeState, type HomeState } from "../src/dashboard/home-read";
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

async function accountIdOf(context: TestContext, cookie: string): Promise<string> {
  const response = await context.app.request("/api/auth/get-session", {
    headers: { Cookie: cookie, Origin: origin },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { session: unknown; user?: { id: string } };
  expect(body.user).toBeDefined();
  return body.user!.id;
}

async function loadRealCatalog(context: TestContext): Promise<void> {
  const assets = await readCatalogAssets();
  const result = await loadCatalog(context.connection.db, assets);
  expect(result.added).toBeGreaterThan(0);
}

async function exerciseOfMode(
  context: TestContext,
  cookie: string,
  recordingMode: string,
): Promise<string> {
  const response = await context.app.request(
    `/api/exercises?recordingMode=${recordingMode}&limit=1`,
    { headers: { Cookie: cookie, Origin: origin } },
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { items: { id: string; provenance: string }[] };
  const item = body.items.find((entry) => entry.provenance === "catalogo");
  expect(item).toBeDefined();
  return item!.id;
}

type RoutineDocument = {
  id: string;
  name: string;
  revision: number;
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

type SeriesInput = {
  id?: string;
  carga?: number | null;
  repeticiones?: number | null;
  duracion?: number | null;
};

type TrainingInput = {
  id?: string;
  day: number;
  source: "rutina" | "especifico";
  routineId?: string | null;
  specific?: {
    id?: string;
    exerciseId: string;
    series: SeriesInput[];
  }[];
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

async function omitTraining(
  context: TestContext,
  cookie: string,
  planId: string,
  trainingId: string,
  revision: number,
): Promise<number> {
  const response = await context.app.request(
    `/api/plans/${planId}/trainings/${trainingId}/omit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({ revision }),
    },
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { plan: PlanDocument }).plan.revision;
}

async function restoreTraining(
  context: TestContext,
  cookie: string,
  planId: string,
  trainingId: string,
  revision: number,
): Promise<number> {
  const response = await context.app.request(
    `/api/plans/${planId}/trainings/${trainingId}/restore`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({ revision }),
    },
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { plan: PlanDocument }).plan.revision;
}

export type SessionSeriesDocument = {
  id: string;
  order: number;
  status: "pendiente" | "completada" | "omitida";
  added: boolean;
  goal: { carga: number | null; repeticiones: number | null; duracion: number | null };
  result: { carga: number | null; repeticiones: number | null; duracion: number | null };
  rpe: number | null;
};

export type SessionDocument = {
  id: string;
  revision: number;
  origin: "libre" | "rutina" | "plan";
  status: "activa" | "finalizada";
  datePerformed: string;
  plannedDate: string | null;
  routineId: string | null;
  planTrainingId: string | null;
  lastExerciseId: string | null;
  exercises: {
    id: string;
    exerciseId: string;
    sortOrder: number;
    added: boolean;
    exercise: { id: string; name: string; recordingMode: string; provenance: "catalogo" | "personalizado" };
    series: SessionSeriesDocument[];
  }[];
  startedAt: string;
  updatedAt: string;
};

async function startSessionRequest(
  context: TestContext,
  cookie: string,
  body: Record<string, unknown>,
): Promise<SessionDocument> {
  const response = await context.app.request("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { session: SessionDocument }).session;
}

async function startFreeSession(
  context: TestContext,
  cookie: string,
): Promise<SessionDocument> {
  return startSessionRequest(context, cookie, { origin: "libre" });
}

async function startSessionFromRoutine(
  context: TestContext,
  cookie: string,
  routineId: string,
): Promise<SessionDocument> {
  return startSessionRequest(context, cookie, { origin: "rutina", routineId });
}

async function startSessionFromPlan(
  context: TestContext,
  cookie: string,
  planId: string,
  trainingId: string,
): Promise<SessionDocument> {
  return startSessionRequest(context, cookie, { origin: "plan", planId, trainingId });
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

async function replaceSession(
  context: TestContext,
  cookie: string,
  id: string,
  body: {
    revision: number;
    exercises: {
      id?: string;
      exerciseId: string;
      series: unknown[];
    }[];
  },
): Promise<SessionDocument> {
  const response = await context.app.request(`/api/sessions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { session: SessionDocument }).session;
}

/**
 * Completa la primera Serie pendiente de la Sesión activa copiando sus
 * Objetivos como Resultado (Forma de registro de fuerza con carga del
 * fixture): la Sesión queda lista para finalizarse.
 */
async function completeFirstSeries(
  context: TestContext,
  cookie: string,
  session: SessionDocument,
): Promise<SessionDocument> {
  const current = await getActiveSession(context, cookie);
  const occurrence = current.exercises[0]!;
  const series = occurrence.series[0]!;
  return replaceSession(context, cookie, current.id, {
    revision: current.revision,
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
}

async function finalizeSession(
  context: TestContext,
  cookie: string,
  id: string,
  revision: number,
): Promise<SessionDocument> {
  const response = await context.app.request(`/api/sessions/${id}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({ revision }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { session: SessionDocument }).session;
}

async function deleteSession(
  context: TestContext,
  cookie: string,
  id: string,
  revision: number,
): Promise<void> {
  const response = await context.app.request(`/api/sessions/${id}?revision=${revision}`, {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: origin },
  });
  expect(response.status).toBe(200);
}

/**
 * Plan activo de dos semanas sobre el lunes 2025-03-10: la semana 1 tiene un
 * Entrenamiento con Rutina («Día de empuje», lunes) y un Entrenamiento
 * específico (jueves); la semana 2 repite el patrón los días 1 y 4. Devuelve
 * también los identificadores de sus Entrenamientos ordenados por Fecha
 * prevista.
 */
async function activePlanFixture(
  context: TestContext,
  cookie: string,
  startDate = "2025-03-10",
): Promise<{
  plan: PlanDocument;
  press: string;
  dominada: string;
  trainingIds: string[];
}> {
  const press = await exerciseOfMode(context, cookie, "fuerza_con_carga");
  const dominada = await exerciseOfMode(context, cookie, "repeticiones_sin_carga");
  const routine = await createRoutine(context, cookie, {
    name: "Día de empuje",
    exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] }],
  });
  const draft = await createPlan(
    context,
    cookie,
    planPayload([
      {
        trainings: [
          { day: 0, source: "rutina", routineId: routine.id },
          {
            day: 3,
            source: "especifico",
            specific: [{ exerciseId: dominada, series: [{ repeticiones: 8 }] }],
          },
        ],
      },
      {
        trainings: [
          { day: 1, source: "rutina", routineId: routine.id },
          {
            day: 4,
            source: "especifico",
            specific: [{ exerciseId: dominada, series: [{ repeticiones: 8 }] }],
          },
        ],
      },
    ]),
  );
  const plan = await activatePlan(context, cookie, draft.id, draft.revision, startDate);
  const trainingIds = plan.weeks
    .flatMap((week) => week.trainings)
    .sort((a, b) => (a.plannedDate ?? "").localeCompare(b.plannedDate ?? ""))
    .map((training) => training.id);
  return { plan, press, dominada, trainingIds };
}

function readState(
  context: TestContext,
  accountId: string,
  today = "2025-03-10",
): Promise<HomeState> {
  return readHomeState(context.connection.db, { accountId, today });
}

describe("acción prioritaria de Inicio", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let accountId: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
    accountId = await accountIdOf(context, cookie);
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("sin Sesión activa ni Plan activo propone iniciar una Sesión libre", async () => {
    const state = await readState(context!, accountId);
    expect(state.action).toEqual({ kind: "iniciar-libre" });
    expect(state.activePlan).toBeNull();
  });

  test("una Sesión activa libre se continúa con prioridad sobre los Entrenamientos pendientes", async () => {
    const { plan } = await activePlanFixture(context!, cookie);
    expect(plan.weeks.flatMap((week) => week.trainings).length).toBe(4);
    const session = await startFreeSession(context!, cookie);

    const state = await readState(context!, accountId);
    expect(state.action).toEqual({
      kind: "continuar",
      sessionId: session.id,
      name: "Sesión libre",
      progress: { completadas: 0, total: 0 },
    });
  });

  test("continuar una Sesión activa incluye su nombre, el progreso por Series y la referencia", async () => {
    const session = await startFreeSession(context!, cookie);
    const exerciseId = await exerciseOfMode(context!, cookie, "fuerza_con_carga");
    await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [
        {
          exerciseId,
          series: [
            { status: "completada", goal: null, result: { carga: 80, repeticiones: 10 }, rpe: 8 },
            { status: "pendiente", goal: null, result: null },
          ],
        },
      ],
    });

    const state = await readState(context!, accountId);
    expect(state.action.kind).toBe("continuar");
    if (state.action.kind !== "continuar") return;
    expect(state.action.sessionId).toBe(session.id);
    expect(state.action.progress).toEqual({ completadas: 1, total: 2 });
  });

  test("continuar una Sesión originada en una Rutina muestra el nombre de la Rutina", async () => {
    const press = await exerciseOfMode(context!, cookie, "fuerza_con_carga");
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] }],
    });
    await startSessionFromRoutine(context!, cookie, routine.id);

    const state = await readState(context!, accountId);
    expect(state.action).toMatchObject({
      kind: "continuar",
      sessionId: expect.any(String),
      name: "Día de empuje",
    });
  });

  test("continuar una Sesión originada en un Entrenamiento con Rutina muestra la Rutina y la referencia del Plan", async () => {
    const { plan, trainingIds } = await activePlanFixture(context!, cookie);
    const session = await startSessionFromPlan(context!, cookie, plan.id, trainingIds[0]!);

    const state = await readState(context!, accountId);
    expect(state.action.kind).toBe("continuar");
    if (state.action.kind !== "continuar") return;
    expect(state.action.sessionId).toBe(session.id);
    expect(state.action.name).toBe("Día de empuje");
  });

  test("continuar una Sesión originada en un Entrenamiento específico muestra el nombre del Plan", async () => {
    const { plan, trainingIds } = await activePlanFixture(context!, cookie);
    const session = await startSessionFromPlan(context!, cookie, plan.id, trainingIds[1]!);

    const state = await readState(context!, accountId);
    expect(state.action.kind).toBe("continuar");
    if (state.action.kind !== "continuar") return;
    expect(state.action.sessionId).toBe(session.id);
    expect(state.action.name).toBe("Ciclo base");
  });

  test("sin Sesión activa, inicia el próximo Entrenamiento pendiente por Fecha prevista con su referencia", async () => {
    const { plan, trainingIds } = await activePlanFixture(context!, cookie);

    const state = await readState(context!, accountId);
    expect(state.action).toMatchObject({
      kind: "iniciar-plan",
      planId: plan.id,
      trainingId: trainingIds[0]!,
      planName: "Ciclo base",
      name: "Día de empuje",
      plannedDate: "2025-03-10",
      day: 0,
    });
  });

  test("sin Sesión activa ni pendientes, propone la Sesión libre aunque el Plan tenga días resueltos", async () => {
    const press = await exerciseOfMode(context!, cookie, "fuerza_con_carga");
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] }],
    });
    const draft = await createPlan(
      context!,
      cookie,
      planPayload([
        {
          trainings: [
            { day: 0, source: "rutina", routineId: routine.id },
            { day: 3, source: "rutina", routineId: routine.id },
          ],
        },
      ]),
    );
    const plan = await activatePlan(context!, cookie, draft.id, draft.revision, "2025-03-10");
    const [day0, day3] = plan.weeks[0]!.trainings.map((training) => training.id);
    // Se realiza el primer Entrenamiento y se omite el segundo: no quedan pendientes.
    const session = await startSessionFromPlan(context!, cookie, plan.id, day0!);
    const completed = await completeFirstSeries(context!, cookie, session);
    await finalizeSession(context!, cookie, session.id, completed.revision);
    await omitTraining(context!, cookie, plan.id, day3!, plan.revision);

    const state = await readState(context!, accountId);
    expect(state.action).toEqual({ kind: "iniciar-libre" });
  });

  test("los datos de otra Cuenta se comportan como inexistentes", async () => {
    await activePlanFixture(context!, cookie);
    const otherCookie = await registerVerified(context!, "otra@example.com");
    const otherAccountId = await accountIdOf(context!, otherCookie);

    const state = await readState(context!, otherAccountId);
    expect(state.action).toEqual({ kind: "iniciar-libre" });
    expect(state.activePlan).toBeNull();
  });
});

describe("resumen del Plan activo", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let accountId: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
    accountId = await accountIdOf(context, cookie);
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("un borrador y un Plan completado no cuentan como Plan activo", async () => {
    const press = await exerciseOfMode(context!, cookie, "fuerza_con_carga");
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] }],
    });
    const draft = await createPlan(
      context!,
      cookie,
      planPayload([
        { trainings: [{ day: 0, source: "rutina", routineId: routine.id }] },
      ]),
    );
    expect((await readState(context!, accountId)).activePlan).toBeNull();

    const activated = await activatePlan(context!, cookie, draft.id, draft.revision, "2025-03-10");
    const activeState = await readState(context!, accountId);
    expect(activeState.activePlan).not.toBeNull();
    expect(activeState.activePlan!.id).toBe(draft.id);

    const session = await startSessionFromPlan(context!, cookie, activated.id, activated.weeks[0]!.trainings[0]!.id);
    const completed = await completeFirstSeries(context!, cookie, session);
    await finalizeSession(context!, cookie, session.id, completed.revision);
    const completedResponse = await context!.app.request(`/api/plans/${activated.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({ revision: activated.revision }),
    });
    expect(completedResponse.status).toBe(200);

    expect((await readState(context!, accountId)).activePlan).toBeNull();
  });

  test("la semana actual se deriva del lunes de la primera semana y se acota al calendario", async () => {
    const { plan } = await activePlanFixture(context!, cookie);
    expect(plan.startDate).toBe("2025-03-10");

    const week1 = await readState(context!, accountId, "2025-03-10");
    expect(week1.activePlan!.currentWeek).toBe(1);
    const week1Sunday = await readState(context!, accountId, "2025-03-16");
    expect(week1Sunday.activePlan!.currentWeek).toBe(1);
    const week2 = await readState(context!, accountId, "2025-03-17");
    expect(week2.activePlan!.currentWeek).toBe(2);
    expect(week2.activePlan!.currentWeekTrainings).toMatchObject([
      {
        day: 1,
        name: "Día de empuje",
        plannedDate: "2025-03-18",
        status: "pendiente",
      },
      {
        day: 4,
        name: "Ciclo base",
        plannedDate: "2025-03-21",
        status: "pendiente",
      },
    ]);
    // antes de la primera semana: se muestra la primera
    const before = await readState(context!, accountId, "2025-03-01");
    expect(before.activePlan!.currentWeek).toBe(1);
    // después de la última semana: se muestra la última
    const after = await readState(context!, accountId, "2025-04-30");
    expect(after.activePlan!.currentWeek).toBe(2);
  });

  test("el resumen cuenta realizados, omitidos y pendientes por semana y para el Plan completo", async () => {
    const { plan, trainingIds } = await activePlanFixture(context!, cookie);
    const state = await readState(context!, accountId);

    expect(state.activePlan!.name).toBe("Ciclo base");
    expect(state.activePlan!.weeks).toHaveLength(2);
    expect(state.activePlan!.weeks[0]).toEqual({
      order: 0,
      progress: { realizados: 0, omitidos: 0, pendientes: 2, total: 2, avance: 0, cumplimiento: 0, avanceRedondeado: 0, cumplimientoRedondeado: 0 },
    });
    expect(state.activePlan!.currentWeekTrainings).toEqual([
      {
        id: trainingIds[0]!,
        day: 0,
        name: "Día de empuje",
        plannedDate: "2025-03-10",
        status: "pendiente",
      },
      {
        id: trainingIds[1]!,
        day: 3,
        name: "Ciclo base",
        plannedDate: "2025-03-13",
        status: "pendiente",
      },
    ]);
    expect(state.activePlan!.progress).toEqual({
      realizados: 0,
      omitidos: 0,
      pendientes: 4,
      total: 4,
      avance: 0,
      cumplimiento: 0,
      avanceRedondeado: 0,
      cumplimientoRedondeado: 0,
    });

    // Se realiza el Entrenamiento de la semana 1 (día 0) y se omite el de la semana 2 (día 4).
    const session = await startSessionFromPlan(context!, cookie, plan.id, trainingIds[0]!);
    const completed = await completeFirstSeries(context!, cookie, session);
    await finalizeSession(context!, cookie, session.id, completed.revision);
    await omitTraining(context!, cookie, plan.id, trainingIds[3]!, plan.revision);

    const updated = await readState(context!, accountId);
    expect(updated.activePlan!.weeks[0]!.progress).toEqual({
      realizados: 1,
      omitidos: 0,
      pendientes: 1,
      total: 2,
      avance: 50,
      cumplimiento: 50,
      avanceRedondeado: 50,
      cumplimientoRedondeado: 50,
    });
    expect(updated.activePlan!.weeks[1]!.progress).toEqual({
      realizados: 0,
      omitidos: 1,
      pendientes: 1,
      total: 2,
      avance: 50,
      cumplimiento: 0,
      avanceRedondeado: 50,
      cumplimientoRedondeado: 0,
    });
    expect(updated.activePlan!.progress).toEqual({
      realizados: 1,
      omitidos: 1,
      pendientes: 2,
      total: 4,
      avance: 50,
      cumplimiento: 25,
      avanceRedondeado: 50,
      cumplimientoRedondeado: 25,
    });
  });

  test("avance y cumplimiento conservan precisión completa y redondean al entero más próximo", async () => {
    const press = await exerciseOfMode(context!, cookie, "fuerza_con_carga");
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] }],
    });
    const draft = await createPlan(
      context!,
      cookie,
      planPayload([
        {
          trainings: [
            { day: 0, source: "rutina", routineId: routine.id },
            { day: 1, source: "rutina", routineId: routine.id },
            { day: 2, source: "rutina", routineId: routine.id },
          ],
        },
      ]),
    );
    const plan = await activatePlan(context!, cookie, draft.id, draft.revision, "2025-03-10");
    const trainingIds = plan.weeks[0]!.trainings.map((training) => training.id);

    // 1 realizado de 3 totales.
    const session = await startSessionFromPlan(context!, cookie, plan.id, trainingIds[0]!);
    const completed = await completeFirstSeries(context!, cookie, session);
    await finalizeSession(context!, cookie, session.id, completed.revision);

    const state = await readState(context!, accountId);
    const progress = state.activePlan!.progress;
    expect(progress.total).toBe(3);
    expect(progress.realizados).toBe(1);
    // 1 de 3: 100/3 % exacto (33,333…), presentado como 33.
    expect(progress.avance).toBe(33.33333333333333);
    expect(progress.cumplimiento).toBe(33.33333333333333);
    expect(progress.avanceRedondeado).toBe(33);
    expect(progress.cumplimientoRedondeado).toBe(33);

    // 2 de 3: se realizan dos Entrenamientos y se omite el tercero. El avance
    // llega al 100 % y el cumplimiento conserva 200/3 % (66,666… → 67).
    const second = await startSessionFromPlan(context!, cookie, plan.id, trainingIds[1]!);
    const secondCompleted = await completeFirstSeries(context!, cookie, second);
    await finalizeSession(context!, cookie, second.id, secondCompleted.revision);
    await omitTraining(context!, cookie, plan.id, trainingIds[2]!, plan.revision);

    const updated = await readState(context!, accountId);
    expect(updated.activePlan!.progress.realizados).toBe(2);
    expect(updated.activePlan!.progress.omitidos).toBe(1);
    expect(updated.activePlan!.progress.avance).toBe(100);
    expect(updated.activePlan!.progress.cumplimiento).toBe(66.66666666666666);
    expect(updated.activePlan!.progress.avanceRedondeado).toBe(100);
    expect(updated.activePlan!.progress.cumplimientoRedondeado).toBe(67);
  });
});

describe("cambios de progreso tras omitir, finalizar o eliminar", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let accountId: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
    accountId = await accountIdOf(context, cookie);
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("finalizar una Sesión cuenta el Entrenamiento como realizado y eliminarla lo devuelve a pendiente", async () => {
    const { plan, trainingIds } = await activePlanFixture(context!, cookie);
    const [day0, day3] = trainingIds;

    expect((await readState(context!, accountId)).activePlan!.progress).toMatchObject({
      realizados: 0,
      omitidos: 0,
      pendientes: 4,
    });

    const session = await startSessionFromPlan(context!, cookie, plan.id, day0!);
    // Mientras la Sesión está activa, la acción prioritaria es continuarla.
    expect((await readState(context!, accountId)).action).toMatchObject({
      kind: "continuar",
      sessionId: session.id,
    });
    const completed = await completeFirstSeries(context!, cookie, session);
    await finalizeSession(context!, cookie, session.id, completed.revision);

    const afterFinalize = await readState(context!, accountId);
    expect(afterFinalize.activePlan!.progress).toMatchObject({
      realizados: 1,
      omitidos: 0,
      pendientes: 3,
    });
    // El Entrenamiento realizado deja de ser el próximo pendiente.
    expect(afterFinalize.action).toMatchObject({
      kind: "iniciar-plan",
      trainingId: day3,
    });

    await deleteSession(context!, cookie, session.id, completed.revision + 1);

    const afterDelete = await readState(context!, accountId);
    expect(afterDelete.activePlan!.progress).toMatchObject({
      realizados: 0,
      omitidos: 0,
      pendientes: 4,
    });
    expect(afterDelete.action).toMatchObject({ kind: "iniciar-plan", trainingId: day0 });
  });

  test("omitir cuenta en el avance pero no en el cumplimiento y restaurar lo devuelve a pendiente", async () => {
    const { plan, trainingIds } = await activePlanFixture(context!, cookie);
    const day3 = trainingIds[1]!;

    let revision = plan.revision;
    revision = await omitTraining(context!, cookie, plan.id, day3, revision);

    const omitted = await readState(context!, accountId);
    expect(omitted.activePlan!.progress).toEqual({
      realizados: 0,
      omitidos: 1,
      pendientes: 3,
      total: 4,
      avance: 25,
      cumplimiento: 0,
      avanceRedondeado: 25,
      cumplimientoRedondeado: 0,
    });

    revision = await restoreTraining(context!, cookie, plan.id, day3, revision);
    const restored = await readState(context!, accountId);
    expect(restored.activePlan!.progress).toMatchObject({
      realizados: 0,
      omitidos: 0,
      pendientes: 4,
    });
  });

  test("una Sesión libre o iniciada desde una Rutina no altera el progreso del Plan", async () => {
    const { plan } = await activePlanFixture(context!, cookie);

    const free = await startFreeSession(context!, cookie);
    const freeExercise = await exerciseOfMode(context!, cookie, "fuerza_con_carga");
    const freeWithSeries = await replaceSession(context!, cookie, free.id, {
      revision: free.revision,
      exercises: [
        {
          exerciseId: freeExercise,
          series: [
            { status: "completada", goal: null, result: { carga: 80, repeticiones: 10 }, rpe: 8 },
          ],
        },
      ],
    });
    await finalizeSession(context!, cookie, free.id, freeWithSeries.revision);

    const press = await exerciseOfMode(context!, cookie, "fuerza_con_carga");
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: press, series: [{ carga: 60, repeticiones: 10 }] }],
    });
    const fromRoutine = await startSessionFromRoutine(context!, cookie, routine.id);
    const fromRoutineCompleted = await completeFirstSeries(context!, cookie, fromRoutine);
    await finalizeSession(context!, cookie, fromRoutine.id, fromRoutineCompleted.revision);

    const state = await readState(context!, accountId);
    expect(state.activePlan!.progress).toMatchObject({
      realizados: 0,
      omitidos: 0,
      pendientes: 4,
    });
    expect(state.action.kind).toBe("iniciar-plan");
    expect(state.action).toMatchObject({ planId: plan.id });
  });
});
