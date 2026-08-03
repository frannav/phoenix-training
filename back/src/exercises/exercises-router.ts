import { and, eq, isNull, or } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppDatabase } from "../db/open-database";
import { exercise, recordingModes } from "../db/schema";
import { apiError } from "../http/api-error";
import { decodeOpaqueCursor, encodeOpaqueCursor } from "../http/opaque-cursor";
import {
  createCustomExercise,
  findExerciseForAccount,
  listArchivedCustomExercises,
  setCustomExerciseAvailability,
  toExerciseDocument,
  updateCustomExercise,
  type ExerciseInput,
  type ExerciseUpdate,
} from "./custom-exercises";
import { listExercises } from "./list-exercises";
import {
  createRecordedMax,
  deleteRecordedMax,
  effectiveRecordedMax,
  findOwnRecordedMax,
  isDomainDate,
  listRecordedMaxes,
  toRecordedMaxDocument,
  updateRecordedMax,
} from "./recorded-max";

export type ExercisesRouterDependencies = {
  database: AppDatabase;
  cursorKey: Buffer;
  authenticatedUserId: (request: Request) => Promise<string | null>;
  now: () => Date;
};

type ExercisesRouterEnv = { Variables: { accountId: string } };

const exercisesDefaultLimit = 20;
const exercisesMaxLimit = 50;

const exercisesQuerySchema = z
  .object({
    q: z.string().max(100).optional(),
    recordingMode: z.enum(recordingModes).optional(),
    category: z.string().max(50).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(exercisesMaxLimit).optional(),
  })
  .strict();

const shortOptionalText = z.string().trim().max(50);

const createExerciseSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Escribe un nombre para el Ejercicio.")
      .max(80, "El nombre no puede superar los 80 caracteres."),
    instructions: z
      .string()
      .trim()
      .min(1, "Escribe las instrucciones del Ejercicio.")
      .max(2000, "Las instrucciones no pueden superar los 2000 caracteres."),
    recordingMode: z.enum(recordingModes, {
      message: "Elige una Forma de registro.",
    }),
    category: z
      .string()
      .trim()
      .min(1, "Elige una categoría.")
      .max(50, "La categoría no puede superar los 50 caracteres."),
    bodyPart: shortOptionalText.optional(),
    equipment: shortOptionalText.optional(),
  })
  .strict();

const updateExerciseSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Escribe un nombre para el Ejercicio.")
      .max(80, "El nombre no puede superar los 80 caracteres.")
      .optional(),
    instructions: z
      .string()
      .trim()
      .min(1, "Escribe las instrucciones del Ejercicio.")
      .max(2000, "Las instrucciones no pueden superar los 2000 caracteres.")
      .optional(),
    recordingMode: z
      .enum(recordingModes, {
        message: "Elige una Forma de registro.",
      })
      .optional(),
    category: z
      .string()
      .trim()
      .min(1, "Elige una categoría.")
      .max(50, "La categoría no puede superar los 50 caracteres.")
      .optional(),
    bodyPart: shortOptionalText.nullable().optional(),
    equipment: shortOptionalText.nullable().optional(),
  })
  .strict();

const unauthorizedMessage = "Debes iniciar sesión para consultar los Ejercicios.";
const notFoundMessage = "El Ejercicio solicitado no existe o no pertenece a tu Cuenta.";
const recordedMaxNotFoundMessage = "El RM solicitado no existe o no pertenece a tu Cuenta.";
const recordingModeImmutableMessage =
  "La Forma de registro de un Ejercicio publicado o utilizado no puede cambiar.";

/** La carga admite de 0 a 9999,99 kg y como máximo dos decimales. */
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

