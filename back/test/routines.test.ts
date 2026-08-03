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

export type ExerciseItem = {
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

export type RoutineDocument = {
  id: string;
  name: string;
  revision: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  exercises: RoutineExerciseDocument[];
};

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
  series: RoutineSeriesGoalDocument[];
};

export type RoutineSeriesGoalDocument = {
  id: string;
  order: number;
  carga: number | null;
  repeticiones: number | null;
  duracion: number | null;
};

async function exerciseOfMode(
  context: TestContext,
  cookie: string,
  recordingMode: string,
): Promise<ExerciseItem> {
  const response = await context.app.request(
    `/api/exercises?recordingMode=${recordingMode}&limit=1`,
    { headers: { Cookie: cookie, Origin: origin } },
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { items: ExerciseItem[] };
  expect(body.items.length).toBeGreaterThan(0);
  return body.items[0]!;
}

type SeriesInput = {
  id?: string;
  carga?: number | null;
  repeticiones?: number | null;
  duracion?: number | null;
};

type RoutineExerciseInput = {
  id?: string;
  exerciseId: string;
  series: SeriesInput[];
};

function routinePayload(
  exerciseInputs: RoutineExerciseInput[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: "Torso completo",
    exercises: exerciseInputs,
    ...overrides,
  };
}

async function createRoutine(
  context: TestContext,
  cookie: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const response = await context.app.request("/api/routines", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

describe("crear Rutinas", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let press: ExerciseItem;
  let dominada: ExerciseItem;
  let trote: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
    press = await exerciseOfMode(context, cookie, "fuerza_con_carga");
    dominada = await exerciseOfMode(context, cookie, "repeticiones_sin_carga");
    trote = await exerciseOfMode(context, cookie, "cardio_continuo");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("crea una Rutina con Ejercicios ordenados, Series previstas y Objetivos de serie", async () => {
    const { status, body } = await createRoutine(
      context!,
      cookie,
      routinePayload([
        {
          exerciseId: press.id,
          series: [{ carga: 60, repeticiones: 10 }, { repeticiones: 8 }],
        },
        { exerciseId: dominada.id, series: [{ repeticiones: 6 }] },
        { exerciseId: trote.id, series: [{ duracion: 1800 }] },
      ]),
    );
    expect(status).toBe(201);

    const routine = (body as { routine: RoutineDocument }).routine;
    expect(routine.id).toMatch(/^[0-9a-f]{32}$/);
    expect(routine.name).toBe("Torso completo");
    expect(routine.revision).toBe(1);
    expect(routine.archived).toBe(false);
    expect(typeof routine.createdAt).toBe("string");
    expect(typeof routine.updatedAt).toBe("string");

    expect(routine.exercises).toHaveLength(3);
    const first = routine.exercises[0]!;
    expect(first.exerciseId).toBe(press.id);
    expect(first.order).toBe(0);
    expect(first.id).toMatch(/^[0-9a-f]{32}$/);
    expect(first.exercise).toMatchObject({
      id: press.id,
      name: press.name,
      recordingMode: "fuerza_con_carga",
      available: true,
      provenance: "catalogo",
    });
    expect(first.series).toHaveLength(2);
    expect(first.series[0]).toMatchObject({ order: 0, carga: 60, repeticiones: 10 });
    expect(first.series[1]).toMatchObject({ order: 1, carga: null, repeticiones: 8 });
    expect(first.series[0]!.id).toMatch(/^[0-9a-f]{32}$/);

    // el cardio continuo conserva una única Serie por aparición
    const cardio = routine.exercises[2]!;
    expect(cardio.series).toHaveLength(1);
    expect(cardio.series[0]).toMatchObject({ duracion: 1800, carga: null, repeticiones: null });
  });

  test("sin sesión la creación responde 401", async () => {
    const response = await context!.app.request("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(routinePayload([])),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Debes iniciar sesión para consultar las Rutinas.",
      },
    });
  });

  test("valida el nombre de la Rutina", async () => {
    const { status, body } = await createRoutine(
      context!,
      cookie,
      routinePayload([{ exerciseId: press.id, series: [{ repeticiones: 10 }] }], {
        name: "   ",
      }),
    );
    expect(status).toBe(400);
    const error = (body as { error: { code: string; fields?: Record<string, string[]> } }).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fields?.name).toBeDefined();
  });
});

