import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { loadCatalog, readCatalogAssets } from "../src/catalog/load-catalog";
import { migrateDatabase } from "../src/db/migrate";
import { openDatabase, type DatabaseConnection } from "../src/db/open-database";
import { exercise } from "../src/db/schema";
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

const customInput = {
  name: "Peso muerto rumano",
  instructions:
    "Baja la barra hasta la mitad de la espinilla manteniendo la espalda recta.",
  recordingMode: "fuerza_con_carga",
  category: "Pierna",
  bodyPart: "Isquiotibiales",
  equipment: "Barra",
} as const;

async function createCustomExercise(
  context: TestContext,
  cookie: string,
  overrides: Record<string, unknown> = {},
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request("/api/exercises", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify({ ...customInput, ...overrides }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

describe("crear Ejercicios personalizados", () => {
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

  test("crea un Ejercicio personalizado con identidad opaca y respuesta canónica", async () => {
    const { status, body } = await createCustomExercise(context!, cookie);
    expect(status).toBe(201);

    const exercise = (body as { exercise: ExerciseDocument }).exercise;
    expect(exercise.id).toMatch(/^[0-9a-f]{32}$/);
    expect(exercise.name).toBe(customInput.name);
    expect(exercise.instructions).toBe(customInput.instructions);
    expect(exercise.recordingMode).toBe("fuerza_con_carga");
    expect(exercise.category).toBe("Pierna");
    expect(exercise.bodyPart).toBe("Isquiotibiales");
    expect(exercise.equipment).toBe("Barra");
    expect(exercise.provenance).toBe("personalizado");
    expect(exercise.available).toBe(true);
  });

  test("sin sesión la creación responde 401", async () => {
    const response = await context!.app.request("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customInput),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Debes iniciar sesión para consultar los Ejercicios.",
      },
    });
  });

  test("valida nombre, instrucciones, Forma de registro y categoría", async () => {
    const missing = await createCustomExercise(context!, cookie, {
      name: "",
      instructions: "   ",
      recordingMode: "modalidad_imaginaria",
      category: "",
    });
    expect(missing.status).toBe(400);
    const error = (missing.body as { error: { code: string; fields?: Record<string, string[]> } }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.name).toBeDefined();
    expect(error.fields?.instructions).toBeDefined();
    expect(error.fields?.recordingMode).toBeDefined();
    expect(error.fields?.category).toBeDefined();

    // acceso directo solo para comprobar que la entrada inválida no persiste
    const persisted = await context!.connection.db.select().from(exercise).all();
    expect(persisted).toHaveLength(0);
  });
});

describe("editar Ejercicios personalizados", () => {
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

  async function editExercise(
    id: string,
    cookie: string,
    body: Record<string, unknown>,
  ): Promise<{ status: number; body: unknown }> {
    const response = await context!.app.request(`/api/exercises/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }

  test("renombra y edita los datos compatibles con respuesta canónica", async () => {
    const created = await createCustomExercise(context!, cookieA);
    const id = (created.body as { exercise: ExerciseDocument }).exercise.id;

    const { status, body } = await editExercise(id, cookieA, {
      name: "Peso muerto con piernas semiflexionadas",
      instructions: "Baja la barra hasta la mitad de la espinilla con la espalda neutra.",
      category: "Cadena posterior",
      equipment: null,
    });
    expect(status).toBe(200);

    const exerciseDoc = (body as { exercise: ExerciseDocument }).exercise;
    expect(exerciseDoc.id).toBe(id);
    expect(exerciseDoc.name).toBe("Peso muerto con piernas semiflexionadas");
    expect(exerciseDoc.instructions).toBe(
      "Baja la barra hasta la mitad de la espinilla con la espalda neutra.",
    );
    expect(exerciseDoc.category).toBe("Cadena posterior");
    expect(exerciseDoc.recordingMode).toBe("fuerza_con_carga");
    expect(exerciseDoc.equipment).toBeNull();
    expect(exerciseDoc.provenance).toBe("personalizado");
    expect(exerciseDoc.available).toBe(true);

    // el renombrado se refleja en la búsqueda por nombre
    const listed = (await (await context!.app.request(
      "/api/exercises?q=semiflexionadas",
      { headers: { Cookie: cookieA, Origin: origin } },
    )).json()) as { items: ExerciseDocument[] };
    expect(listed.items.map((item) => item.id)).toContain(id);
  });

  test("no permite cambiar la Forma de registro de un Ejercicio publicado", async () => {
    const created = await createCustomExercise(context!, cookieA);
    const id = (created.body as { exercise: ExerciseDocument }).exercise.id;

    const { status, body } = await editExercise(id, cookieA, {
      recordingMode: "repeticiones_sin_carga",
    });
    expect(status).toBe(409);
    expect(body).toEqual({
      error: {
        code: "RECORDING_MODE_IMMUTABLE",
        message:
          "La Forma de registro de un Ejercicio publicado o utilizado no puede cambiar.",
      },
    });

    // el Ejercicio conserva su Forma de registro
    const fetched = (await (await context!.app.request(`/api/exercises/${id}`, {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { exercise: ExerciseDocument };
    expect(fetched.exercise.recordingMode).toBe("fuerza_con_carga");
  });

  test("editar el Ejercicio personalizado de otra Cuenta responde inexistente", async () => {
    const createdB = await createCustomExercise(context!, cookieB);
    const idB = (createdB.body as { exercise: ExerciseDocument }).exercise.id;

    const { status, body } = await editExercise(idB, cookieA, { name: "Renombrado ajeno" });
    expect(status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "El Ejercicio solicitado no existe o no pertenece a tu Cuenta.",
      },
    });

    // el nombre original no cambió para su propietaria
    const fetched = (await (await context!.app.request(`/api/exercises/${idB}`, {
      headers: { Cookie: cookieB, Origin: origin },
    })).json()) as { exercise: ExerciseDocument };
    expect(fetched.exercise.name).toBe(customInput.name);
  });

  test("un Deportista no puede editar un Ejercicio del catálogo", async () => {
    const catalog = (await (await context!.app.request("/api/exercises?limit=1", {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { items: ExerciseDocument[] };
    const catalogId = catalog.items[0]!.id;

    const { status } = await editExercise(catalogId, cookieA, {
      name: "Renombrado del catálogo",
    });
    expect(status).toBe(404);
  });

  test("la edición valida la entrada y exige al menos un dato", async () => {
    const created = await createCustomExercise(context!, cookieA);
    const id = (created.body as { exercise: ExerciseDocument }).exercise.id;

    const invalid = await editExercise(id, cookieA, { name: "   " });
    expect(invalid.status).toBe(400);
    expect(
      (invalid.body as { error: { fields?: Record<string, string[]> } }).error.fields?.name,
    ).toBeDefined();

    const empty = await editExercise(id, cookieA, {});
    expect(empty.status).toBe(400);
    expect(
      (empty.body as { error: { fields?: Record<string, string[]> } }).error.fields?.form,
    ).toBeDefined();
  });

  test("sin sesión la edición responde 401", async () => {
    const created = await createCustomExercise(context!, cookieA);
    const id = (created.body as { exercise: ExerciseDocument }).exercise.id;
    const response = await context!.app.request(`/api/exercises/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Otro nombre" }),
    });
    expect(response.status).toBe(401);
  });
});

