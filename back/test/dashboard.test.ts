import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app";
import { weeklyVolume, recentRecordedMaxes, exerciseEvolution, type ExerciseEvolution } from "../src/dashboard/analytics";
import { migrateDatabase } from "../src/db/migrate";
import { openDatabase, type DatabaseConnection } from "../src/db/open-database";
import { user } from "../src/db/schema";
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

/** Identificador de la Cuenta autenticada detrás de un correo de prueba. */
async function accountIdFor(context: TestContext, email: string): Promise<string> {
  const row = await context.connection.db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .get();
  expect(row).toBeDefined();
  return row!.id;
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
 * corrige la Fecha realizada al valor indicado. Las Sesiones nacen con la Fecha
 * realizada del instante fijo (2025-03-10, lunes) y solo una Sesión finalizada
 * puede corregirla, así que la corrección ocurre después de finalizar.
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

describe("volumen semanal", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let fuerzaId: string;
  let repeticionesId: string;
  let tiempoId: string;
  let cardioId: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    cookie = await registerVerified(context, "deportista@example.com");
    fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    repeticionesId = (await createExercise(context!, cookie, { name: "Dominadas", recordingMode: "repeticiones_sin_carga" })).id;
    tiempoId = (await createExercise(context!, cookie, { name: "Plancha", recordingMode: "tiempo_por_serie" })).id;
    cardioId = (await createExercise(context!, cookie, { name: "Cinta", recordingMode: "cardio_continuo" })).id;
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("suma carga × repeticiones de las Series completadas de la semana actual", async () => {
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
      { status: "completada", goal: null, result: { carga: 80, repeticiones: 5 }, rpe: null },
    ], "2025-03-12");

    const volume = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(volume.currentWeekStart).toBe("2025-03-10");
    expect(volume.currentTotal).toBe(100 * 10 + 80 * 5);
    expect(volume.weeks.at(-1)).toEqual({ weekStart: "2025-03-10", total: 1400 });
  });

  test("compara porcentualmente con la semana anterior", async () => {
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 50, repeticiones: 10 }, rpe: null },
    ], "2025-03-05");

    const volume = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(volume.currentTotal).toBe(1000);
    expect(volume.previousTotal).toBe(500);
    expect(volume.changePercent).toBe(100);
  });

  test("devuelve las últimas seis semanas en orden, incluida la actual", async () => {
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 50, repeticiones: 10 }, rpe: null },
    ], "2025-02-03");
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 20, repeticiones: 5 }, rpe: null },
    ], "2025-02-17");

    const volume = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(volume.weeks).toEqual([
      { weekStart: "2025-02-03", total: 500 },
      { weekStart: "2025-02-10", total: 0 },
      { weekStart: "2025-02-17", total: 100 },
      { weekStart: "2025-02-24", total: 0 },
      { weekStart: "2025-03-03", total: 0 },
      { weekStart: "2025-03-10", total: 0 },
    ]);
  });

  test("excluye Series pendientes y omitidas, Sesiones activas y otras Formas de registro", async () => {
    // Una Serie completada y otras pendiente/omitida del mismo Ejercicio de fuerza.
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
      { status: "pendiente", goal: { carga: 200, repeticiones: 5 }, result: null, rpe: null },
      { status: "omitida", goal: { carga: 150, repeticiones: 4 }, result: null, rpe: null },
    ], "2025-03-12");

    // Una Sesión todavía activa con una Serie completada no cuenta.
    const active = await startFreeSession(context!, cookie);
    const replaced = await replaceSession(context!, cookie, active, {
      revision: active.revision,
      exercises: [{ exerciseId: fuerzaId, series: [
        { status: "completada", goal: null, result: { carga: 90, repeticiones: 10 }, rpe: null },
      ] }],
    });
    expect(replaced.status).toBe(200);
    // Se retira para poder crear el resto de Sesiones del escenario.
    await deleteSession(context!, cookie, (replaced.body as { session: SessionDocument }).session);

    // Cardio, repeticiones sin carga y tiempo por serie finalizados no cuentan.
    await finalizedSessionWithSeries(context!, cookie, cardioId, [
      { status: "completada", goal: null, result: { duracion: 1800 }, rpe: null },
    ], "2025-03-11");
    await finalizedSessionWithSeries(context!, cookie, repeticionesId, [
      { status: "completada", goal: null, result: { repeticiones: 30 }, rpe: null },
    ], "2025-03-11");
    await finalizedSessionWithSeries(context!, cookie, tiempoId, [
      { status: "completada", goal: null, result: { duracion: 600 }, rpe: null },
    ], "2025-03-11");

    const volume = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(volume.currentTotal).toBe(1000);
  });

  test("los Objetivos de serie no participan en el volumen", async () => {
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: { carga: 200, repeticiones: 20 }, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");

    const volume = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(volume.currentTotal).toBe(1000);
  });

  test("sin volumen en la semana anterior la comparación es nula", async () => {
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");

    const volume = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(volume.previousTotal).toBe(0);
    expect(volume.changePercent).toBeNull();
  });

  test("corregir la Fecha realizada mueve el volumen entre semanas", async () => {
    const session = await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");

    const before = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(before.currentTotal).toBe(1000);
    expect(before.previousTotal).toBe(0);

    await setPerformedDate(context!, cookie, session, "2025-03-05");

    const after = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(after.currentTotal).toBe(0);
    expect(after.previousTotal).toBe(1000);
    expect(after.changePercent).toBe(-100);
  });

  test("corregir el resultado o el estado de una Serie cambia el volumen", async () => {
    const session = await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
      { status: "omitida", goal: { carga: 200, repeticiones: 5 }, result: null, rpe: null },
    ], "2025-03-12");

    const before = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(before.currentTotal).toBe(1000);

    // Corrige la Serie omitida a completada con su resultado (ticket 29): la
    // siguiente lectura incorpora su volumen sin procesos derivados.
    const echoed = echoSession(session);
    const corrected = (echoed.exercises[0] as { series: SeriesInput[] }).series;
    corrected[1] = {
      id: corrected[1]!.id,
      status: "completada",
      goal: null,
      result: { carga: 200, repeticiones: 5 },
      rpe: null,
    };
    const { status, body } = await replaceSession(context!, cookie, session, echoed);
    expect(status).toBe(200);
    const updated = (body as { session: SessionDocument }).session;
    expect(updated.exercises[0]!.series[1]!.status).toBe("completada");

    const after = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(after.currentTotal).toBe(1000 + 1000);
  });

  test("eliminar una Sesión retira su volumen", async () => {
    const first = await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 50, repeticiones: 10 }, rpe: null },
    ], "2025-03-11");

    const before = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(before.currentTotal).toBe(1500);

    await deleteSession(context!, cookie, first);

    const after = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(after.currentTotal).toBe(500);
  });

  test("una Cuenta solo ve su propio volumen", async () => {
    const cookieB = await registerVerified(context!, "otra@example.com");
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");
    const fuerzaB = await createExercise(context!, cookieB, { name: "Prensa", recordingMode: "fuerza_con_carga" });
    await finalizedSessionWithSeries(context!, cookieB, fuerzaB.id, [
      { status: "completada", goal: null, result: { carga: 20, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");

    const volumeA = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(volumeA.currentTotal).toBe(1000);

    const volumeB = await weeklyVolume(context!.connection.db, {
      accountId: await accountIdFor(context!, "otra@example.com"),
      today: new Date("2025-03-10T12:00:00.000Z"),
    });
    expect(volumeB.currentTotal).toBe(200);
  });
});

describe("RM recientes", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let fuerzaId: string;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    cookie = await registerVerified(context, "deportista@example.com");
    fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("devuelve hasta tres RM propios del más reciente al más antiguo", async () => {
    await createRecordedMax(context!, cookie, { exerciseId: fuerzaId, load: 120, repetitions: 5, date: "2025-05-01" });
    await createRecordedMax(context!, cookie, { exerciseId: fuerzaId, load: 140, repetitions: 3, date: "2025-06-15" });
    await createRecordedMax(context!, cookie, { exerciseId: fuerzaId, load: 100, repetitions: 8, date: "2025-04-15" });
    await createRecordedMax(context!, cookie, { exerciseId: fuerzaId, load: 90, repetitions: 10, date: "2025-03-01" });

    const items = await recentRecordedMaxes(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
    });
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.date)).toEqual(["2025-06-15", "2025-05-01", "2025-04-15"]);
    expect(items[0]).toMatchObject({ exerciseId: fuerzaId, exerciseName: "Sentadilla", load: 140, repetitions: 3 });
  });

  test("sin RM registrados el bloque está vacío", async () => {
    const items = await recentRecordedMaxes(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
    });
    expect(items).toEqual([]);
  });

  test("las Sesiones completadas no crean RM automáticos", async () => {
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 120, repeticiones: 5 }, rpe: null },
    ], "2025-06-10");

    const items = await recentRecordedMaxes(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
    });
    expect(items).toEqual([]);
  });

  test("el bloque no expone RM ajenos", async () => {
    await createRecordedMax(context!, cookie, { exerciseId: fuerzaId, load: 140, repetitions: 3, date: "2025-06-15" });
    const cookieB = await registerVerified(context!, "otra@example.com");
    const fuerzaB = await createExercise(context!, cookieB, { name: "Prensa", recordingMode: "fuerza_con_carga" });
    await createRecordedMax(context!, cookieB, { exerciseId: fuerzaB.id, load: 200, repetitions: 1, date: "2025-07-01" });

    const forA = await recentRecordedMaxes(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
    });
    expect(forA).toHaveLength(1);
    expect(forA[0]).toMatchObject({ load: 140, date: "2025-06-15" });
  });
});