describe("validación del agregado de Rutinas", () => {
  let context: TestContext | undefined;
  let cookieA: string;
  let cookieB: string;
  let press: ExerciseItem;
  let dominada: ExerciseItem;
  let plancha: ExerciseItem;
  let trote: ExerciseItem;
  let custom: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookieA = await registerVerified(context, "a@example.com");
    cookieB = await registerVerified(context, "b@example.com");
    press = await exerciseOfMode(context, cookieA, "fuerza_con_carga");
    dominada = await exerciseOfMode(context, cookieA, "repeticiones_sin_carga");
    plancha = await exerciseOfMode(context, cookieA, "tiempo_por_serie");
    trote = await exerciseOfMode(context, cookieA, "cardio_continuo");

    const created = await context.app.request("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieA, Origin: origin },
      body: JSON.stringify({
        name: "Peso muerto con mancuerna",
        instructions: "Extiende la cadera manteniendo la espalda neutra.",
        recordingMode: "fuerza_con_carga",
        category: "Espalda",
      }),
    });
    custom = ((await created.json()) as { exercise: ExerciseItem }).exercise;
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("cada Ejercicio respeta su Forma de registro y la cardinalidad de Series", async () => {
    // cardio continuo con dos Series: una por aparición
    const cardioWithTwo = await createRoutine(
      context!,
      cookieA,
      routinePayload([
        { exerciseId: trote.id, series: [{ duracion: 1800 }, { duracion: 1800 }] },
      ]),
    );
    expect(cardioWithTwo.status).toBe(400);
    expect(
      (cardioWithTwo.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].series"
      ],
    ).toBeDefined();

    // un Ejercicio sin Series previstas
    const withoutSeries = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [] }]),
    );
    expect(withoutSeries.status).toBe(400);
    expect(
      (withoutSeries.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].series"
      ],
    ).toBeDefined();

    // la duración no es un objetivo de la fuerza con carga
    const badTarget = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ duracion: 600 }] }]),
    );
    expect(badTarget.status).toBe(400);
    expect(
      (badTarget.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].series[0].duracion"
      ],
    ).toBeDefined();

    // las repeticiones no son un objetivo del cardio continuo
    const badCardioTarget = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: trote.id, series: [{ repeticiones: 10 }] }]),
    );
    expect(badCardioTarget.status).toBe(400);
    expect(
      (badCardioTarget.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].series[0].repeticiones"
      ],
    ).toBeDefined();
  });

  test("los objetivos se omiten de manera independiente y cumplen sus límites", async () => {
    // cada objetivo puede faltar por separado
    const partial = await createRoutine(
      context!,
      cookieA,
      routinePayload([
        { exerciseId: press.id, series: [{ carga: 60 }, { repeticiones: 8 }, {}] },
      ]),
    );
    expect(partial.status).toBe(201);
    const routine = (partial.body as { routine: RoutineDocument }).routine;
    expect(routine.exercises[0]!.series).toEqual([
      expect.objectContaining({ carga: 60, repeticiones: null }),
      expect.objectContaining({ carga: null, repeticiones: 8 }),
      expect.objectContaining({ carga: null, repeticiones: null }),
    ]);

    // la carga admite de 0 a 9999,99 con dos decimales como máximo
    const tooHeavy = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ carga: 10000 }] }]),
    );
    expect(tooHeavy.status).toBe(400);
    const threeDecimals = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ carga: 60.123 }] }]),
    );
    expect(threeDecimals.status).toBe(400);
    expect(
      (threeDecimals.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].series[0].carga"
      ],
    ).toBeDefined();
    const zeroLoad = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ carga: 0, repeticiones: 10 }] }]),
    );
    expect(zeroLoad.status).toBe(201);

    // las repeticiones admiten enteros de 1 a 9999
    const noReps = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: dominada.id, series: [{ repeticiones: 0 }] }]),
    );
    expect(noReps.status).toBe(400);
    const manyReps = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: dominada.id, series: [{ repeticiones: 10000 }] }]),
    );
    expect(manyReps.status).toBe(400);
    const maxReps = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: dominada.id, series: [{ repeticiones: 9999 }] }]),
    );
    expect(maxReps.status).toBe(201);

    // la duración admite enteros de 1 a 359999 segundos
    const noTime = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: plancha.id, series: [{ duracion: 0 }] }]),
    );
    expect(noTime.status).toBe(400);
    const tooLong = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: trote.id, series: [{ duracion: 360000 }] }]),
    );
    expect(tooLong.status).toBe(400);
    const maxTime = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: trote.id, series: [{ duracion: 359999 }] }]),
    );
    expect(maxTime.status).toBe(201);
  });

  test("un Ejercicio inexistente, ajeno o no disponible no entra en una Rutina nueva", async () => {
    // identidad inexistente
    const unknown = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: "ffffffffffffffffffffffffffffffff", series: [{ repeticiones: 10 }] }]),
    );
    expect(unknown.status).toBe(400);
    expect(
      (unknown.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].exerciseId"
      ],
    ).toBeDefined();

    // personalizado de la otra Cuenta: se comporta como inexistente
    const createdB = await context!.app.request("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieB, Origin: origin },
      body: JSON.stringify({
        name: "Curl martillo",
        instructions: "Flexiona el codo con la palma mirando al cuerpo.",
        recordingMode: "fuerza_con_carga",
        category: "Brazos",
      }),
    });
    const foreignId = ((await createdB.json()) as { exercise: ExerciseItem }).exercise.id;
    const foreign = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: foreignId, series: [{ repeticiones: 10 }] }]),
    );
    expect(foreign.status).toBe(400);
    expect(
      (foreign.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].exerciseId"
      ],
    ).toBeDefined();

    // archivado: retirado de los usos nuevos
    await context!.app.request(`/api/exercises/${custom.id}/archive`, {
      method: "POST",
      headers: { Cookie: cookieA, Origin: origin },
    });
    const archived = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: custom.id, series: [{ repeticiones: 10 }] }]),
    );
    expect(archived.status).toBe(400);
    expect(
      (archived.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].exerciseId"
      ],
    ).toBeDefined();
  });
});

