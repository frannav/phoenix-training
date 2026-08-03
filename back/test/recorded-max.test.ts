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

export type ExerciseDocument = {
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

export type RecordedMaxDocument = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  load: number;
  repetitions: number;
  date: string;
};

async function firstCatalogExercise(
  context: TestContext,
  cookie: string,
): Promise<ExerciseDocument> {
  const response = await context.app.request("/api/exercises?limit=1", {
    headers: { Cookie: cookie, Origin: origin },
  });
  expect(response.status).toBe(200);
  const payload = (await response.json()) as { items: ExerciseDocument[] };
  const item = payload.items[0];
  expect(item).toBeDefined();
  return item!;
}

async function createRecordedMax(
  context: TestContext,
  cookie: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request("/api/rms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function createCustomExercise(
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

describe("registrar RM", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let catalogExercise: ExerciseDocument;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
    catalogExercise = await firstCatalogExercise(context, cookie);
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("registra un RM con Ejercicio, carga, repeticiones y fecha", async () => {
    const { status, body } = await createRecordedMax(context!, cookie, {
      exerciseId: catalogExercise.id,
      load: 140,
      repetitions: 5,
      date: "2025-06-10",
    });
    expect(status).toBe(201);

    const rm = (body as { rm: RecordedMaxDocument }).rm;
    expect(rm.id).toMatch(/^[0-9a-f]{32}$/);
    expect(rm.exerciseId).toBe(catalogExercise.id);
    expect(rm.exerciseName).toBe(catalogExercise.name);
    expect(rm.load).toBe(140);
    expect(rm.repetitions).toBe(5);
    expect(rm.date).toBe("2025-06-10");
  });

  test("admite una carga con dos decimales y cero de mínimo", async () => {
    const { status, body } = await createRecordedMax(context!, cookie, {
      exerciseId: catalogExercise.id,
      load: 0.25,
      repetitions: 1,
      date: "2025-06-10",
    });
    expect(status).toBe(201);
    expect((body as { rm: RecordedMaxDocument }).rm.load).toBe(0.25);
  });

  test("un RM puede referenciar un Ejercicio personalizado propio", async () => {
    const custom = await createCustomExercise(context!, cookie);
    const { status, body } = await createRecordedMax(context!, cookie, {
      exerciseId: custom.id,
      load: 120,
      repetitions: 8,
      date: "2025-06-10",
    });
    expect(status).toBe(201);
    expect((body as { rm: RecordedMaxDocument }).rm).toMatchObject({
      exerciseId: custom.id,
      exerciseName: custom.name,
    });
  });

  test("sin sesión la creación responde 401", async () => {
    const response = await context!.app.request("/api/rms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exerciseId: catalogExercise.id,
        load: 140,
        repetitions: 5,
        date: "2025-06-10",
      }),
    });
    expect(response.status).toBe(401);
  });

  test("valida carga, repeticiones y fecha con mensajes explícitos", async () => {
    const response = await createRecordedMax(context!, cookie, {
      exerciseId: catalogExercise.id,
      load: -1,
      repetitions: 0,
      date: "10-06-2025",
    });
    expect(response.status).toBe(400);
    const error = (
      response.body as { error: { code: string; fields?: Record<string, string[]> } }
    ).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.load).toBeDefined();
    expect(error.fields?.repetitions).toBeDefined();
    expect(error.fields?.date).toBeDefined();
  });

  test("rechaza decimales de carga superiores a dos y cargas fuera de rango", async () => {
    const tooManyDecimals = await createRecordedMax(context!, cookie, {
      exerciseId: catalogExercise.id,
      load: 100.555,
      repetitions: 5,
      date: "2025-06-10",
    });
    expect(tooManyDecimals.status).toBe(400);
    expect(
      (
        tooManyDecimals.body as {
          error: { fields?: Record<string, string[]> };
        }
      ).error.fields?.load,
    ).toBeDefined();

    const outOfRange = await createRecordedMax(context!, cookie, {
      exerciseId: catalogExercise.id,
      load: 10000,
      repetitions: 5,
      date: "2025-06-10",
    });
    expect(outOfRange.status).toBe(400);
  });

  test("rechaza repeticiones no enteras, nulas o superiores a 9999", async () => {
    for (const repetitions of [5.5, -3, 10000]) {
      const response = await createRecordedMax(context!, cookie, {
        exerciseId: catalogExercise.id,
        load: 100,
        repetitions,
        date: "2025-06-10",
      });
      expect(response.status).toBe(400);
    }
  });

  test("rechaza fechas que no son días reales del calendario", async () => {
    const response = await createRecordedMax(context!, cookie, {
      exerciseId: catalogExercise.id,
      load: 100,
      repetitions: 5,
      date: "2025-02-30",
    });
    expect(response.status).toBe(400);
    expect(
      (
        response.body as { error: { fields?: Record<string, string[]> } }
      ).error.fields?.date,
    ).toBeDefined();
  });

  test("referenciar un Ejercicio ajeno o inexistente responde error de campo", async () => {
    const response = await createRecordedMax(context!, cookie, {
      exerciseId: "ffffffffffffffffffffffffffffffff",
      load: 100,
      repetitions: 5,
      date: "2025-06-10",
    });
    expect(response.status).toBe(400);
    expect(
      (
        response.body as { error: { fields?: Record<string, string[]> } }
      ).error.fields?.exerciseId,
    ).toBeDefined();
  });
});

