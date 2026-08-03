import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createApp } from "../src/app";
import {
  applyCatalogUpdate,
  planCatalogUpdate,
} from "../src/catalog/catalog-diff";
import {
  loadCatalog,
  readCatalogAssets,
  sha256Hex,
} from "../src/catalog/load-catalog";
import type { LoadedCatalogAssets } from "../src/catalog/load-catalog";
import type { UpstreamExerciseRecord } from "../src/catalog/types";
import { catalogManifest, exercise } from "../src/db/schema";
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
async function loadRealCatalog(context: TestContext): Promise<LoadedCatalogAssets> {
  const assets = await readCatalogAssets();
  const result = await loadCatalog(context.connection.db, assets);
  expect(result.added).toBeGreaterThan(0);
  return assets;
}

describe("catálogo compartido versionado", () => {
  let context: TestContext | undefined;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("la carga publica únicamente los Ejercicios revisados en español", async () => {
    const assets = await readCatalogAssets();
    await loadCatalog(context!.connection.db, assets);

    const rows = await context!.connection.db
      .select()
      .from(exercise)
      .where(eq(exercise.source, assets.manifest.source))
      .all();

    expect(rows.length).toBe(assets.review.exercises.length);
    for (const row of rows) {
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.instructions.length).toBeGreaterThan(0);
      expect(row.nameNormalized.length).toBeGreaterThan(0);
      expect(row.category.length).toBeGreaterThan(0);
      expect(["fuerza_con_carga", "repeticiones_sin_carga", "tiempo_por_serie", "cardio_continuo"]).toContain(
        row.recordingMode,
      );
      expect(row.accountId).toBeNull();
      expect(row.upstreamId).not.toBeNull();
      expect(row.available).toBe(true);
    }

    const manifest = await context!.connection.db
      .select()
      .from(catalogManifest)
      .where(eq(catalogManifest.id, assets.manifest.source))
      .get();
    expect(manifest?.upstreamCommit).toBe(assets.manifest.upstream.commit);
    expect(manifest?.snapshotSha256).toBe(assets.manifest.upstream.sha256);
    expect(manifest?.reviewRevision).toBe(assets.manifest.review.revision);
  });

  test("la carga es idempotente y rechaza un snapshot alterado", async () => {
    const assets = await readCatalogAssets();
    await loadCatalog(context!.connection.db, assets);
    const again = await loadCatalog(context!.connection.db, assets);
    expect(again).toEqual({ added: 0, changed: 0, retired: 0 });

    const tampered: LoadedCatalogAssets = {
      ...assets,
      snapshotText: assets.snapshotText.replace('"id": "0025"', '"id": "0000"'),
    };
    await expect(loadCatalog(context!.connection.db, tampered)).rejects.toThrow(
      /checksum/i,
    );
  });

  test("el contenido no revisado del snapshot no aparece en el producto", async () => {
    const assets = await readCatalogAssets();
    const unreviewedId = "0001";
    const unreviewedRecord: UpstreamExerciseRecord = {
      ...assets.snapshot[0]!,
      id: unreviewedId,
      name: "unreviewed exercise",
    };
    const enriched: LoadedCatalogAssets = {
      ...assets,
      snapshotText: JSON.stringify([...assets.snapshot, unreviewedRecord]),
      snapshot: [...assets.snapshot, unreviewedRecord],
      manifest: {
        ...assets.manifest,
        upstream: {
          ...assets.manifest.upstream,
          sha256: sha256Hex(JSON.stringify([...assets.snapshot, unreviewedRecord])),
        },
      },
    };

    const result = await loadCatalog(context!.connection.db, enriched);
    expect(result.added).toBe(assets.review.exercises.length);

    const rows = await context!.connection.db
      .select({ upstreamId: exercise.upstreamId })
      .from(exercise)
      .where(eq(exercise.source, assets.manifest.source))
      .all();
    expect(rows.map((row) => row.upstreamId)).not.toContain(unreviewedId);
  });
});