describe("editar Rutinas con concurrencia optimista", () => {
  let context: TestContext | undefined;
  let cookieA: string;
  let cookieB: string;
  let press: ExerciseItem;
  let dominada: ExerciseItem;
  let trote: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookieA = await registerVerified(context, "a@example.com");
    cookieB = await registerVerified(context, "b@example.com");
    press = await exerciseOfMode(context, cookieA, "fuerza_con_carga");
    dominada = await exerciseOfMode(context, cookieA, "repeticiones_sin_carga");
    trote = await exerciseOfMode(context, cookieA, "cardio_continuo");
  });

  afterEach(() => {
    context?.connection.close();
  });

  async function replaceRoutine(
    id: string,
    cookie: string,
    body: Record<string, unknown>,
  ): Promise<{ status: number; body: unknown }> {
    const response = await context!.app.request(`/api/routines/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }

  test("la edición sustituye el agregado completo y conserva los identificadores de los hijos", async () => {
    const created = await createRoutine(
      context!,
      cookieA,
      routinePayload([
        { exerciseId: press.id, series: [{ carga: 60, repeticiones: 10 }] },
        { exerciseId: dominada.id, series: [{ repeticiones: 6 }] },
      ]),
    );
    const before = (created.body as { routine: RoutineDocument }).routine;
    const pressChild = before.exercises[0]!;
    const dominadaChild = before.exercises[1]!;
    const pressSeries = pressChild.series[0]!;

    const { status, body } = await replaceRoutine(before.id, cookieA, {
      revision: before.revision,
      name: "Torso completo v2",
      exercises: [
        // mismo hijo: conserva identidad; objetivos cambiados y Serie nueva
        {
          id: pressChild.id,
          exerciseId: press.id,
          series: [
            { id: pressSeries.id, carga: 65, repeticiones: 8 },
            { repeticiones: 6 },
          ],
        },
        { exerciseId: trote.id, series: [{ duracion: 1200 }] },
      ],
    });
    expect(status).toBe(200);

    const updated = (body as { routine: RoutineDocument }).routine;
    expect(updated.revision).toBe(2);
    expect(updated.name).toBe("Torso completo v2");
    expect(updated.exercises).toHaveLength(2);

    const kept = updated.exercises[0]!;
    expect(kept.id).toBe(pressChild.id);
    expect(kept.exerciseId).toBe(press.id);
    expect(kept.series[0]!.id).toBe(pressSeries.id);
    expect(kept.series[0]).toMatchObject({ carga: 65, repeticiones: 8 });
    // la Serie nueva recibe identidad del servidor
    expect(kept.series[1]!.id).toMatch(/^[0-9a-f]{32}$/);
    expect(kept.series[1]!.id).not.toBe(pressSeries.id);

    // el orden y el contenido sustituido se reflejan en el listado completo
    const listed = (await (await context!.app.request("/api/routines", {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { items: RoutineDocument[] };
    const listedRoutine = listed.items[0]!;
    expect(listedRoutine.exercises.map((entry) => entry.exerciseId)).toEqual([press.id, trote.id]);
    expect(listedRoutine.exercises[0]!.id).toBe(pressChild.id);
    // dominada ya no está: la sustitución no mezcla con el estado anterior
    expect(listedRoutine.exercises.some((entry) => entry.exerciseId === dominada.id)).toBe(false);
  });

  test("una edición con revisión obsoleta devuelve conflicto y no sobrescribe", async () => {
    const created = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ carga: 60, repeticiones: 10 }] }]),
    );
    const routine = (created.body as { routine: RoutineDocument }).routine;

    // una edición legítima avanza la revisión
    const firstEdit = await replaceRoutine(routine.id, cookieA, {
      revision: routine.revision,
      name: "Primera edición",
      exercises: [{ exerciseId: press.id, series: [{ carga: 70, repeticiones: 8 }] }],
    });
    expect(firstEdit.status).toBe(200);
    expect((firstEdit.body as { routine: RoutineDocument }).routine.revision).toBe(2);

    // la segunda edición llega con la revisión antigua
    const staleEdit = await replaceRoutine(routine.id, cookieA, {
      revision: routine.revision,
      name: "Edición obsoleta",
      exercises: [{ exerciseId: dominada.id, series: [{ repeticiones: 5 }] }],
    });
    expect(staleEdit.status).toBe(409);
    expect(staleEdit.body).toEqual({
      error: {
        code: "STALE_REVISION",
        message: "La Rutina fue modificada por otra sesión. Carga la versión actual antes de guardar.",
      },
    });

    // el contenido de la edición legítima quedó intacto: sin mezclar ni sobrescribir
    const current = (await (await context!.app.request(`/api/routines/${routine.id}`, {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { routine: RoutineDocument };
    expect(current.routine.name).toBe("Primera edición");
    expect(current.routine.revision).toBe(2);
    expect(current.routine.exercises[0]!.series[0]!.carga).toBe(70);
  });

  test("dos escrituras concurrentes con la misma revisión no se sobrescriben: una gana y la otra recibe conflicto", async () => {
    const created = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ carga: 60, repeticiones: 10 }] }]),
    );
    const routine = (created.body as { routine: RoutineDocument }).routine;

    // Dos PUT con la misma revisión leída se lanzan a la vez. Solo una puede
    // sustituir el agregado: la perdedora llega con la revisión ya
    // incrementada y debe recibir conflicto sin mezclar ni sobrescribir.
    const [editA, editB] = await Promise.all([
      replaceRoutine(routine.id, cookieA, {
        revision: routine.revision,
        name: "Edición A",
        exercises: [{ exerciseId: press.id, series: [{ carga: 70, repeticiones: 8 }] }],
      }),
      replaceRoutine(routine.id, cookieA, {
        revision: routine.revision,
        name: "Edición B",
        exercises: [{ exerciseId: dominada.id, series: [{ repeticiones: 5 }] }],
      }),
    ]);

    expect([editA.status, editB.status].sort()).toEqual([200, 409]);
    const conflict = editA.status === 409 ? editA : editB;
    expect(conflict.body).toEqual({
      error: {
        code: "STALE_REVISION",
        message: "La Rutina fue modificada por otra sesión. Carga la versión actual antes de guardar.",
      },
    });

    // El estado final es exactamente la edición ganadora: ni nombre, ni
    // hijos, ni Series de la perdedora, con la revisión incrementada una vez.
    const winner = editA.status === 200 ? editA : editB;
    const winnerDocument = (winner.body as { routine: RoutineDocument }).routine;
    const current = (await (await context!.app.request(`/api/routines/${routine.id}`, {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { routine: RoutineDocument };
    expect(current.routine.revision).toBe(2);
    expect(current.routine.name).toBe(winnerDocument.name);
    expect(current.routine.exercises).toHaveLength(1);
    expect(current.routine.exercises[0]).toMatchObject({
      exerciseId: winnerDocument.exercises[0]!.exerciseId,
      series: winnerDocument.exercises[0]!.series.map((series) => ({
        carga: series.carga,
        repeticiones: series.repeticiones,
        duracion: series.duracion,
      })),
    });
  });

  test("editar la Rutina de otra Cuenta responde inexistente", async () => {
    const created = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ repeticiones: 10 }] }]),
    );
    const id = (created.body as { routine: RoutineDocument }).routine.id;

    const fromB = await replaceRoutine(id, cookieB, {
      revision: 1,
      name: "Renombrada ajena",
      exercises: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }],
    });
    expect(fromB.status).toBe(404);
  });

  test("la edición valida el agregado y la revisión en el límite HTTP", async () => {
    const created = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ repeticiones: 10 }] }]),
    );
    const id = (created.body as { routine: RoutineDocument }).routine.id;

    const missingRevision = await replaceRoutine(id, cookieA, {
      name: "Sin revisión",
      exercises: [{ exerciseId: press.id, series: [{ repeticiones: 10 }] }],
    });
    expect(missingRevision.status).toBe(400);
    expect(
      (missingRevision.body as { error: { fields?: Record<string, string[]> } }).error.fields?.revision,
    ).toBeDefined();

    const invalidAggregate = await replaceRoutine(id, cookieA, {
      revision: 1,
      name: "Agregado inválido",
      exercises: [{ exerciseId: press.id, series: [] }],
    });
    expect(invalidAggregate.status).toBe(400);
    expect(
      (invalidAggregate.body as { error: { fields?: Record<string, string[]> } }).error.fields?.[
        "exercises[0].series"
      ],
    ).toBeDefined();
  });
});

describe("archivar y restaurar Rutinas", () => {
  let context: TestContext | undefined;
  let cookieA: string;
  let cookieB: string;
  let press: ExerciseItem;
  let dominada: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookieA = await registerVerified(context, "a@example.com");
    cookieB = await registerVerified(context, "b@example.com");
    press = await exerciseOfMode(context, cookieA, "fuerza_con_carga");
    dominada = await exerciseOfMode(context, cookieA, "repeticiones_sin_carga");
  });

  afterEach(() => {
    context?.connection.close();
  });

  async function transition(
    id: string,
    action: "archive" | "restore",
    cookie: string,
  ): Promise<{ status: number; body: unknown }> {
    const response = await context!.app.request(`/api/routines/${id}/${action}`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: origin },
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }

  test("archivar retira la Rutina de los usos nuevos y restaurar la recupera con la misma identidad", async () => {
    const created = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ carga: 60, repeticiones: 10 }] }], {
        name: "Día de empuje",
      }),
    );
    const before = (created.body as { routine: RoutineDocument }).routine;

    const archived = await transition(before.id, "archive", cookieA);
    expect(archived.status).toBe(200);
    expect((archived.body as { routine: RoutineDocument }).routine).toMatchObject({
      id: before.id,
      archived: true,
      name: "Día de empuje",
    });

    const listed = (await (await context!.app.request("/api/routines", {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { items: RoutineDocument[] };
    expect(listed.items.map((item) => item.id)).toEqual([before.id]);
    expect(listed.items[0]!.archived).toBe(true);
    expect(listed.items[0]!.exercises).toHaveLength(1);

    const restored = await transition(before.id, "restore", cookieA);
    expect(restored.status).toBe(200);
    const after = (restored.body as { routine: RoutineDocument }).routine;
    expect(after).toMatchObject({ id: before.id, archived: false, name: "Día de empuje" });
    expect(after.exercises).toEqual(before.exercises);
    expect(after.revision).toBe(before.revision);
  });

  test("archivar y restaurar son idempotentes", async () => {
    const created = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ repeticiones: 10 }] }]),
    );
    const id = (created.body as { routine: RoutineDocument }).routine.id;

    expect((await transition(id, "archive", cookieA)).status).toBe(200);
    expect((await transition(id, "archive", cookieA)).status).toBe(200);
    expect((await transition(id, "restore", cookieA)).status).toBe(200);
    expect((await transition(id, "restore", cookieA)).status).toBe(200);
  });

  test("no se puede archivar la Rutina de otra Cuenta ni una inexistente", async () => {
    const created = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ repeticiones: 10 }] }]),
    );
    const id = (created.body as { routine: RoutineDocument }).routine.id;

    const foreign = await transition(id, "archive", cookieB);
    expect(foreign.status).toBe(404);
    const unknown = await transition("ffffffffffffffffffffffffffffffff", "archive", cookieA);
    expect(unknown.status).toBe(404);
  });
});

describe("referencias a Ejercicios no disponibles", () => {
  let context: TestContext | undefined;
  let cookie: string;
  let custom: ExerciseItem;
  let press: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookie = await registerVerified(context, "deportista@example.com");
    press = await exerciseOfMode(context, cookie, "fuerza_con_carga");

    const created = await context!.app.request("/api/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({
        name: "Peso muerto con mancuerna",
        instructions: "Extiende la cadera manteniendo la espalda neutra.",
        recordingMode: "fuerza_con_carga",
        category: "Espalda",
      }),
    });
    custom = ((await created.json()) as { exercise: ExerciseItem }).exercise;
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("una Rutina existente sigue mostrando el Ejercicio archivado sin ofrecerlo en usos nuevos", async () => {
    const created = await createRoutine(
      context!,
      cookie,
      routinePayload([
        { exerciseId: press.id, series: [{ carga: 60, repeticiones: 10 }] },
        { exerciseId: custom.id, series: [{ carga: 20, repeticiones: 12 }] },
      ]),
    );
    const before = (created.body as { routine: RoutineDocument }).routine;
    const customChildId = before.exercises[1]!.id;

    // el Ejercicio se archiva después de utilizarse en la Rutina
    const archivedExercise = await context!.app.request(
      `/api/exercises/${custom.id}/archive`,
      { method: "POST", headers: { Cookie: cookie, Origin: origin } },
    );
    expect(archivedExercise.status).toBe(200);

    // la Rutina existente conserva la referencia con su contexto
    const fetched = (await (await context!.app.request(`/api/routines/${before.id}`, {
      headers: { Cookie: cookie, Origin: origin },
    })).json()) as { routine: RoutineDocument };
    const entry = fetched.routine.exercises.find((item) => item.id === customChildId);
    expect(entry).toBeDefined();
    expect(entry!.exercise).toMatchObject({
      id: custom.id,
      name: custom.name,
      available: false,
    });
    expect(entry!.series[0]).toMatchObject({ carga: 20, repeticiones: 12 });

    // la sustitución no puede volver a seleccionarlo: la edición lo retira
    const editKeepingIt = await context!.app.request(`/api/routines/${before.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({
        revision: before.revision,
        name: before.name,
        exercises: before.exercises.map((entry) => ({
          id: entry.id,
          exerciseId: entry.exerciseId,
          series: entry.series.map((series) => ({
            id: series.id,
            carga: series.carga,
            repeticiones: series.repeticiones,
            duracion: series.duracion,
          })),
        })),
      }),
    });
    const editKeepingBody = (await editKeepingIt.json()) as {
      error: { fields?: Record<string, string[]> };
    };
    expect(editKeepingIt.status).toBe(400);
    expect(editKeepingBody.error.fields?.["exercises[1].exerciseId"]).toBeDefined();

    // retirándolo, la edición avanza
    const editRemovingIt = await context!.app.request(`/api/routines/${before.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify({
        revision: before.revision,
        name: before.name,
        exercises: [
          {
            id: before.exercises[0]!.id,
            exerciseId: press.id,
            series: [{ id: before.exercises[0]!.series[0]!.id, carga: 60, repeticiones: 10 }],
          },
        ],
      }),
    });
    expect(editRemovingIt.status).toBe(200);
  });
});

  let context: TestContext | undefined;
  let cookieA: string;
  let cookieB: string;
  let press: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookieA = await registerVerified(context, "a@example.com");
    cookieB = await registerVerified(context, "b@example.com");
    press = await exerciseOfMode(context, cookieA, "fuerza_con_carga");
  });

  afterEach(() => {
    context?.connection.close();
  });

describe("listar y obtener Rutinas", () => {
  let context: TestContext | undefined;
  let cookieA: string;
  let cookieB: string;
  let press: ExerciseItem;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
    cookieA = await registerVerified(context, "a@example.com");
    cookieB = await registerVerified(context, "b@example.com");
    press = await exerciseOfMode(context, cookieA, "fuerza_con_carga");
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("el listado devuelve Rutinas completas con su contenido ordenado", async () => {
    const created = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ carga: 60, repeticiones: 10 }] }], {
        name: "Tren superior",
      }),
    );
    expect(created.status).toBe(201);
    const createdRoutine = (created.body as { routine: RoutineDocument }).routine;

    const response = await context!.app.request("/api/routines", {
      headers: { Cookie: cookieA, Origin: origin },
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { items: RoutineDocument[] };
    expect(payload.items).toHaveLength(1);
    const listed = payload.items[0]!;
    expect(listed.id).toBe(createdRoutine.id);
    expect(listed.name).toBe("Tren superior");
    expect(listed.revision).toBe(1);
    expect(listed.exercises).toHaveLength(1);
    expect(listed.exercises[0]!.exerciseId).toBe(press.id);
    expect(listed.exercises[0]!.series).toHaveLength(1);
  });

  test("obtener una Rutina devuelve su documento canónico con la misma identidad", async () => {
    const created = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ carga: 60, repeticiones: 10 }] }]),
    );
    const createdRoutine = (created.body as { routine: RoutineDocument }).routine;

    const response = await context!.app.request(`/api/routines/${createdRoutine.id}`, {
      headers: { Cookie: cookieA, Origin: origin },
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { routine: RoutineDocument };
    expect(payload.routine).toEqual(createdRoutine);
  });

  test("la Rutina de otra Cuenta o inexistente responde 404", async () => {
    const created = await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ repeticiones: 10 }] }]),
    );
    const id = (created.body as { routine: RoutineDocument }).routine.id;

    const fromB = await context!.app.request(`/api/routines/${id}`, {
      headers: { Cookie: cookieB, Origin: origin },
    });
    expect(fromB.status).toBe(404);

    const unknown = await context!.app.request(
      "/api/routines/ffffffffffffffffffffffffffffffff",
      { headers: { Cookie: cookieA, Origin: origin } },
    );
    expect(unknown.status).toBe(404);
  });

  test("cada Cuenta solo ve sus propias Rutinas", async () => {
    await createRoutine(
      context!,
      cookieA,
      routinePayload([{ exerciseId: press.id, series: [{ repeticiones: 10 }] }], {
        name: "De A",
      }),
    );
    await createRoutine(
      context!,
      cookieB,
      routinePayload([{ exerciseId: press.id, series: [{ repeticiones: 12 }] }], {
        name: "De B",
      }),
    );

    const fromA = (await (await context!.app.request("/api/routines", {
      headers: { Cookie: cookieA, Origin: origin },
    })).json()) as { items: RoutineDocument[] };
    const fromB = (await (await context!.app.request("/api/routines", {
      headers: { Cookie: cookieB, Origin: origin },
    })).json()) as { items: RoutineDocument[] };
    expect(fromA.items.map((item) => item.name)).toEqual(["De A"]);
    expect(fromB.items.map((item) => item.name)).toEqual(["De B"]);
  });
});