describe("listar RM", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let catalogExercise: ExerciseDocument;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
    catalogExercise = await firstCatalogExercise(context, cookie);
  });

  afterEach(() => {
    context?.connection.close();
  });

  async function listRecordedMaxes(
    requestCookie: string,
  ): Promise<RecordedMaxDocument[]> {
    const response = await context!.app.request("/api/rms", {
      headers: { Cookie: requestCookie, Origin: origin },
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { items: RecordedMaxDocument[] }).items;
  }

  test("lista los RM propios con nombre de Ejercicio, carga, repeticiones y fecha", async () => {
    const first = await createRecordedMax(context!, cookie, {
      exerciseId: catalogExercise.id,
      load: 120,
      repetitions: 5,
      date: "2025-05-01",
    });
    expect(first.status).toBe(201);
    const second = await createRecordedMax(context!, cookie, {
      exerciseId: catalogExercise.id,
      load: 140,
      repetitions: 3,
      date: "2025-06-15",
    });
    expect(second.status).toBe(201);

    const items = await listRecordedMaxes(cookie);
    expect(items).toHaveLength(2);
    // el más reciente por fecha primero
    expect(items[0]).toMatchObject({ load: 140, repetitions: 3, date: "2025-06-15" });
    expect(items[1]).toMatchObject({ load: 120, repetitions: 5, date: "2025-05-01" });
    expect(items[0]!.exerciseName).toBe(catalogExercise.name);
    expect(items[1]!.exerciseName).toBe(catalogExercise.name);
  });

  test("el RM conserva el nombre del Ejercicio aunque deje de estar disponible", async () => {
    const custom = await createCustomExercise(context!, cookie);
    const created = await createRecordedMax(context!, cookie, {
      exerciseId: custom.id,
      load: 100,
      repetitions: 5,
      date: "2025-06-10",
    });
    expect(created.status).toBe(201);

    // archivar el Ejercicio personalizado: retirado de usos nuevos
    const archived = await context!.app.request(`/api/exercises/${custom.id}/archive`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: origin },
    });
    expect(archived.status).toBe(200);

    const items = await listRecordedMaxes(cookie);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      exerciseId: custom.id,
      exerciseName: custom.name,
      load: 100,
      repetitions: 5,
      date: "2025-06-10",
    });
  });

  test("sin RM registrados el listado está vacío", async () => {
    expect(await listRecordedMaxes(cookie)).toHaveLength(0);
  });
});

