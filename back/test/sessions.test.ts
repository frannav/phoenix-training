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
};

export type SessionDocument = {
  id: string;
  revision: number;
  origin: "libre";
  status: "activa";
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
  body: { revision: number; exercises: { id?: string; exerciseId: string }[] },
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request(`/api/sessions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function catalogExerciseId(context: TestContext, cookie: string): Promise<string> {
  const response = await context.app.request("/api/exercises?limit=1", {
    headers: { Cookie: cookie, Origin: origin },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { items: { id: string; provenance: string }[] };
  const item = body.items.find((entry) => entry.provenance === "catalogo");
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
      exercises: [{ exerciseId }],
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
      exercises: [{ exerciseId }],
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
      exercises: [{ exerciseId }],
    });
    const first = (added.body as { session: SessionDocument }).session;
    const occurrenceId = first.exercises[0]!.id;

    const second = await replaceSession(context!, cookie, session.id, {
      revision: first.revision,
      exercises: [{ id: occurrenceId, exerciseId }, { exerciseId }],
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
      exercises: [{ exerciseId: "ffffffffffffffffffffffffffffffff" }],
    });
    expect(unknown.status).toBe(400);
    const error = (unknown.body as {
      error: { code: string; fields?: Record<string, string[]> };
    }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.exercises).toBeDefined();
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
      exercises: [{ exerciseId }],
    });
    expect(first.status).toBe(200);

    // repetición de la escritura con la revisión anterior: conflicto recuperable
    const stale = await replaceSession(context!, cookie, session.id, {
      revision: session.revision,
      exercises: [{ exerciseId }, { exerciseId }],
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
      exercises: [{ id: after.exercises[0]!.id, exerciseId }, { exerciseId }],
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