const domainDateSchema = z
  .string({ message: "Indica la fecha del RM." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener el formato AAAA-MM-DD.")
  .refine(isDomainDate, "La fecha no es un día válido.");

const recordedMaxLoadSchema = z
  .number({ message: "Indica la carga en kilogramos." })
  .min(0, "La carga no puede ser negativa.")
  .max(9999.99, "La carga no puede superar los 9999,99 kg.")
  .refine(hasAtMostTwoDecimals, "La carga admite como máximo dos decimales.");

const recordedMaxRepetitionsSchema = z
  .number({ message: "Indica el número de repeticiones." })
  .int("Las repeticiones deben ser un número entero.")
  .min(1, "Las repeticiones deben ser al menos 1.")
  .max(9999, "Las repeticiones no pueden superar 9999.");

const createRecordedMaxSchema = z
  .object({
    exerciseId: z
      .string()
      .trim()
      .min(1, "Elige un Ejercicio.")
      .max(200, "El identificador del Ejercicio no es válido."),
    load: recordedMaxLoadSchema,
    repetitions: recordedMaxRepetitionsSchema,
    date: domainDateSchema,
  })
  .strict();

const updateRecordedMaxSchema = z
  .object({
    load: recordedMaxLoadSchema.optional(),
    repetitions: recordedMaxRepetitionsSchema.optional(),
    date: domainDateSchema.optional(),
  })
  .strict();

const effectiveRecordedMaxQuerySchema = z
  .object({
    exerciseId: z.string().trim().min(1).max(200),
    repetitions: z.coerce
      .number()
      .int("Las repeticiones deben ser un número entero.")
      .min(1, "Las repeticiones deben ser al menos 1.")
      .max(9999, "Las repeticiones no pueden superar 9999."),
    date: domainDateSchema,
  })
  .strict();

function validationError(error: z.ZodError): ReturnType<typeof apiError> {
  const flattened = z.flattenError(error);
  const fieldErrors = flattened.fieldErrors as Record<string, string[] | undefined>;
  const fields: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) {
      fields[key] = messages;
    }
  }
  return apiError("VALIDATION_ERROR", "La petición no es válida.", fields);
}