describe("API de exploración del catálogo", () => {
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

  async function getExercises(
    query: string,
    cookie = cookieA,
  ): Promise<{ status: number; body: unknown }> {
    const response = await context!.app.request(`/api/exercises${query}`, {
      headers: { Cookie: cookie, Origin: origin },
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }

  test("sin sesión la consulta devuelve 401", async () => {
    const response = await context!.app.request("/api/exercises");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Debes iniciar sesión para consultar los Ejercicios.",
      },
    });
  });

  test("lista el catálogo con identidad opaca y procedencia de catálogo", async () => {
    const { status, body } = await getExercises("");
    expect(status).toBe(200);

    const payload = body as {
      items: {
        id: string;
        name: string;
        instructions: string;
        recordingMode: string;
        category: string;
        provenance: string;
      }[];
      nextCursor: string | null;
    };
    expect(payload.items.length).toBeGreaterThan(0);
    for (const item of payload.items) {
      expect(item.id).toMatch(/^[0-9a-f]{32}$/);
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.instructions.length).toBeGreaterThan(0);
      expect(item.recordingMode).toMatch(/^(fuerza_con_carga|repeticiones_sin_carga|tiempo_por_serie|cardio_continuo)$/);
      expect(item.category.length).toBeGreaterThan(0);
      expect(item.provenance).toBe("catalogo");
    }
  });

  test("ninguna respuesta traduce ni expone contenido upstream", async () => {
    const { body } = await getExercises("");
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("barbell bench press");
    expect(raw).not.toContain("upper arms");
    expect(raw).not.toContain('"upstream_id"');
    expect(raw).not.toMatch(/"id": "00\d\d"/);
  });

  test("busca por nombre ignorando mayúsculas y acentos", async () => {
    const { status, body } = await getExercises("?q=flexion");
    expect(status).toBe(200);
    const payload = body as { items: { name: string }[] };
    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items.map((item) => item.name)).toContain(
      "Flexión con toque de pecho",
    );
  });

  test("filtra por Forma de registro y por categoría", async () => {
    const byMode = (await getExercises("?recordingMode=cardio_continuo")).body as {
      items: { recordingMode: string }[];
    };
    expect(byMode.items.length).toBeGreaterThan(0);
    expect(
      byMode.items.every((item) => item.recordingMode === "cardio_continuo"),
    ).toBe(true);

    const byCategory = (await getExercises("?category=Pecho")).body as {
      items: { category: string; recordingMode: string }[];
    };
    expect(byCategory.items.length).toBeGreaterThan(0);
    expect(byCategory.items.every((item) => item.category === "Pecho")).toBe(true);
    expect(
      byCategory.items.some((item) => item.recordingMode === "fuerza_con_carga"),
    ).toBe(true);
  });

  test("valida la entrada y aplica el límite máximo de 50", async () => {
    const invalid = await getExercises("?recordingMode=inexistente");
    expect(invalid.status).toBe(400);

    const overLimit = await getExercises("?limit=51");
    expect(overLimit.status).toBe(400);

    const atLimit = await getExercises("?limit=50");
    expect(atLimit.status).toBe(200);
  });

  test("pagina mediante cursor opaco sin solapamientos y con identidad estable", async () => {
    const seenIds = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;

    do {
      const query = cursor ? `?limit=4&cursor=${cursor}` : "?limit=4";
      const { status, body } = await getExercises(query);
      expect(status).toBe(200);
      const payload = body as { items: { id: string }[]; nextCursor: string | null };
      for (const item of payload.items) {
        expect(seenIds.has(item.id)).toBe(false);
        seenIds.add(item.id);
      }
      cursor = payload.nextCursor;
      pages += 1;
    } while (cursor !== null);

    expect(pages).toBeGreaterThan(1);

    const all = (await getExercises("")).body as { items: { id: string }[] };
    expect(seenIds.size).toBe(all.items.length);
    expect(seenIds.size).toBeGreaterThan(0);
  });

  test("el cursor opaco no expone el desplazamiento interno", async () => {
    const { status, body } = await getExercises("?limit=4");
    expect(status).toBe(200);

    const payload = body as { items: unknown[]; nextCursor: string | null };
    expect(payload.nextCursor).not.toBeNull();

    // El cursor es una cadena opaca: no revela la posición interna.
    const decoded = Buffer.from(payload.nextCursor!, "base64url").toString("utf8");
    expect(decoded).not.toContain("offset");
    expect(decoded).not.toMatch(/^\d+$/);
  });

  test("rechaza un cursor manipulado con 400", async () => {
    const { body: first } = await getExercises("?limit=4");
    const cursor = (first as { nextCursor: string | null }).nextCursor;
    expect(cursor).not.toBeNull();

    const tampered = (cursor![0] === "A" ? "B" : "A") + cursor!.slice(1);
    const { status, body } = await getExercises(`?limit=4&cursor=${tampered}`);
    expect(status).toBe(400);
    expect(body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "La petición no es válida." },
    });
  });

  test("rechaza un cursor malformado con 400", async () => {
    const garbage = await getExercises("?cursor=no-es-un-cursor");
    expect(garbage.status).toBe(400);
    expect(garbage.body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "La petición no es válida." },
    });

    const empty = await getExercises("?cursor=");
    expect(empty.status).toBe(400);
  });

  test("el catálogo compartido se lee igual desde Cuentas distintas", async () => {
    const fromA = (await getExercises("?limit=50", cookieA)).body as {
      items: { id: string }[];
    };
    const fromB = (await getExercises("?limit=50", cookieB)).body as {
      items: { id: string }[];
    };
    expect(fromA.items.map((item) => item.id)).toEqual(
      fromB.items.map((item) => item.id),
    );
  });

  test("expone la taxonomía de categorías para los filtros", async () => {
    const response = await context!.app.request("/api/exercises/categories", {
      headers: { Cookie: cookieA, Origin: origin },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { categories: string[] };
    expect(body.categories).toContain("Pecho");
    expect(body.categories).toContain("Cardio");
    expect(body.categories).toContain("Núcleo");
    expect(body.categories).toEqual([...body.categories].sort());

    const anonymous = await context!.app.request("/api/exercises/categories");
    expect(anonymous.status).toBe(401);
  });
});