describe("archivar y restaurar Ejercicios personalizados", () => {
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

  async function transition(
    id: string,
    action: "archive" | "restore",
    cookie: string,
  ): Promise<{ status: number; body: unknown }> {
    const response = await context!.app.request(`/api/exercises/${id}/${action}`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: origin },
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }

  async function listAvailable(cookie: string): Promise<ExerciseDocument[]> {
    const response = await context!.app.request("/api/exercises?limit=50", {
      headers: { Cookie: cookie, Origin: origin },
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { items: ExerciseDocument[] }).items;
  }

  test("archivar retira el Ejercicio de los usos nuevos sin eliminar la identidad", async () => {
    const created = await createCustomExercise(context!, cookieA);
    const id = (created.body as { exercise: ExerciseDocument }).exercise.id;

    const { status, body } = await transition(id, "archive", cookieA);
    expect(status).toBe(200);
    expect((body as { exercise: ExerciseDocument }).exercise).toMatchObject({
      id,
      available: false,
      provenance: "personalizado",
    });

    // no aparece en los listados de usos nuevos
    const ids = (await listAvailable(cookieA)).map((item) => item.id);
    expect(ids).not.toContain(id);

    // la referencia existente sigue resolviéndose por su identidad
    const resolved = (await (await context!.app.request(`/api/exercises/${id}`, {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { exercise: ExerciseDocument };
    expect(resolved.exercise.id).toBe(id);
    expect(resolved.exercise.available).toBe(false);
    expect(resolved.exercise.name).toBe(customInput.name);
  });

  test("restaurar vuelve a ofrecer el Ejercicio con la misma identidad", async () => {
    const created = await createCustomExercise(context!, cookieA);
    const id = (created.body as { exercise: ExerciseDocument }).exercise.id;
    await transition(id, "archive", cookieA);

    const { status, body } = await transition(id, "restore", cookieA);
    expect(status).toBe(200);
    expect((body as { exercise: ExerciseDocument }).exercise).toMatchObject({
      id,
      available: true,
    });

    const ids = (await listAvailable(cookieA)).map((item) => item.id);
    expect(ids).toContain(id);
  });

  test("archivar y restaurar son idempotentes", async () => {
    const created = await createCustomExercise(context!, cookieA);
    const id = (created.body as { exercise: ExerciseDocument }).exercise.id;

    const first = await transition(id, "archive", cookieA);
    const second = await transition(id, "archive", cookieA);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((second.body as { exercise: ExerciseDocument }).exercise.available).toBe(false);

    await transition(id, "restore", cookieA);
    const restoredAgain = await transition(id, "restore", cookieA);
    expect(restoredAgain.status).toBe(200);
    expect((restoredAgain.body as { exercise: ExerciseDocument }).exercise.available).toBe(true);
  });

  test("no se puede archivar el Ejercicio de otra Cuenta ni el del catálogo", async () => {
    const createdB = await createCustomExercise(context!, cookieB);
    const idB = (createdB.body as { exercise: ExerciseDocument }).exercise.id;
    const foreign = await transition(idB, "archive", cookieA);
    expect(foreign.status).toBe(404);

    const catalog = (await (await context!.app.request("/api/exercises?limit=1", {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { items: ExerciseDocument[] };
    const catalogTransition = await transition(catalog.items[0]!.id, "archive", cookieA);
    expect(catalogTransition.status).toBe(404);
  });

  test("los archivados propios se listan para gestionar su restauración", async () => {
    const archived = await createCustomExercise(context!, cookieA, {
      name: "Salto de cajón",
      category: "Potencia",
    });
    const id = (archived.body as { exercise: ExerciseDocument }).exercise.id;
    await transition(id, "archive", cookieA);

    // B no ve nada de A
    const fromB = (await (await context!.app.request("/api/exercises/archived", {
      headers: { Cookie: cookieB, Origin: origin },
    })).json()) as { items: ExerciseDocument[] };
    expect(fromB.items).toHaveLength(0);

    // A ve su archivado, pero no sus disponibles ni el catálogo
    const fromA = (await (await context!.app.request("/api/exercises/archived", {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { items: ExerciseDocument[] };
    expect(fromA.items.map((item) => item.id)).toEqual([id]);
    expect(fromA.items[0]!.available).toBe(false);
    expect(fromA.items[0]!.provenance).toBe("personalizado");
  });
});

describe("aislamiento y resolución de referencias", () => {
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

  test("leer el personalizado de otra Cuenta responde como inexistente", async () => {
    const createdB = await createCustomExercise(context!, cookieB);
    const idB = (createdB.body as { exercise: ExerciseDocument }).exercise.id;

    const fromA = await context!.app.request(`/api/exercises/${idB}`, {
      headers: { Cookie: cookieA, Origin: origin },
    });
    expect(fromA.status).toBe(404);
    expect(await fromA.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "El Ejercicio solicitado no existe o no pertenece a tu Cuenta.",
      },
    });

    // el identificador que no existe produce la misma respuesta
    const unknown = await context!.app.request(
      "/api/exercises/ffffffffffffffffffffffffffffffff",
      { headers: { Cookie: cookieA, Origin: origin } },
    );
    expect(unknown.status).toBe(404);
  });

  test("dos Cuentas crean identidades distintas aunque compartan el nombre", async () => {
    const createdA = await createCustomExercise(context!, cookieA);
    const createdB = await createCustomExercise(context!, cookieB);
    const idA = (createdA.body as { exercise: ExerciseDocument }).exercise.id;
    const idB = (createdB.body as { exercise: ExerciseDocument }).exercise.id;

    expect(idA).not.toBe(idB);

    // B no puede leer el de A y viceversa
    const fromA = await context!.app.request(`/api/exercises/${idB}`, {
      headers: { Cookie: cookieA, Origin: origin },
    });
    const fromB = await context!.app.request(`/api/exercises/${idA}`, {
      headers: { Cookie: cookieB, Origin: origin },
    });
    expect(fromA.status).toBe(404);
    expect(fromB.status).toBe(404);
  });

  test("el catálogo compartido se resuelve por identidad para cualquier Cuenta", async () => {
    const catalog = (await (await context!.app.request("/api/exercises?limit=1", {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { items: ExerciseDocument[] };
    const catalogId = catalog.items[0]!.id;

    const fromA = (await (await context!.app.request(`/api/exercises/${catalogId}`, {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { exercise: ExerciseDocument };
    const fromB = (await (await context!.app.request(`/api/exercises/${catalogId}`, {
      headers: { Cookie: cookieB, Origin: origin },
    })).json()) as { exercise: ExerciseDocument };
    expect(fromA.exercise.id).toBe(catalogId);
    expect(fromA.exercise.provenance).toBe("catalogo");
    expect(fromB.exercise.id).toBe(catalogId);
  });
});

describe("listados y selectores combinados", () => {
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

  test("el listado combina catálogo y personalizados disponibles marcando la procedencia", async () => {
    const created = await createCustomExercise(context!, cookieA);
    expect(created.status).toBe(201);

    const response = await context!.app.request("/api/exercises?limit=50", {
      headers: { Cookie: cookieA, Origin: origin },
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { items: ExerciseDocument[] };

    const custom = payload.items.find((item) => item.id === (created.body as { exercise: ExerciseDocument }).exercise.id);
    expect(custom).toBeDefined();
    expect(custom?.provenance).toBe("personalizado");
    expect(payload.items.some((item) => item.provenance === "catalogo")).toBe(true);
  });

  test("el listado no expone los personalizados de otra Cuenta", async () => {
    const createdA = await createCustomExercise(context!, cookieA);
    expect(createdA.status).toBe(201);
    const createdB = await createCustomExercise(context!, cookieB, {
      name: "Dominada con lastre",
      category: "Espalda",
    });
    expect(createdB.status).toBe(201);

    const fromA = (await (await context!.app.request("/api/exercises?limit=50", {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { items: ExerciseDocument[] };
    const idsFromA = fromA.items.map((item) => item.id);
    expect(idsFromA).toContain((createdA.body as { exercise: ExerciseDocument }).exercise.id);
    expect(idsFromA).not.toContain((createdB.body as { exercise: ExerciseDocument }).exercise.id);
  });

  test("las categorías del selector incluyen las de los personalizados propios", async () => {
    await createCustomExercise(context!, cookieA, { category: "Potencia" });

    const response = await context!.app.request("/api/exercises/categories", {
      headers: { Cookie: cookieA, Origin: origin },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { categories: string[] };
    expect(body.categories).toContain("Potencia");
  });
});
