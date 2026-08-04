import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { loadCatalog, readCatalogAssets } from "../src/catalog/load-catalog";
import { migrateDatabase } from "../src/db/migrate";
import { openDatabase, type DatabaseConnection } from "../src/db/open-database";
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

type RequestOptions = {
  method?: string;
  cookie?: string;
  body?: unknown;
};

type RequestResult = {
  status: number;
  body: unknown;
  setCookies: string[];
};

async function request(
  context: TestContext,
  path: string,
  { method = "GET", cookie, body }: RequestOptions = {},
): Promise<RequestResult> {
  const headers: Record<string, string> = { Origin: origin };
  if (cookie) {
    headers.Cookie = cookie;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await context.app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const parsed = contentType.includes("application/json")
    ? ((await response.json()) as unknown)
    : null;
  return { status: response.status, body: parsed, setCookies: response.headers.getSetCookie() };
}

async function registerVerified(
  context: TestContext,
  email: string,
  password = "contraseña-segura",
): Promise<string> {
  const registered = await request(context, "/api/auth/sign-up/email", {
    method: "POST",
    body: { name: "Deportista", email, password },
  });
  expect(registered.status).toBe(200);
  const sent = context.sentEmails.at(-1);
  expect(sent).toBeDefined();
  const verified = await request(
    context,
    `/api/auth/verify-email?token=${tokenFromUrl(sent!.url)}`,
  );
  expect(verified.status).toBe(302);

  const session = await request(context, "/api/auth/sign-in/email", {
    method: "POST",
    body: { email, password },
  });
  expect(session.status).toBe(200);
  const cookie = session.setCookies
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

/** Ejercicio del catálogo de fuerza con carga, servido por la API. */
async function catalogExerciseId(context: TestContext, cookie: string): Promise<string> {
  const response = await request(context, "/api/exercises?limit=50", { cookie });
  expect(response.status).toBe(200);
  const items = (response.body as {
    items: { id: string; provenance: string; recordingMode: string }[];
  }).items;
  const item = items.find(
    (entry) => entry.provenance === "catalogo" && entry.recordingMode === "fuerza_con_carga",
  );
  expect(item).toBeDefined();
  return item!.id;
}

async function createCustomExercise(context: TestContext, cookie: string): Promise<string> {
  const response = await request(context, "/api/exercises", {
    method: "POST",
    cookie,
    body: {
      name: "Fondos en paralelas",
      instructions: "Baja el cuerpo hasta que los hombros queden a la altura de los codos.",
      recordingMode: "fuerza_con_carga",
      category: "Pecho",
      bodyPart: "Pecho",
      equipment: "Paralelas",
    },
  });
  expect(response.status).toBe(201);
  return (response.body as { exercise: { id: string } }).exercise.id;
}

async function createRecordedMax(
  context: TestContext,
  cookie: string,
  exerciseId: string,
): Promise<string> {
  const response = await request(context, "/api/rms", {
    method: "POST",
    cookie,
    body: { exerciseId, load: 120, repetitions: 5, date: "2026-01-05" },
  });
  expect(response.status).toBe(201);
  return (response.body as { rm: { id: string } }).rm.id;
}

type RoutineSummary = { id: string; revision: number };

async function createRoutine(
  context: TestContext,
  cookie: string,
  exerciseId: string,
): Promise<RoutineSummary> {
  const response = await request(context, "/api/routines", {
    method: "POST",
    cookie,
    body: {
      name: "Empuje",
      exercises: [
        {
          exerciseId,
          series: [{ carga: 80, repeticiones: 10 }],
        },
      ],
    },
  });
  expect(response.status).toBe(201);
  const routine = (response.body as { routine: RoutineSummary }).routine;
  return { id: routine.id, revision: routine.revision };
}

type PlanFixture = {
  id: string;
  revision: number;
  trainingId: string;
};

async function createActivatedPlan(
  context: TestContext,
  cookie: string,
  exerciseId: string,
): Promise<PlanFixture> {
  const created = await request(context, "/api/plans", {
    method: "POST",
    cookie,
    body: {
      name: "Plan de fuerza",
      weeks: [
        {
          trainings: [
            {
              day: 0,
              source: "especifico",
              specific: [{ exerciseId, series: [{ carga: 80, repeticiones: 10 }] }],
            },
          ],
        },
      ],
    },
  });
  expect(created.status).toBe(201);
  const plan = (created.body as {
    plan: {
      id: string;
      revision: number;
      weeks: { trainings: { id: string }[] }[];
    };
  }).plan;
  const activated = await request(context, `/api/plans/${plan.id}/activate`, {
    method: "POST",
    cookie,
    body: { revision: plan.revision, startDate: "2026-01-05" },
  });
  expect(activated.status).toBe(200);
  const activePlan = (activated.body as {
    plan: { id: string; revision: number; weeks: { trainings: { id: string }[] }[] };
  }).plan;
  return {
    id: activePlan.id,
    revision: activePlan.revision,
    trainingId: activePlan.weeks[0]!.trainings[0]!.id,
  };
}

type SessionDocument = {
  id: string;
  revision: number;
  origin: string;
  status: string;
  exercises: {
    id: string;
    exerciseId: string;
    series: { id: string; status: string; goal: { carga: number | null; repeticiones: number | null; duracion: number | null } | null }[];
  }[];
};

async function finalizePlanSession(
  context: TestContext,
  cookie: string,
  plan: PlanFixture,
): Promise<SessionDocument> {
  const started = await request(context, "/api/sessions", {
    method: "POST",
    cookie,
    body: { origin: "plan", planId: plan.id, trainingId: plan.trainingId },
  });
  expect(started.status).toBe(201);
  const session = (started.body as { session: SessionDocument }).session;
  const occurrence = session.exercises[0]!;

  const completed = await request(context, `/api/sessions/${session.id}`, {
    method: "PUT",
    cookie,
    body: {
      revision: session.revision,
      exercises: [
        {
          id: occurrence.id,
          exerciseId: occurrence.exerciseId,
          series: [
            {
              id: occurrence.series[0]!.id,
              status: "completada",
              goal: occurrence.series[0]?.goal ?? null,
              result: { carga: 80, repeticiones: 10 },
              rpe: 8,
            },
          ],
        },
      ],
    },
  });
  expect(completed.status).toBe(200);
  const updated = (completed.body as { session: SessionDocument }).session;

  const finalized = await request(context, `/api/sessions/${session.id}/finalize`, {
    method: "POST",
    cookie,
    body: { revision: updated.revision },
  });
  expect(finalized.status).toBe(200);
  return (finalized.body as { session: SessionDocument }).session;
}

async function startActiveSession(
  context: TestContext,
  cookie: string,
): Promise<SessionDocument> {
  const started = await request(context, "/api/sessions", {
    method: "POST",
    cookie,
    body: { origin: "libre" },
  });
  expect(started.status).toBe(201);
  return (started.body as { session: SessionDocument }).session;
}

async function deleteAccount(
  context: TestContext,
  cookie: string,
  body: unknown,
): Promise<RequestResult> {
  return request(context, "/api/account", { method: "DELETE", cookie, body });
}

describe("eliminación definitiva de una Cuenta", () => {
  let context: TestContext | undefined;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("la acción exige una Cuenta autenticada", async () => {
    const outcome = await request(context!, "/api/account", {
      method: "DELETE",
      body: { password: "contraseña-segura", confirmed: true },
    });

    expect(outcome.status).toBe(401);
    expect(outcome.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  test("una contraseña o una confirmación ausente no elimina ni modifica ningún dato", async () => {
    const cookie = await registerVerified(context!, "deportista@example.com");
    const exerciseId = await createCustomExercise(context!, cookie);

    const attempts = [
      {},
      { password: "contraseña-segura" },
      { password: "", confirmed: true },
      { password: "contraseña-segura", confirmed: false },
    ];
    for (const body of attempts) {
      const outcome = await deleteAccount(context!, cookie, body);
      expect(outcome.status).toBe(400);
      expect(outcome.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    }

    const session = await request(context!, "/api/auth/get-session", { cookie });
    expect(session.body).toMatchObject({
      user: { email: "deportista@example.com", emailVerified: true },
    });
    const list = await request(context!, "/api/exercises?limit=50", { cookie });
    expect(list.status).toBe(200);
    expect(
      (list.body as { items: { id: string }[] }).items.some((item) => item.id === exerciseId),
    ).toBe(true);
  });

  test("una contraseña incorrecta no elimina ni modifica ningún dato", async () => {
    const cookie = await registerVerified(context!, "deportista@example.com");
    const exerciseId = await createCustomExercise(context!, cookie);

    const outcome = await deleteAccount(context!, cookie, {
      password: "contraseña-equivocada",
      confirmed: true,
    });

    expect(outcome.status).toBe(400);
    expect(outcome.body).toMatchObject({ error: { code: "INVALID_PASSWORD" } });

    const session = await request(context!, "/api/auth/get-session", { cookie });
    expect(session.body).toMatchObject({
      user: { email: "deportista@example.com", emailVerified: true },
    });
    const list = await request(context!, "/api/exercises?limit=50", { cookie });
    expect(
      (list.body as { items: { id: string }[] }).items.some((item) => item.id === exerciseId),
    ).toBe(true);
    const signIn = await request(context!, "/api/auth/sign-in/email", {
      method: "POST",
      body: { email: "deportista@example.com", password: "contraseña-segura" },
    });
    expect(signIn.status).toBe(200);
  });

  test("una única operación elimina credenciales, sesiones y todos los datos privados", async () => {
    const cookie = await registerVerified(context!, "deportista@example.com");
    const catalogId = await catalogExerciseId(context!, cookie);
    const customId = await createCustomExercise(context!, cookie);
    await createRecordedMax(context!, cookie, catalogId);
    const routine = await createRoutine(context!, cookie, customId);
    const plan = await createActivatedPlan(context!, cookie, catalogId);
    const finalized = await finalizePlanSession(context!, cookie, plan);
    const active = await startActiveSession(context!, cookie);

    // Evidencia previa: todos los agregados privados existen.
    const routines = await request(context!, "/api/routines", { cookie });
    expect(routines.body).toMatchObject({
      items: [expect.objectContaining({ id: routine.id })],
    });
    const plans = await request(context!, "/api/plans", { cookie });
    expect(plans.body).toMatchObject({ items: [expect.objectContaining({ id: plan.id })] });
    const activeSession = await request(context!, "/api/sessions/active", { cookie });
    expect(activeSession.body).toMatchObject({
      session: expect.objectContaining({ id: active.id, status: "activa" }),
    });
    const history = await request(context!, "/api/sessions", { cookie });
    expect(history.body).toMatchObject({
      items: [expect.objectContaining({ id: finalized.id })],
    });
    const rms = await request(context!, "/api/rms", { cookie });
    expect(rms.body).toMatchObject({ items: [expect.any(Object)] });

    const outcome = await deleteAccount(context!, cookie, {
      password: "contraseña-segura",
      confirmed: true,
    });

    expect(outcome.status).toBe(200);
    expect(outcome.body).toEqual({ status: true });
    // La cookie local se elimina: la respuesta expira la cookie de sesión.
    const clearing = outcome.setCookies.find((entry) =>
      entry.startsWith("better-auth.session_token="),
    );
    expect(clearing).toBeDefined();
    expect(clearing).toContain("Max-Age=0");

    // La sesión revocada ya no existe y el acceso posterior exige otra Cuenta.
    const session = await request(context!, "/api/auth/get-session", { cookie });
    expect(session.body).toBeNull();
    expect((await request(context!, "/api/routines", { cookie })).status).toBe(401);
    const oldSignIn = await request(context!, "/api/auth/sign-in/email", {
      method: "POST",
      body: { email: "deportista@example.com", password: "contraseña-segura" },
    });
    expect(oldSignIn.status).toBe(401);
    const reRegister = await request(context!, "/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Deportista", email: "deportista@example.com", password: "contraseña-segura" },
    });
    expect(reRegister.status).toBe(200);
  });

  test("la eliminación revoca también las demás sesiones de la Cuenta", async () => {
    const cookieA = await registerVerified(context!, "deportista@example.com");
    const deviceB = await request(context!, "/api/auth/sign-in/email", {
      method: "POST",
      body: { email: "deportista@example.com", password: "contraseña-segura" },
    });
    const cookieB = deviceB.setCookies
      .map((entry: string) => entry.split(";")[0])
      .filter((entry): entry is string => entry !== undefined)
      .find((entry) => entry.startsWith("better-auth.session_token="));
    expect(cookieB).toBeDefined();

    const outcome = await deleteAccount(context!, cookieA, {
      password: "contraseña-segura",
      confirmed: true,
    });
    expect(outcome.status).toBe(200);

    expect((await request(context!, "/api/auth/get-session", { cookie: cookieA })).body).toBeNull();
    expect((await request(context!, "/api/auth/get-session", { cookie: cookieB! })).body).toBeNull();
  });

  test("los Ejercicios del catálogo y los datos privados de otra Cuenta permanecen intactos", async () => {
    const cookieA = await registerVerified(context!, "a@example.com");
    const cookieB = await registerVerified(context!, "b@example.com");
    const catalogId = await catalogExerciseId(context!, cookieA);
    const customA = await createCustomExercise(context!, cookieA);
    await createRecordedMax(context!, cookieA, catalogId);
    await createRoutine(context!, cookieA, customA);
    const customB = await createCustomExercise(context!, cookieB);
    await createRecordedMax(context!, cookieB, catalogId);

    const outcome = await deleteAccount(context!, cookieA, {
      password: "contraseña-segura",
      confirmed: true,
    });
    expect(outcome.status).toBe(200);

    // La Cuenta B conserva su sesión, sus datos privados y el catálogo.
    const sessionB = await request(context!, "/api/auth/get-session", { cookie: cookieB });
    expect(sessionB.body).toMatchObject({ user: { email: "b@example.com" } });
    const exercisesB = await request(context!, "/api/exercises?limit=50", { cookie: cookieB });
    const items = (exercisesB.body as {
      items: { id: string; provenance: string }[];
    }).items;
    expect(items.some((item) => item.id === customB && item.provenance === "personalizado")).toBe(
      true,
    );
    expect(items.some((item) => item.id === catalogId && item.provenance === "catalogo")).toBe(
      true,
    );
    const rmsB = await request(context!, "/api/rms", { cookie: cookieB });
    expect(rmsB.body).toMatchObject({ items: [expect.any(Object)] });
  });

  test("un fallo en cualquier parte revierte la transacción y conserva la Cuenta utilizable", async () => {
    const cookie = await registerVerified(context!, "deportista@example.com");
    const catalogId = await catalogExerciseId(context!, cookie);
    const customId = await createCustomExercise(context!, cookie);
    await createRecordedMax(context!, cookie, catalogId);
    const routine = await createRoutine(context!, cookie, customId);
    const plan = await createActivatedPlan(context!, cookie, catalogId);
    const finalized = await finalizePlanSession(context!, cookie, plan);

    // Inyecta un fallo en mitad de la transacción: cualquier borrado de una
    // Sesión aborta, simulando un error de persistencia después de borrar
    // otros agregados (Series y apariciones ya eliminadas en ese punto).
    context!.connection.db.run(`
      CREATE TRIGGER fail_account_deletion
      BEFORE DELETE ON training_session
      BEGIN
        SELECT RAISE(ABORT, 'fallo inyectado');
      END
    `);

    const outcome = await deleteAccount(context!, cookie, {
      password: "contraseña-segura",
      confirmed: true,
    });
    expect(outcome.status).toBe(500);

    context!.connection.db.run("DROP TRIGGER fail_account_deletion");

    // La Cuenta sigue utilizable y conserva todos sus datos.
    const session = await request(context!, "/api/auth/get-session", { cookie });
    expect(session.body).toMatchObject({
      user: { email: "deportista@example.com", emailVerified: true },
    });
    const routines = await request(context!, "/api/routines", { cookie });
    expect(routines.body).toMatchObject({
      items: [expect.objectContaining({ id: routine.id })],
    });
    const plans = await request(context!, "/api/plans", { cookie });
    expect(plans.body).toMatchObject({ items: [expect.objectContaining({ id: plan.id })] });
    const history = await request(context!, "/api/sessions", { cookie });
    expect(history.body).toMatchObject({
      items: [expect.objectContaining({ id: finalized.id })],
    });
    const exercises = await request(context!, "/api/exercises?limit=50", { cookie });
    expect(
      (exercises.body as { items: { id: string }[] }).items.some((item) => item.id === customId),
    ).toBe(true);
    const rms = await request(context!, "/api/rms", { cookie });
    expect(rms.body).toMatchObject({ items: [expect.any(Object)] });
    const signIn = await request(context!, "/api/auth/sign-in/email", {
      method: "POST",
      body: { email: "deportista@example.com", password: "contraseña-segura" },
    });
    expect(signIn.status).toBe(200);

    // Una vez reparado el fallo, la eliminación completa sí se aplica.
    const retry = await deleteAccount(context!, cookie, {
      password: "contraseña-segura",
      confirmed: true,
    });
    expect(retry.status).toBe(200);
    expect((await request(context!, "/api/auth/get-session", { cookie })).body).toBeNull();
  });
});