describe("actualización del catálogo con diff revisable", () => {
  let context: TestContext | undefined;

  beforeEach(async () => {
    context = createTestContext();
    await migrateDatabase(context.connection.db);
    await loadRealCatalog(context);
  });

  afterEach(() => {
    context?.connection.close();
  });

  function snapshotRecordFor(
    upstreamId: string,
    name: string,
    instructionsEs: string,
  ): UpstreamExerciseRecord {
    return {
      id: upstreamId,
      name,
      category: "chest",
      body_part: "chest",
      equipment: "barbell",
      instructions: { es: instructionsEs, en: "instructions" },
      instruction_steps: { es: ["Paso 1"], en: ["Step 1"] },
      muscle_group: "chest",
      secondary_muscles: [],
      target: "chest",
      media_id: "m",
      image: "image.jpg",
      gif_url: "video.gif",
      attribution: "© Gym visual",
      created_at: "2026-03-18T00:00:00.000Z",
    };
  }

  async function buildNextAssets(
    assets: LoadedCatalogAssets,
  ): Promise<LoadedCatalogAssets> {
    const snapshot = assets.snapshot;
    const review = assets.review;

    // retirada: "3666" desaparece de la revisión
    // cambio compatible: nombre revisado de "3216"
    // incompatible: Forma de registro de "0858" cambia
    // alta: "9999" es un identificador nuevo
    const nextReview = {
      exercises: review.exercises
        .filter((entry) => entry.upstreamId !== "3666")
        .map((entry) => {
          if (entry.upstreamId === "3216") {
            return { ...entry, nameEs: "Flexión con toque de pecho (variante)" };
          }
          if (entry.upstreamId === "0858") {
            return { ...entry, recordingMode: "tiempo_por_serie" as const };
          }
          return entry;
        })
        .concat([
          {
            upstreamId: "9999",
            nameEs: "Press de banca con mancuernas",
            recordingMode: "fuerza_con_carga" as const,
            categoryEs: "Pecho",
            bodyPartEs: "Pecho",
            equipmentEs: "Mancuernas",
          },
        ]),
    };

    const nextSnapshot = [
      ...snapshot.filter((record) => record.id !== "3666"),
      snapshotRecordFor(
        "9999",
        "dumbbell bench press",
        "Túmbate en un banco con una mancuerna en cada mano.",
      ),
    ];
    const snapshotText = JSON.stringify(nextSnapshot);

    const manifest = JSON.parse(JSON.stringify(assets.manifest)) as typeof assets.manifest;
    manifest.review.revision = "2026-08-04.1";
    manifest.review.reviewedAt = "2026-08-04";
    manifest.upstream.commit = "b".repeat(40);
    manifest.upstream.sha256 = sha256Hex(snapshotText);

    return { manifest, snapshotText, snapshot: nextSnapshot, review: nextReview };
  }

  test("el diff distingue altas, cambios compatibles, retiradas y formas incompatibles", async () => {
    const current = await readCatalogAssets();
    const next = await buildNextAssets(current);
    const diff = await planCatalogUpdate(context!.connection.db, {
      manifest: next.manifest,
      snapshot: next.snapshot,
      review: next.review,
    });

    const addedUpstreamIds = diff.added.map((entry) => entry.upstreamId);
    expect(addedUpstreamIds).toContain("9999");
    expect(addedUpstreamIds).toContain("0858");

    const changed = diff.changed.find((entry) => entry.upstreamId === "3216");
    expect(changed?.fields).toContain("name");
    expect(changed?.fields).not.toContain("recordingMode");

    const incompatible = diff.retired.find((entry) => entry.upstreamId === "0858");
    expect(incompatible?.reason).toBe("forma-incompatible");

    const retired = diff.retired.find((entry) => entry.upstreamId === "3666");
    expect(retired?.reason).toBe("ausente");
  });

  test("aplicar la actualización conserva identidades y retira sin eliminar", async () => {
    const current = await readCatalogAssets();
    const next = await buildNextAssets(current);
    const diff = await planCatalogUpdate(context!.connection.db, {
      manifest: next.manifest,
      snapshot: next.snapshot,
      review: next.review,
    });

    const changedId = diff.changed.find((entry) => entry.upstreamId === "3216")!.id;
    const retiredIds = new Set(diff.retired.map((entry) => entry.id));

    await applyCatalogUpdate(
      context!.connection.db,
      diff,
      { manifest: next.manifest, snapshot: next.snapshot, review: next.review },
      new Date(),
    );

    const all = await context!.connection.db.select().from(exercise).all();
    const rowsById = new Map(all.map((row) => [row.id, row]));

    // el cambio compatible conserva la identidad interna
    expect(rowsById.get(changedId)?.name).toBe("Flexión con toque de pecho (variante)");
    expect(rowsById.get(changedId)?.available).toBe(true);

    // las retiradas conservan la fila y la identidad, pero dejan de publicarse
    for (const id of retiredIds) {
      const row = rowsById.get(id);
      expect(row).toBeDefined();
      expect(row?.available).toBe(false);
    }

    // la forma incompatible retira la anterior y publica una identidad nueva
    const incompatibleOld = [...retiredIds].map((id) => rowsById.get(id)!);
    const republished = all.filter((row) => row.upstreamId === "0858");
    expect(republished.length).toBe(2);
    expect(republished.some((row) => row.available === false)).toBe(true);
    expect(republished.some((row) => row.available === true)).toBe(true);
    const newIdentity = republished.find((row) => row.available === true)!;
    expect(newIdentity.recordingMode).toBe("tiempo_por_serie");
    expect(newIdentity.id).not.toBe(incompatibleOld[0]?.id);
  });

  test("los Ejercicios retirados ya no aparecen en el listado de la API", async () => {
    const cookie = await registerVerified(context!, "c@example.com");
    const current = await readCatalogAssets();
    const next = await buildNextAssets(current);
    const diff = await planCatalogUpdate(context!.connection.db, {
      manifest: next.manifest,
      snapshot: next.snapshot,
      review: next.review,
    });
    await applyCatalogUpdate(
      context!.connection.db,
      diff,
      { manifest: next.manifest, snapshot: next.snapshot, review: next.review },
      new Date(),
    );

    const response = await context!.app.request("/api/exercises?limit=50", {
      headers: { Cookie: cookie, Origin: origin },
    });
    const body = (await response.json()) as { items: { id: string }[] };
    expect(body.items.map((item) => item.id)).not.toContain(
      diff.retired.find((entry) => entry.upstreamId === "3666")?.id,
    );
  });

  test("una Forma de registro distinta nunca se aplica sobre una identidad publicada", async () => {
    const current = await readCatalogAssets();
    const next = await buildNextAssets(current);
    const diff = await planCatalogUpdate(context!.connection.db, {
      manifest: next.manifest,
      snapshot: next.snapshot,
      review: next.review,
    });

    for (const change of diff.changed) {
      expect(change.fields).not.toContain("recordingMode");
    }
    const incompatible = diff.retired.filter(
      (entry) => entry.reason === "forma-incompatible",
    );
    expect(incompatible.map((entry) => entry.upstreamId)).toContain("0858");
  });

  test("el manifiesto de producción pasa los invariantes de la carga", async () => {
    const assets = await readCatalogAssets();
    const problems = [
      assets.manifest.upstream.sha256 === sha256Hex(assets.snapshotText)
        ? null
        : "checksum",
      ...(assets.review.exercises.every(
        (entry) =>
          entry.nameEs.length > 0 &&
          entry.categoryEs.length > 0 &&
          assets.snapshot.some((record) => record.id === entry.upstreamId),
      )
        ? []
        : ["revision incompleta"]),
    ].filter((problem): problem is string => problem !== null);
    expect(problems).toEqual([]);
    expect(await readFile(new URL("../catalog/review.json", import.meta.url))).toBeDefined();
  });
});