describe("consultar y editar RM", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let catalogExercise: ExerciseDocument;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
    catalogExercise = await firstCatalogExercise(context, cookie);
  });

  afterEach(() => {
    context?.connection.close();
  });

  async function createRm(): Promise<RecordedMaxDocument> {
    const created = await createRecordedMax(context!, cookie, {
      exerciseId: catalogExercise.id,
      load: 140,
      repetitions: 5,
      date: "2025-06-10",
    });
    expect(created.status).toBe(201);
    return (created.body as { rm: RecordedMaxDocument }).rm;
  }

  async function getRm(id: string, requestCookie: string): Promise<{ status: number; body: unknown }> {
    const response = await context!.app.request(`/api/rms/${id}`, {
      headers: { Cookie: requestCookie, Origin: origin },
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }

  async function updateRm(
    id: string,
    requestCookie: string,
    body: Record<string, unknown>,
  ): Promise<{ status: number; body: unknown }> {
    const response = await context!.app.request(`/api/rms/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: requestCookie, Origin: origin },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }

  test("consulta un RM propio por su identificador", async () => {
    const rm = await createRm();
    const { status, body } = await getRm(rm.id, cookie);
    expect(status).toBe(200);
    expect(body).toEqual({ rm });
  });

  test("edita carga, repeticiones y fecha con respuesta canónica", async () => {
    const rm = await createRm();
    const { status, body } = await updateRm(rm.id, cookie, {
      load: 142.5,
      repetitions: 4,
      date: "2025-06-12",
    });
    expect(status).toBe(200);
    expect(body).toEqual({
      rm: { ...rm, load: 142.5, repetitions: 4, date: "2025-06-12" },
    });

    // la edición se refleja en el listado
    const listed = (await (await context!.app.request("/api/rms", {
      headers: { Cookie: cookie, Origin: origin },
    })).json()) as { items: RecordedMaxDocument[] };
    expect(listed.items[0]).toMatchObject({ id: rm.id, load: 142.5, repetitions: 4, date: "2025-06-12" });
  });

  test("editar una sola magnitud conserva las demás", async () => {
    const rm = await createRm();
    const { status, body } = await updateRm(rm.id, cookie, { load: 150 });
    expect(status).toBe(200);
    expect((body as { rm: RecordedMaxDocument }).rm).toMatchObject({
      load: 150,
      repetitions: 5,
      date: "2025-06-10",
    });
  });

  test("el Ejercicio de un RM no puede cambiar", async () => {
    const rm = await createRm();
    const other = await firstCatalogExercise(context!, cookie);
    const { status, body } = await updateRm(rm.id, cookie, {
      exerciseId: other.id,
    });
    expect(status).toBe(400);
    const error = (body as { error: { code: string } }).error;
    expect(error.code).toBe("VALIDATION_ERROR");

    // el RM sigue apuntando a su Ejercicio original
    const fetched = await getRm(rm.id, cookie);
    expect((fetched.body as { rm: RecordedMaxDocument }).rm.exerciseId).toBe(
      catalogExercise.id,
    );
  });

  test("la edición valida la entrada y exige al menos un dato", async () => {
    const rm = await createRm();

    const invalid = await updateRm(rm.id, cookie, { load: -5 });
    expect(invalid.status).toBe(400);
    expect(
      (invalid.body as { error: { fields?: Record<string, string[]> } }).error.fields?.load,
    ).toBeDefined();

    const empty = await updateRm(rm.id, cookie, {});
    expect(empty.status).toBe(400);
    expect(
      (empty.body as { error: { fields?: Record<string, string[]> } }).error.fields?.form,
    ).toBeDefined();
  });

  test("consultar o editar un RM inexistente responde inexistente", async () => {
    const unknownId = "ffffffffffffffffffffffffffffffff";
    const missing = await getRm(unknownId, cookie);
    expect(missing.status).toBe(404);
    expect((missing.body as { error: { code: string } }).error.code).toBe("NOT_FOUND");

    const edited = await updateRm(unknownId, cookie, { load: 100 });
    expect(edited.status).toBe(404);
  });
});

describe("eliminar RM", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let catalogExercise: ExerciseDocument;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
    catalogExercise = await firstCatalogExercise(context, cookie);
  });

  afterEach(() => {
    context?.connection.close();
  });

  async function createRm(): Promise<RecordedMaxDocument> {
    const created = await createRecordedMax(context!, cookie, {
      exerciseId: catalogExercise.id,
      load: 140,
      repetitions: 5,
      date: "2025-06-10",
    });
    expect(created.status).toBe(201);
    return (created.body as { rm: RecordedMaxDocument }).rm;
  }

  test("elimina un RM propio y devuelve su documento canónico", async () => {
    const rm = await createRm();
    const response = await context!.app.request(`/api/rms/${rm.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: origin },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rm });

    // desaparece del listado y de la consulta directa
    const listed = (await (await context!.app.request("/api/rms", {
      headers: { Cookie: cookie, Origin: origin },
    })).json()) as { items: RecordedMaxDocument[] };
    expect(listed.items).toHaveLength(0);

    const missing = await context!.app.request(`/api/rms/${rm.id}`, {
      headers: { Cookie: cookie, Origin: origin },
    });
    expect(missing.status).toBe(404);
  });

  test("eliminar un RM inexistente responde inexistente", async () => {
    const response = await context!.app.request(
      "/api/rms/ffffffffffffffffffffffffffffffff",
      { method: "DELETE", headers: { Cookie: cookie, Origin: origin } },
    );
    expect(response.status).toBe(404);
  });
});