export function createExercisesRouter({
  database,
  cursorKey,
  authenticatedUserId,
  now,
}: ExercisesRouterDependencies): Hono<ExercisesRouterEnv> {
  const router = new Hono<ExercisesRouterEnv>();

  // Toda la API de Ejercicios exige una Cuenta autenticada: la sesión se
  // obtiene del sistema de autenticación, nunca de un identificador del
  // cliente, y la ausencia de sesión responde 401 antes de tocar el dominio.
  // El middleware sin patrón se ejecuta para todas las peticiones bajo /api
  // (los sub-enrutadores montados de Hono no ejecutan middleware con patrón),
  // así que el prefijo de ruta acota la comprobación a los destinos del módulo
  // y evita responder 401 por recursos de otros módulos.
  router.use(async (context, next) => {
    if (
      !context.req.path.startsWith("/api/exercises") &&
      !context.req.path.startsWith("/api/rms")
    ) {
      await next();
      return;
    }
    const userId = await authenticatedUserId(context.req.raw);
    if (!userId) {
      return context.json(apiError("UNAUTHORIZED", unauthorizedMessage), 401);
    }
    context.set("accountId", userId);
    await next();
  });

  router.get("/exercises", async (context) => {
    const userId = context.get("accountId");

    const parsed = exercisesQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const { q, recordingMode, category, limit = exercisesDefaultLimit } = parsed.data;
    const offset = decodeOpaqueCursor(parsed.data.cursor, cursorKey);
    if (offset === null) {
      return context.json(apiError("VALIDATION_ERROR", "La petición no es válida."), 400);
    }
    const items = await listExercises(database, {
      accountId: userId,
      q,
      recordingMode,
      category,
      limit: limit + 1,
      offset,
    });
    const hasMore = items.length > limit;
    const page = items.slice(0, limit);

    return context.json({
      items: page,
      nextCursor: hasMore ? encodeOpaqueCursor(offset + limit, cursorKey) : null,
    });
  });

  router.get("/exercises/categories", async (context) => {
    const userId = context.get("accountId");

    const rows = await database
      .selectDistinct({ category: exercise.category })
      .from(exercise)
      .where(
        and(
          eq(exercise.available, true),
          or(isNull(exercise.accountId), eq(exercise.accountId, userId)),
        ),
      );
    const categories = rows
      .map((row) => row.category)
      .filter((category): category is string => category !== null)
      .sort((a, b) => a.localeCompare(b, "es"));
    return context.json({ categories });
  });

  router.get("/exercises/archived", async (context) => {
    const rows = await listArchivedCustomExercises(database, {
      accountId: context.get("accountId"),
    });
    return context.json({ items: rows.map(toExerciseDocument) });
  });

  router.get("/exercises/:exerciseId", async (context) => {
    const row = await findExerciseForAccount(database, {
      accountId: context.get("accountId"),
      exerciseId: context.req.param("exerciseId"),
    });
    if (!row) {
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }
    return context.json({ exercise: toExerciseDocument(row) });
  });

  router.post("/exercises", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = createExerciseSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const input: ExerciseInput = parsed.data;
    const row = await createCustomExercise(database, {
      accountId: context.get("accountId"),
      input,
      now: now(),
    });
    return context.json({ exercise: toExerciseDocument(row) }, 201);
  });

  router.put("/exercises/:exerciseId", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = updateExerciseSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }
    if (Object.keys(parsed.data).length === 0) {
      return context.json(
        apiError("VALIDATION_ERROR", "La petición no es válida.", {
          form: ["Indica al menos un dato para editar el Ejercicio."],
        }),
        400,
      );
    }

    const update: ExerciseUpdate = parsed.data;
    const outcome = await updateCustomExercise(database, {
      accountId: context.get("accountId"),
      exerciseId: context.req.param("exerciseId"),
      update,
      now: now(),
    });
    if (!outcome.ok) {
      if (outcome.reason === "recording-mode-immutable") {
        return context.json(apiError("RECORDING_MODE_IMMUTABLE", recordingModeImmutableMessage), 409);
      }
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }
    return context.json({ exercise: toExerciseDocument(outcome.exercise) });
  });

  const setAvailability = async (
    context: Context<ExercisesRouterEnv>,
    available: boolean,
  ): Promise<Response> => {
    const outcome = await setCustomExerciseAvailability(database, {
      accountId: context.get("accountId"),
      exerciseId: context.req.param("exerciseId") ?? "",
      available,
      now: now(),
    });
    if (!outcome.ok) {
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }
    return context.json({ exercise: toExerciseDocument(outcome.exercise) });
  };

  router.post("/exercises/:exerciseId/archive", async (context) => {
    return setAvailability(context, false);
  });

  router.post("/exercises/:exerciseId/restore", async (context) => {
    return setAvailability(context, true);
  });

  // ---- RM registrados ---------------------------------------------------
  //
  // Los RM los introduce expresamente el Deportista para un Ejercicio, una
  // carga, un número de repeticiones y una fecha. Registrar una Serie nunca
  // crea ni actualiza un RM automáticamente, y la aplicación no calcula ni
  // presenta 1RM estimado: no existe ninguna ruta que derive RM.

  router.get("/rms", async (context) => {
    const items = await listRecordedMaxes(database, {
      accountId: context.get("accountId"),
    });
    return context.json({ items });
  });

  // Antes de /rms/:recordedMaxId para que "effective" no se capture como id.
  router.get("/rms/effective", async (context) => {
    const parsed = effectiveRecordedMaxQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const target = await findExerciseForAccount(database, {
      accountId: context.get("accountId"),
      exerciseId: parsed.data.exerciseId,
    });
    if (!target) {
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }

    const rm = await effectiveRecordedMax(database, {
      accountId: context.get("accountId"),
      exerciseId: parsed.data.exerciseId,
      repetitions: parsed.data.repetitions,
      date: parsed.data.date,
    });
    return context.json({ rm });
  });

  router.post("/rms", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = createRecordedMaxSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const outcome = await createRecordedMax(database, {
      accountId: context.get("accountId"),
      input: parsed.data,
      now: now(),
    });
    if (!outcome.ok) {
      return context.json(
        apiError("VALIDATION_ERROR", "La petición no es válida.", {
          exerciseId: [notFoundMessage],
        }),
        400,
      );
    }
    return context.json({ rm: outcome.rm }, 201);
  });

  router.get("/rms/:recordedMaxId", async (context) => {
    const row = await findOwnRecordedMax(database, {
      accountId: context.get("accountId"),
      recordedMaxId: context.req.param("recordedMaxId"),
    });
    if (!row) {
      return context.json(apiError("NOT_FOUND", recordedMaxNotFoundMessage), 404);
    }
    return context.json({ rm: toRecordedMaxDocument(row) });
  });

  router.put("/rms/:recordedMaxId", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = updateRecordedMaxSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }
    if (Object.keys(parsed.data).length === 0) {
      return context.json(
        apiError("VALIDATION_ERROR", "La petición no es válida.", {
          form: ["Indica al menos un dato para editar el RM."],
        }),
        400,
      );
    }

    const outcome = await updateRecordedMax(database, {
      accountId: context.get("accountId"),
      recordedMaxId: context.req.param("recordedMaxId"),
      update: parsed.data,
      now: now(),
    });
    if (!outcome.ok) {
      return context.json(apiError("NOT_FOUND", recordedMaxNotFoundMessage), 404);
    }
    return context.json({ rm: outcome.rm });
  });

  router.delete("/rms/:recordedMaxId", async (context) => {
    const outcome = await deleteRecordedMax(database, {
      accountId: context.get("accountId"),
      recordedMaxId: context.req.param("recordedMaxId"),
    });
    if (!outcome.ok) {
      return context.json(apiError("NOT_FOUND", recordedMaxNotFoundMessage), 404);
    }
    return context.json({ rm: outcome.rm });
  });

  return router;
}
