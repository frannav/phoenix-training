import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
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
  exercise: {
    id: string;
    name: string;
    recordingMode: string;
    provenance: "catalogo" | "personalizado";
  };
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

/** Corrige la Fecha realizada de una Sesión finalizada (ticket 29). */
async function setPerformedDate(
  context: TestContext,
  cookie: string,
  session: SessionDocument,
  date: string,
): Promise<SessionDocument> {
  const echoed = {
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
  const { status, body } = await replaceSession(context, cookie, session, {
    ...echoed,
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

type PlanTrainingDocument = {
  id: string;
  day: number;
  plannedDate: string | null;
  status: "pendiente" | "omitido" | "realizado" | null;
  source: "rutina" | "especifico";
  routineId: string | null;
  routine: { id: string; name: string; archived: boolean } | null;
  content: unknown[];
};

type PlanWeekDocument = {
  id: string;
  order: number;
  trainings: PlanTrainingDocument[];
};

type PlanDocument = {
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
  specific?: { exerciseId: string; series: { carga?: number | null; repeticiones?: number | null }[] }[];
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

async function startSessionFromRoutine(
  context: TestContext,
  cookie: string,
  routineId: string,
): Promise<SessionDocument> {
  const response = await context.app.request("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({ origin: "rutina", routineId }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { session: SessionDocument }).session;
}

/**
 * Completa todas las Series de una Sesión activa con sus Objetivos como
 * Resultado y la finaliza: el flujo del Historial exige al menos una Serie
 * completada.
 */
async function completeAndFinalizeSession(
  context: TestContext,
  cookie: string,
  session: SessionDocument,
): Promise<SessionDocument> {
  const response = await context.app.request(`/api/sessions/${session.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({
      revision: session.revision,
      exercises: session.exercises.map((occurrence) => ({
        id: occurrence.id,
        exerciseId: occurrence.exerciseId,
        series: occurrence.series.map((series) => ({
          id: series.id,
          status: "completada",
          goal: series.goal,
          result: series.goal,
          rpe: null,
        })),
      })),
    }),
  });
  expect(response.status).toBe(200);
  const withResults = (await response.json()) as { session: SessionDocument };
  return finalizeSession(context, cookie, withResults.session);
}

async function getDiaryMonth(
  context: TestContext,
  cookie: string,
  query = "",
): Promise<Response> {
  return context.app.request(`/api/diary${query}`, {
    headers: { Cookie: cookie, Origin: origin },
  });
}

async function getDiaryDay(
  context: TestContext,
  cookie: string,
  query = "",
): Promise<Response> {
  return context.app.request(`/api/diary/day${query}`, {
    headers: { Cookie: cookie, Origin: origin },
  });
}

type MonthlyDiaryResponse = {
  year: number;
  month: number;
  days: Array<{
    date: string;
    sessions: Array<{ id: string; title: string }>;
    volumeKgRep: number;
  }>;
};

type DiaryDayResponse = {
  date: string;
  volumeKgRep: number;
  sessions: Array<SessionDocument & {
    title: string;
    planName: string | null;
    routineName: string | null;
    volumeKgRep: number;
  }>;
};

/**
 * Escenario del Diario sobre marzo de 2025 (la referencia fija es el lunes
 * 10): Sesiones finalizadas de fuerza y otras Formas de registro en varios
 * días, una Sesión activa excluida y una Sesión de otro mes. Devuelve los
 * identificadores y documentos necesarios para aseverar el calendario.
 */
async function fullFixture(
  context: TestContext,
  cookie: string,
): Promise<{
  sentadilla: string;
  dominada: string;
  cinta: string;
  routine: RoutineDocument;
  plan: PlanDocument;
  trainingIds: string[];
  sessions: SessionDocument[];
  active: SessionDocument;
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
    ], "2025-03-05"),
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
  sessions.push(
    await finalizedSessionWithSeries(context, cookie, sentadilla, [
      { status: "completada", goal: null, result: { carga: 120, repeticiones: 5 }, rpe: 8 },
    ], "2025-03-12"),
  );
  // Fuera del mes: no debe aparecer en marzo.
  await finalizedSessionWithSeries(context, cookie, sentadilla, [
    { status: "completada", goal: null, result: { carga: 90, repeticiones: 8 }, rpe: null },
  ], "2025-04-02");

  // Sesión activa: no forma parte del Diario hasta finalizar.
  const active = await startFreeSession(context, cookie);

  return { sentadilla, dominada, cinta, routine, plan, trainingIds, sessions, active };
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

  test("sin sesión las rutas responden 401 UNAUTHORIZED", async () => {
    const month = await getDiaryMonth(context!, "");
    expect(month.status).toBe(401);
    const monthBody = (await month.json()) as { error: { code: string } };
    expect(monthBody.error.code).toBe("UNAUTHORIZED");

    const day = await getDiaryDay(context!, "");
    expect(day.status).toBe(401);
    const dayBody = (await day.json()) as { error: { code: string } };
    expect(dayBody.error.code).toBe("UNAUTHORIZED");
  });

  test("una Cuenta sin verificar no alcanza las rutas", async () => {
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

    const month = await getDiaryMonth(context!, "");
    expect(month.status).toBe(401);
  });
});

describe("calendario mensual", () => {
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

  test("comprende todos los días del mes con sus Sesiones finalizadas y el volumen diario", async () => {
    const fixture = await fullFixture(context!, cookie);
    const response = await getDiaryMonth(context!, cookie, "?year=2025&month=3");
    expect(response.status).toBe(200);
    const body = (await response.json()) as MonthlyDiaryResponse;

    expect(body.year).toBe(2025);
    expect(body.month).toBe(3);
    expect(body.days).toHaveLength(31);
    // Los días sin Sesiones se incluyen explícitamente con su estado vacío.
    expect(body.days[0]).toEqual({ date: "2025-03-01", sessions: [], volumeKgRep: 0 });
    expect(body.days[2]).toEqual({ date: "2025-03-03", sessions: [], volumeKgRep: 0 });
    expect(body.days.at(-1)).toEqual({ date: "2025-03-31", sessions: [], volumeKgRep: 0 });

    // Día 5: tres Sesiones finalizadas y volumen solo de la fuerza con carga.
    const day5 = body.days[4]!;
    expect(day5.date).toBe("2025-03-05");
    expect(day5.sessions).toHaveLength(3);
    expect(day5.sessions.map((entry) => entry.title)).toEqual([
      "Sesión libre",
      "Sesión libre",
      "Sesión libre",
    ]);
    expect(day5.volumeKgRep).toBe(1500); // 100×10 + 50×10; la Dominada no suma kg.

    // Día 11: la Cinta (cardio continuo) no aporta kilogramos.
    const day11 = body.days[10]!;
    expect(day11.sessions).toHaveLength(1);
    expect(day11.volumeKgRep).toBe(0);

    // Día 12: una Sesión de fuerza con RPE.
    const day12 = body.days[11]!;
    expect(day12.sessions).toHaveLength(1);
    expect(day12.volumeKgRep).toBe(600); // 120×5

    // La Sesión activa y la Sesión de otro mes quedan fuera del calendario.
    const sessionIds = body.days.flatMap((day) => day.sessions.map((entry) => entry.id));
    expect(sessionIds).not.toContain(fixture.active.id);
  });

  test("el volumen diario respeta la corrección y la eliminación de Sesiones", async () => {
    const fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    const session = await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");

    const before = await getDiaryMonth(context!, cookie, "?year=2025&month=3");
    const beforeBody = (await before.json()) as MonthlyDiaryResponse;
    expect(beforeBody.days[11]!.volumeKgRep).toBe(1000);

    const corrected = await setPerformedDate(context!, cookie, session, "2025-03-05");
    const correctedMonth = await getDiaryMonth(context!, cookie, "?year=2025&month=3");
    const correctedBody = (await correctedMonth.json()) as MonthlyDiaryResponse;
    expect(correctedBody.days[11]!.volumeKgRep).toBe(0);
    expect(correctedBody.days[4]!.volumeKgRep).toBe(1000);

    await deleteSession(context!, cookie, corrected);
    const afterDelete = await getDiaryMonth(context!, cookie, "?year=2025&month=3");
    const afterDeleteBody = (await afterDelete.json()) as MonthlyDiaryResponse;
    expect(afterDeleteBody.days[4]!.sessions).toEqual([]);
    expect(afterDeleteBody.days[4]!.volumeKgRep).toBe(0);
  });

  test("un mes sin Sesiones expresa todos sus días vacíos", async () => {
    const response = await getDiaryMonth(context!, cookie, "?year=2025&month=2");
    expect(response.status).toBe(200);
    const body = (await response.json()) as MonthlyDiaryResponse;
    expect(body.days).toHaveLength(28);
    expect(body.days.every((day) => day.sessions.length === 0 && day.volumeKgRep === 0)).toBe(true);
  });

  test("una consulta con parámetros desconocidos o no válidos se rechaza", async () => {
    const unknown = await getDiaryMonth(context!, cookie, "?desconocido=1");
    expect(unknown.status).toBe(400);

    const badMonth = await getDiaryMonth(context!, cookie, "?year=2025&month=13");
    expect(badMonth.status).toBe(400);

    const badYear = await getDiaryMonth(context!, cookie, "?year=abcd&month=3");
    expect(badYear.status).toBe(400);
  });
});

describe("detalle de un día", () => {
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

  test("presenta Sesiones libres con Ejercicios, Series, repeticiones y pesos", async () => {
    const sentadilla = (
      await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })
    ).id;
    const session = await finalizedSessionWithSeries(context!, cookie, sentadilla, [
      {
        status: "completada",
        goal: { carga: 80, repeticiones: 10 },
        result: { carga: 100, repeticiones: 10 },
        rpe: 8,
      },
    ], "2025-03-12");

    const response = await getDiaryDay(context!, cookie, "?date=2025-03-12");
    expect(response.status).toBe(200);
    const body = (await response.json()) as DiaryDayResponse;

    expect(body.date).toBe("2025-03-12");
    expect(body.volumeKgRep).toBe(1000);
    expect(body.sessions).toHaveLength(1);

    const diarySession = body.sessions[0]!;
    expect(diarySession.id).toBe(session.id);
    expect(diarySession.title).toBe("Sesión libre");
    expect(diarySession.planName).toBeNull();
    expect(diarySession.routineName).toBeNull();
    expect(diarySession.origin).toBe("libre");
    expect(diarySession.plannedDate).toBeNull();
    expect(diarySession.exercises).toHaveLength(1);

    const occurrence = diarySession.exercises[0]!;
    expect(occurrence.exercise.name).toBe("Sentadilla");
    expect(occurrence.exercise.recordingMode).toBe("fuerza_con_carga");
    expect(occurrence.series).toHaveLength(1);
    expect(occurrence.series[0]).toMatchObject({
      status: "completada",
      goal: { carga: 80, repeticiones: 10, duracion: null },
      result: { carga: 100, repeticiones: 10, duracion: null },
      rpe: 8,
    });
  });

  test("resuelve el Plan y la Rutina desde el Origen persistido de la Sesión", async () => {
    const sentadilla = (
      await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })
    ).id;
    const routine = await createRoutine(context!, cookie, {
      name: "Día de empuje",
      exercises: [{ exerciseId: sentadilla, series: [{ carga: 60, repeticiones: 10 }] }],
    });
    const draft = await createPlan(
      context!,
      cookie,
      planPayload([
        {
          trainings: [
            { day: 0, source: "rutina", routineId: routine.id },
            { day: 3, source: "especifico", specific: [{ exerciseId: sentadilla, series: [{ carga: 70, repeticiones: 8 }] }] },
          ],
        },
      ]),
    );
    const plan = await activatePlan(context!, cookie, draft.id, draft.revision, "2025-03-10");
    const trainings = plan.weeks
      .flatMap((week) => week.trainings)
      .sort((a, b) => (a.plannedDate ?? "").localeCompare(b.plannedDate ?? ""));

    // Sesión desde el Entrenamiento del lunes (usa la Rutina como referencia viva).
    const fromRoutineTraining = await startSessionFromPlan(
      context!,
      cookie,
      plan.id,
      trainings[0]!.id,
    );
    const routineSession = await setPerformedDate(
      context!,
      cookie,
      await completeAndFinalizeSession(context!, cookie, fromRoutineTraining),
      "2025-03-10",
    );

    // Sesión desde el Entrenamiento específico del jueves (nombre del Plan).
    const specificTraining = await startSessionFromPlan(
      context!,
      cookie,
      plan.id,
      trainings[1]!.id,
    );
    const specificSession = await setPerformedDate(
      context!,
      cookie,
      await completeAndFinalizeSession(context!, cookie, specificTraining),
      "2025-03-13",
    );

    // Sesión iniciada directamente desde la Rutina.
    const direct = await startSessionFromRoutine(context!, cookie, routine.id);
    const directSession = await setPerformedDate(
      context!,
      cookie,
      await completeAndFinalizeSession(context!, cookie, direct),
      "2025-03-14",
    );

    const monday = await getDiaryDay(context!, cookie, "?date=2025-03-10");
    const mondayBody = (await monday.json()) as DiaryDayResponse;
    expect(mondayBody.sessions).toHaveLength(1);
    expect(mondayBody.sessions[0]!.id).toBe(routineSession.id);
    expect(mondayBody.sessions[0]!.title).toBe("Día de empuje");
    expect(mondayBody.sessions[0]!.planName).toBe("Ciclo base");
    expect(mondayBody.sessions[0]!.routineName).toBe("Día de empuje");
    expect(mondayBody.sessions[0]!.plannedDate).toBe("2025-03-10");

    const thursday = await getDiaryDay(context!, cookie, "?date=2025-03-13");
    const thursdayBody = (await thursday.json()) as DiaryDayResponse;
    expect(thursdayBody.sessions[0]!.title).toBe("Ciclo base");
    expect(thursdayBody.sessions[0]!.planName).toBe("Ciclo base");
    expect(thursdayBody.sessions[0]!.routineName).toBeNull();

    const directDay = await getDiaryDay(context!, cookie, "?date=2025-03-14");
    const directBody = (await directDay.json()) as DiaryDayResponse;
    expect(directBody.sessions[0]!.title).toBe("Día de empuje");
    expect(directBody.sessions[0]!.planName).toBeNull();
    expect(directBody.sessions[0]!.routineName).toBe("Día de empuje");
  });

  test("un día sin Sesiones expresa su estado vacío", async () => {
    const response = await getDiaryDay(context!, cookie, "?date=2025-03-20");
    expect(response.status).toBe(200);
    const body = (await response.json()) as DiaryDayResponse;
    expect(body).toEqual({ date: "2025-03-20", volumeKgRep: 0, sessions: [] });
  });

  test("una fecha no válida o con parámetros desconocidos se rechaza", async () => {
    const invalid = await getDiaryDay(context!, cookie, "?date=2025-13-40");
    expect(invalid.status).toBe(400);

    const malformed = await getDiaryDay(context!, cookie, "?date=12/03/2025");
    expect(malformed.status).toBe(400);

    const unknown = await getDiaryDay(context!, cookie, "?date=2025-03-12&extra=1");
    expect(unknown.status).toBe(400);
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

    const month = await getDiaryMonth(context!, otherCookie, "?year=2025&month=3");
    const monthBody = (await month.json()) as MonthlyDiaryResponse;
    expect(monthBody.days.every((day) => day.sessions.length === 0)).toBe(true);

    const day = await getDiaryDay(context!, otherCookie, "?date=2025-03-05");
    const dayBody = (await day.json()) as DiaryDayResponse;
    expect(dayBody).toEqual({ date: "2025-03-05", volumeKgRep: 0, sessions: [] });
  });
});