describe("evolución de un Ejercicio", () => {
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

  async function evolutionFor(exerciseId: string): Promise<ExerciseEvolution | null> {
    return exerciseEvolution(context!.connection.db, {
      accountId: await accountIdFor(context!, "deportista@example.com"),
      exerciseId,
    });
  }

  test("fuerza con carga: un punto por Sesión con la carga máxima", async () => {
    const fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    const first = await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
      { status: "completada", goal: null, result: { carga: 110, repeticiones: 5 }, rpe: null },
    ], "2025-03-12");
    const second = await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 120, repeticiones: 3 }, rpe: null },
    ], "2025-04-01");

    const evolution = await evolutionFor(fuerzaId);
    expect(evolution).not.toBeNull();
    expect(evolution!.metric).toBe("carga_maxima");
    expect(evolution!.points).toHaveLength(2);
    expect(evolution!.points.map((point) => point.date)).toEqual(["2025-03-12", "2025-04-01"]);
    expect(evolution!.points[0]).toMatchObject({ sessionId: first.id, date: "2025-03-12", value: 110 });
    expect(evolution!.points[1]).toMatchObject({ sessionId: second.id, date: "2025-04-01", value: 120 });
  });

  test("repeticiones sin carga: repeticiones totales por Sesión", async () => {
    const repsId = (await createExercise(context!, cookie, { name: "Dominadas", recordingMode: "repeticiones_sin_carga" })).id;
    await finalizedSessionWithSeries(context!, cookie, repsId, [
      { status: "completada", goal: null, result: { repeticiones: 30 }, rpe: null },
      { status: "completada", goal: null, result: { repeticiones: 15 }, rpe: null },
    ], "2025-03-12");

    const evolution = await evolutionFor(repsId);
    expect(evolution!.metric).toBe("repeticiones_totales");
    expect(evolution!.points).toEqual([
      expect.objectContaining({ date: "2025-03-12", value: 45 }),
    ]);
  });

  test("tiempo por serie: duración total por Sesión", async () => {
    const tiempoId = (await createExercise(context!, cookie, { name: "Plancha", recordingMode: "tiempo_por_serie" })).id;
    await finalizedSessionWithSeries(context!, cookie, tiempoId, [
      { status: "completada", goal: null, result: { duracion: 600 }, rpe: null },
      { status: "completada", goal: null, result: { duracion: 300 }, rpe: null },
    ], "2025-03-12");

    const evolution = await evolutionFor(tiempoId);
    expect(evolution!.metric).toBe("duracion_total");
    expect(evolution!.points).toEqual([
      expect.objectContaining({ date: "2025-03-12", value: 900 }),
    ]);
  });

  test("cardio continuo no produce analítica", async () => {
    const cardioId = (await createExercise(context!, cookie, { name: "Cinta", recordingMode: "cardio_continuo" })).id;
    await finalizedSessionWithSeries(context!, cookie, cardioId, [
      { status: "completada", goal: null, result: { duracion: 1800 }, rpe: null },
    ], "2025-03-12");

    const evolution = await evolutionFor(cardioId);
    expect(evolution!.metric).toBeNull();
    expect(evolution!.points).toEqual([]);
  });

  test("un Ejercicio sin Sesiones finalizadas tiene una serie vacía", async () => {
    const fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    const evolution = await evolutionFor(fuerzaId);
    expect(evolution!.metric).toBe("carga_maxima");
    expect(evolution!.points).toEqual([]);
  });

  test("RPE medio: solo Series completadas con RPE, sin ponderar y con un decimal", async () => {
    const fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: 8 },
      { status: "completada", goal: null, result: { carga: 200, repeticiones: 3 }, rpe: 9 },
      { status: "completada", goal: null, result: { carga: 150, repeticiones: 5 }, rpe: null },
    ], "2025-03-12");

    const evolution = await evolutionFor(fuerzaId);
    // 8 y 9 pese a cargas distintas: la media no pondera por carga.
    expect(evolution!.points[0]!.rpeMedio).toBe(8.5);

    const decimalId = (await createExercise(context!, cookie, { name: "Prensa", recordingMode: "fuerza_con_carga" })).id;
    await finalizedSessionWithSeries(context!, cookie, decimalId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: 8 },
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: 8.5 },
    ], "2025-03-13");
    const decimal = await evolutionFor(decimalId);
    expect(decimal!.points[0]!.rpeMedio).toBe(8.3);
  });

  test("RPE medio se omite sin observaciones", async () => {
    const fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");

    const evolution = await evolutionFor(fuerzaId);
    expect(evolution!.points[0]!.rpeMedio).toBeNull();
  });

  test("intensidad relativa frente al RM vigente de una repetición y puede superar el 100 %", async () => {
    const fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    await createRecordedMax(context!, cookie, { exerciseId: fuerzaId, load: 100, repetitions: 1, date: "2025-03-01" });
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 110, repeticiones: 5 }, rpe: null },
      { status: "completada", goal: null, result: { carga: 120, repeticiones: 3 }, rpe: null },
    ], "2025-03-12");

    const evolution = await evolutionFor(fuerzaId);
    // 120 / 100 × 100 = 120 %, la máxima de la Sesión, por encima del 100 %.
    expect(evolution!.points[0]!.intensidadRelativaMax).toBe(120);
  });

  test("sin RM de una repetición no se calcula intensidad relativa ni se estima un 1RM", async () => {
    const fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    // Un RM de cinco repeticiones no sirve para la intensidad relativa: la
    // regla exige el RM vigente de una repetición y nunca estima un 1RM.
    await createRecordedMax(context!, cookie, { exerciseId: fuerzaId, load: 200, repetitions: 5, date: "2025-02-01" });
    const before = await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 120, repeticiones: 5 }, rpe: null },
    ], "2025-03-12");

    const evolution = await evolutionFor(fuerzaId);
    expect(evolution!.points).toHaveLength(1);
    expect(evolution!.points[0]!.intensidadRelativaMax).toBeNull();

    // Un RM de una repetición posterior a la Sesión tampoco está vigente;
    // la intensidad aparece cuando el RM ya existe en la fecha de la Sesión.
    await createRecordedMax(context!, cookie, { exerciseId: fuerzaId, load: 100, repetitions: 1, date: "2025-06-01" });
    const beforeRm = await evolutionFor(fuerzaId);
    expect(beforeRm!.points[0]!.intensidadRelativaMax).toBeNull();
    expect(beforeRm!.points[0]!.date).toBe(before.datePerformed);

    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 105, repeticiones: 1 }, rpe: null },
    ], "2025-07-01");
    const after = await evolutionFor(fuerzaId);
    expect(after!.points).toHaveLength(2);
    expect(after!.points[1]!.intensidadRelativaMax).toBe(105);
  });

  test("varias apariciones del mismo Ejercicio se agregan en un único punto", async () => {
    const repsId = (await createExercise(context!, cookie, { name: "Dominadas", recordingMode: "repeticiones_sin_carga" })).id;
    const session = await startFreeSession(context!, cookie);
    const replaced = await replaceSession(context!, cookie, session, {
      revision: session.revision,
      exercises: [
        { exerciseId: repsId, series: [{ status: "completada", goal: null, result: { repeticiones: 10 }, rpe: null }] },
        { exerciseId: repsId, series: [{ status: "completada", goal: null, result: { repeticiones: 5 }, rpe: null }] },
      ],
    });
    expect(replaced.status).toBe(200);
    const withOccurrences = (replaced.body as { session: SessionDocument }).session;
    const finalized = await finalizeSession(context!, cookie, withOccurrences);

    const evolution = await evolutionFor(repsId);
    expect(evolution!.points).toEqual([
      expect.objectContaining({ sessionId: finalized.id, date: "2025-03-10", value: 15 }),
    ]);
  });

  test("corregir la Fecha realizada mueve el punto y eliminar la Sesión lo retira", async () => {
    const fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    const session = await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");

    const before = await evolutionFor(fuerzaId);
    expect(before!.points[0]).toMatchObject({ date: "2025-03-12", value: 100 });

    const corrected = await setPerformedDate(context!, cookie, session, "2025-04-01");
    const moved = await evolutionFor(fuerzaId);
    expect(moved!.points[0]).toMatchObject({ date: "2025-04-01", value: 100 });

    await deleteSession(context!, cookie, corrected);
    const afterDelete = await evolutionFor(fuerzaId);
    expect(afterDelete!.points).toEqual([]);
  });

  test("corregir el estado de una Serie crea o retira el punto de la evolución", async () => {
    const fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    const pressId = (await createExercise(context!, cookie, { name: "Press", recordingMode: "fuerza_con_carga" })).id;
    // La Sesión conserva la invariante del Historial (una Serie completada)
    // con otro Ejercicio; el Ejercicio objetivo queda sin Series completadas.
    const session = await startFreeSession(context!, cookie);
    const replaced = await replaceSession(context!, cookie, session, {
      revision: session.revision,
      exercises: [
        { exerciseId: fuerzaId, series: [{ status: "omitida", goal: { carga: 100, repeticiones: 10 }, result: null, rpe: null }] },
        { exerciseId: pressId, series: [{ status: "completada", goal: null, result: { carga: 60, repeticiones: 10 }, rpe: null }] },
      ],
    });
    expect(replaced.status).toBe(200);
    const withSeries = (replaced.body as { session: SessionDocument }).session;
    const finalized = await finalizeSession(context!, cookie, withSeries);

    // Sin Series completadas del Ejercicio no hay punto de evolución.
    const empty = await evolutionFor(fuerzaId);
    expect(empty!.points).toEqual([]);

    // Corrige la Serie omitida a completada: el punto aparece con su métrica.
    const echoed = echoSession(finalized);
    (echoed.exercises[0] as { series: SeriesInput[] }).series[0] = {
      id: (finalized.exercises[0]!.series[0]!).id,
      status: "completada",
      goal: null,
      result: { carga: 100, repeticiones: 10 },
      rpe: null,
    };
    const { status, body } = await replaceSession(context!, cookie, finalized, echoed);
    expect(status).toBe(200);

    const withPoint = await evolutionFor(fuerzaId);
    expect(withPoint!.points).toEqual([
      expect.objectContaining({ date: "2025-03-10", value: 100 }),
    ]);
  });

  test("un Ejercicio archivado conserva su evolución histórica", async () => {
    const fuerzaId = (await createExercise(context!, cookie, { name: "Sentadilla", recordingMode: "fuerza_con_carga" })).id;
    await finalizedSessionWithSeries(context!, cookie, fuerzaId, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");
    const archived = await context!.app.request(`/api/exercises/${fuerzaId}/archive`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: origin },
    });
    expect(archived.status).toBe(200);

    const evolution = await evolutionFor(fuerzaId);
    expect(evolution!.points).toHaveLength(1);
    expect(evolution!.points[0]!.value).toBe(100);
  });

  test("un Ejercicio ajeno se comporta como inexistente", async () => {
    const cookieB = await registerVerified(context!, "otra@example.com");
    const fuerzaB = await createExercise(context!, cookieB, { name: "Prensa", recordingMode: "fuerza_con_carga" });
    await finalizedSessionWithSeries(context!, cookieB, fuerzaB.id, [
      { status: "completada", goal: null, result: { carga: 100, repeticiones: 10 }, rpe: null },
    ], "2025-03-12");

    const evolution = await evolutionFor(fuerzaB.id);
    expect(evolution).toBeNull();
  });
});
