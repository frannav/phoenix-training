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
  exercise: {
    id: string;
    name: string;
    recordingMode: string;
    provenance: "catalogo" | "personalizado";
  };
  series: SeriesDocument[];
};

export type SessionDocument = {
  id: string;
  revision: number;
  origin: "libre";
  status: "activa" | "finalizada";
  datePerformed: string;
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

async function startFreeSession(
  context: TestContext,
  cookie: string,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({ origin: "libre" }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
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

  test("rechaza un origen todavía no disponible", async () => {
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
    expect(error.error.fields?.origin).toBeDefined();
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
    expect((stale.body as { error: { code: string } }).error.code).toBe("REVISION_CONFLICT");

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
    expect((stale.body as { error: { code: string } }).error.code).toBe("REVISION_CONFLICT");

    const active = await getActiveSession(context!, cookie);
    const after = (active.body as { session: SessionDocument }).session;
    expect(after.id).toBe(session.id);
    expect(after.revision).toBe(session.revision);

    // con la revisión vigente elimina
    const ok = await deleteSessionRequest(context!, cookie, session.id, after.revision);
    expect(ok.status).toBe(200);
  });

  test("una Sesión ya finalizada no puede eliminarse por este canal", async () => {
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
    expect(status).toBe(409);
    expect((body as { error: { code: string } }).error.code).toBe("SESSION_NOT_ACTIVE");
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