describe("RM vigente por Ejercicio, repeticiones y fecha", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let catalogExercise: ExerciseDocument;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
    catalogExercise = await firstCatalogExercise(context, cookie);
  });

  afterEach(() => {
    context?.connection.close();
  });

  async function createRm(overrides: Record<string, unknown> = {}): Promise<RecordedMaxDocument> {
    const created = await createRecordedMax(context!, cookie, {
      exerciseId: catalogExercise.id,
      load: 140,
      repetitions: 5,
      date: "2025-06-10",
      ...overrides,
    });
    expect(created.status).toBe(201);
    return (created.body as { rm: RecordedMaxDocument }).rm;
  }

  async function effective(
    params: Record<string, string | number>,
    requestCookie: string = cookie,
  ): Promise<{ status: number; body: unknown }> {
    const search = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).map(([key, value]) => [key, String(value)]),
      ),
    );
    const response = await context!.app.request(`/api/rms/effective?${search.toString()}`, {
      headers: { Cookie: requestCookie, Origin: origin },
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }

  test("el vigente es el registro más reciente de esa fecha o anterior", async () => {
    const older = await createRm({ load: 120, date: "2025-05-01" });
    const newer = await createRm({ load: 150, date: "2025-06-15" });

    // antes del segundo, sigue vigente el primero
    const before = await effective({ exerciseId: catalogExercise.id, repetitions: 5, date: "2025-06-10" });
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ rm: older });

    // el mismo día del segundo, gana el segundo
    const sameDay = await effective({ exerciseId: catalogExercise.id, repetitions: 5, date: "2025-06-15" });
    expect(sameDay.body).toEqual({ rm: newer });

    // después, sigue vigente el segundo
    const after = await effective({ exerciseId: catalogExercise.id, repetitions: 5, date: "2025-12-31" });
    expect(after.body).toEqual({ rm: newer });
  });

  test("antes del primer RM el resultado es null; en el futuro sigue vigente el último", async () => {
    const rm = await createRm({ date: "2025-06-10" });

    const beforeAny = await effective({ exerciseId: catalogExercise.id, repetitions: 5, date: "2025-01-01" });
    expect(beforeAny.status).toBe(200);
    expect(beforeAny.body).toEqual({ rm: null });

    // una fecha futura no invalida la marca: sigue vigente la más reciente
    const future = await effective({ exerciseId: catalogExercise.id, repetitions: 5, date: "2030-01-01" });
    expect(future.status).toBe(200);
    expect(future.body).toEqual({ rm });
  });

  test("la vigencia es específica del número de repeticiones", async () => {
    const fiveReps = await createRm({ load: 140, repetitions: 5 });
    await createRm({ load: 100, repetitions: 8, date: "2025-07-01" });

    const five = await effective({ exerciseId: catalogExercise.id, repetitions: 5, date: "2025-12-31" });
    expect(five.body).toEqual({ rm: fiveReps });

    const three = await effective({ exerciseId: catalogExercise.id, repetitions: 3, date: "2025-12-31" });
    expect(three.body).toEqual({ rm: null });
  });

  test("dos RM de la misma fecha: gana el registrado más tarde", async () => {
    await createRm({ load: 140, date: "2025-06-10" });
    const later = await createRm({ load: 145, date: "2025-06-10" });

    const result = await effective({ exerciseId: catalogExercise.id, repetitions: 5, date: "2025-06-10" });
    expect(result.body).toEqual({ rm: later });
  });

  test("editar la fecha mueve la ventana de vigencia", async () => {
    const first = await createRm({ load: 120, date: "2025-05-01" });
    await createRm({ load: 150, date: "2025-06-15" });

    // traslada el primero a después del segundo
    const edited = await context!.app.request(`/api/rms/${first.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({ date: "2025-07-01" }),
    });
    expect(edited.status).toBe(200);

    const result = await effective({ exerciseId: catalogExercise.id, repetitions: 5, date: "2025-12-31" });
    expect((result.body as { rm: RecordedMaxDocument }).rm).toMatchObject({
      id: first.id,
      load: 120,
    });
  });

  test("la vigencia funciona con un Ejercicio personalizado archivado", async () => {
    const custom = await createCustomExercise(context!, cookie);
    await createRecordedMax(context!, cookie, {
      exerciseId: custom.id,
      load: 100,
      repetitions: 5,
      date: "2025-06-10",
    });
    await context!.app.request(`/api/exercises/${custom.id}/archive`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: origin },
    });

    const result = await effective({ exerciseId: custom.id, repetitions: 5, date: "2025-12-31" });
    expect(result.status).toBe(200);
    expect((result.body as { rm: RecordedMaxDocument }).rm).toMatchObject({
      exerciseId: custom.id,
      exerciseName: custom.name,
    });
  });

  test("la vigencia valida sus parámetros de consulta", async () => {
    const invalid = await effective({ exerciseId: catalogExercise.id, repetitions: 0, date: "2025-06-10" });
    expect(invalid.status).toBe(400);

    const badDate = await effective({ exerciseId: catalogExercise.id, repetitions: 5, date: "10-06-2025" });
    expect(badDate.status).toBe(400);
  });
});

describe("aislamiento entre Cuentas", () => {
  let context: TestContext | undefined;
  let cookieA: string;
  let cookieB: string;
  let catalogExercise: ExerciseDocument;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookieA = await registerVerified(context, "a@example.com");
    cookieB = await registerVerified(context, "b@example.com");
    catalogExercise = await firstCatalogExercise(context, cookieA);
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("otra Cuenta no puede leer, editar ni eliminar un RM ajeno", async () => {
    const created = await createRecordedMax(context!, cookieA, {
      exerciseId: catalogExercise.id,
      load: 140,
      repetitions: 5,
      date: "2025-06-10",
    });
    expect(created.status).toBe(201);
    const rm = (created.body as { rm: RecordedMaxDocument }).rm;

    const read = await context!.app.request(`/api/rms/${rm.id}`, {
      headers: { Cookie: cookieB, Origin: origin },
    });
    expect(read.status).toBe(404);

    const edit = await context!.app.request(`/api/rms/${rm.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookieB, Origin: origin },
      body: JSON.stringify({ load: 200 }),
    });
    expect(edit.status).toBe(404);

    const remove = await context!.app.request(`/api/rms/${rm.id}`, {
      method: "DELETE",
      headers: { Cookie: cookieB, Origin: origin },
    });
    expect(remove.status).toBe(404);

    // la propietaria conserva el RM intacto
    const own = (await (await context!.app.request(`/api/rms/${rm.id}`, {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { rm: RecordedMaxDocument };
    expect(own.rm).toMatchObject({ id: rm.id, load: 140 });
  });

  test("el listado y la vigencia no exponen RM ajenos", async () => {
    await createRecordedMax(context!, cookieA, {
      exerciseId: catalogExercise.id,
      load: 140,
      repetitions: 5,
      date: "2025-06-10",
    });

    const fromB = (await (await context!.app.request("/api/rms", {
      headers: { Cookie: cookieB, Origin: origin },
    })).json()) as { items: RecordedMaxDocument[] };
    expect(fromB.items).toHaveLength(0);

    const effectiveForB = await context!.app.request(
      `/api/rms/effective?exerciseId=${catalogExercise.id}&repetitions=5&date=2025-12-31`,
      { headers: { Cookie: cookieB, Origin: origin } },
    );
    expect(effectiveForB.status).toBe(200);
    expect(await effectiveForB.json()).toEqual({ rm: null });
  });

  test("no se puede registrar un RM para un Ejercicio personalizado ajeno", async () => {
    const customB = await createCustomExercise(context!, cookieB);
    const { status, body } = await createRecordedMax(context!, cookieA, {
      exerciseId: customB.id,
      load: 100,
      repetitions: 5,
      date: "2025-06-10",
    });
    expect(status).toBe(400);
    expect(
      (body as { error: { fields?: Record<string, string[]> } }).error.fields?.exerciseId,
    ).toBeDefined();

    // la vigencia con el Ejercicio ajeno responde como inexistente
    const effectiveForA = await context!.app.request(
      `/api/rms/effective?exerciseId=${customB.id}&repetitions=5&date=2025-12-31`,
      { headers: { Cookie: cookieA, Origin: origin } },
    );
    expect(effectiveForA.status).toBe(404);
  });
});
