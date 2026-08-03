import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppDatabase } from "../db/open-database";
import { apiError } from "../http/api-error";
import {
  createRoutine,
  getRoutineDocument,
  listRoutineDocuments,
  replaceRoutine,
  routineFieldKey,
  setRoutineArchived,
  type RoutineInput,
} from "./routines";

export type RoutinesRouterDependencies = {
  database: AppDatabase;
  authenticatedUserId: (request: Request) => Promise<string | null>;
  now: () => Date;
};

type RoutinesRouterEnv = { Variables: { accountId: string } };

const seriesGoalSchema = z
  .object({
    id: z.string().max(200).optional(),
    carga: z.number().nullable().optional(),
    repeticiones: z.number().nullable().optional(),
    duracion: z.number().nullable().optional(),
  })
  .strict();

const routineExerciseSchema = z
  .object({
    id: z.string().max(200).optional(),
    exerciseId: z.string().min(1).max(200),
    series: z.array(seriesGoalSchema),
  })
  .strict();

const routineBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Escribe un nombre para la Rutina.")
      .max(80, "El nombre no puede superar los 80 caracteres."),
    exercises: z.array(routineExerciseSchema),
  })
  .strict();

const routineCreateSchema = routineBodySchema;
const routineReplaceSchema = routineBodySchema
  .extend({ revision: z.number().int().min(1, "Indica la revisión de la Rutina que editas.") })
  .strict();

const unauthorizedMessage = "Debes iniciar sesión para consultar las Rutinas.";
const notFoundMessage = "La Rutina solicitada no existe o no pertenece a tu Cuenta.";
const staleRevisionMessage =
  "La Rutina fue modificada por otra sesión. Carga la versión actual antes de guardar.";

function validationError(error: z.ZodError): ReturnType<typeof apiError> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = routineFieldKey(...issue.path.map((segment) => String(segment)));
    const existing = fields[key] ?? [];
    existing.push(issue.message);
    fields[key] = existing;
  }
  return apiError("VALIDATION_ERROR", "La petición no es válida.", fields);
}

export function createRoutinesRouter({
  database,
  authenticatedUserId,
  now,
}: RoutinesRouterDependencies): Hono<RoutinesRouterEnv> {
  const router = new Hono<RoutinesRouterEnv>();

  // Toda la API de Rutinas exige una Cuenta autenticada: la sesión se obtiene
  // del sistema de autenticación, nunca de un identificador del cliente. El
  // middleware sin patrón se ejecuta para todas las peticiones bajo /api (los
  // sub-enrutadores montados de Hono no ejecutan middleware con patrón), así
  // que el prefijo de ruta acota la comprobación a los destinos del módulo.
  router.use(async (context, next) => {
    if (!context.req.path.startsWith("/api/routines")) {
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

  router.get("/routines", async (context) => {
    const items = await listRoutineDocuments(database, {
      accountId: context.get("accountId"),
    });
    return context.json({ items });
  });

  router.get("/routines/:routineId", async (context) => {
    const document = await getRoutineDocument(database, {
      accountId: context.get("accountId"),
      routineId: context.req.param("routineId"),
    });
    if (!document) {
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }
    return context.json({ routine: document });
  });

  router.post("/routines", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = routineCreateSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const outcome = await createRoutine(database, {
      accountId: context.get("accountId"),
      input: parsed.data as RoutineInput,
      now: now(),
    });
    if (!outcome.ok) {
      return context.json(apiError("VALIDATION_ERROR", "La petición no es válida.", outcome.fields), 400);
    }

    const document = await getRoutineDocument(database, {
      accountId: context.get("accountId"),
      routineId: outcome.routineId,
    });
    return context.json({ routine: document }, 201);
  });

  router.put("/routines/:routineId", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = routineReplaceSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const { revision, ...input } = parsed.data;
    const outcome = await replaceRoutine(database, {
      accountId: context.get("accountId"),
      routineId: context.req.param("routineId"),
      input: input as RoutineInput,
      revision,
      now: now(),
    });
    if (!outcome.ok) {
      if (outcome.reason === "not-found") {
        return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
      }
      if (outcome.reason === "stale-revision") {
        return context.json(apiError("STALE_REVISION", staleRevisionMessage), 409);
      }
      return context.json(apiError("VALIDATION_ERROR", "La petición no es válida.", outcome.fields), 400);
    }

    const document = await getRoutineDocument(database, {
      accountId: context.get("accountId"),
      routineId: context.req.param("routineId"),
    });
    return context.json({ routine: document });
  });

  const setArchived = async (
    context: Context<RoutinesRouterEnv>,
    archived: boolean,
  ): Promise<Response> => {
    const routineId = context.req.param("routineId") ?? "";
    const outcome = await setRoutineArchived(database, {
      accountId: context.get("accountId"),
      routineId,
      archived,
      now: now(),
    });
    if (!outcome.ok) {
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }
    const document = await getRoutineDocument(database, {
      accountId: context.get("accountId"),
      routineId,
    });
    return context.json({ routine: document });
  };

  router.post("/routines/:routineId/archive", async (context) => {
    return setArchived(context, true);
  });

  router.post("/routines/:routineId/restore", async (context) => {
    return setArchived(context, false);
  });

  return router;
}
