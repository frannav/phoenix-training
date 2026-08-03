import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppDatabase } from "../db/open-database";
import { fieldKey } from "../domain/series-goals";
import { apiError } from "../http/api-error";
import {
  activatePlan,
  completePlan,
  createPlan,
  deletePlan,
  duplicatePlan,
  getPlanDocument,
  listPlanDocuments,
  omitTraining,
  replacePlan,
  restoreTraining,
  type PlanInput,
} from "./plans";

export type PlansRouterDependencies = {
  database: AppDatabase;
  authenticatedUserId: (request: Request) => Promise<string | null>;
  now: () => Date;
};

type PlansRouterEnv = { Variables: { accountId: string } };

const seriesGoalSchema = z
  .object({
    id: z.string().max(200).optional(),
    carga: z.number().nullable().optional(),
    repeticiones: z.number().nullable().optional(),
    duracion: z.number().nullable().optional(),
  })
  .strict();

const specificExerciseSchema = z
  .object({
    id: z.string().max(200).optional(),
    exerciseId: z.string().min(1).max(200),
    series: z.array(seriesGoalSchema),
  })
  .strict();

const trainingSchema = z
  .object({
    id: z.string().max(200).optional(),
    day: z
      .number()
      .int()
      .min(0, "El día de la semana debe estar entre lunes (0) y domingo (6).")
      .max(6, "El día de la semana debe estar entre lunes (0) y domingo (6)."),
    source: z.enum(["rutina", "especifico"], {
      message: "Elige si el Entrenamiento usa una Rutina o contenido específico.",
    }),
    routineId: z.string().min(1).max(200).nullable().optional(),
    // Solo tiene sentido para un Entrenamiento específico; el caso de uso
    // rechaza el contenido junto a una referencia viva a una Rutina.
    specific: z.array(specificExerciseSchema).optional(),
  })
  .strict();

const weekSchema = z
  .object({
    id: z.string().max(200).optional(),
    trainings: z.array(trainingSchema),
  })
  .strict();

const planBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Escribe un nombre para el Plan.")
      .max(80, "El nombre no puede superar los 80 caracteres."),
    weeks: z.array(weekSchema),
  })
  .strict();

const planCreateSchema = planBodySchema;
const planReplaceSchema = planBodySchema
  .extend({ revision: z.number().int().min(1, "Indica la revisión del Plan que editas.") })
  .strict();

const unauthorizedMessage = "Debes iniciar sesión para consultar los Planes.";
const notFoundMessage = "El Plan solicitado no existe o no pertenece a tu Cuenta.";
const staleRevisionMessage =
  "El Plan fue modificado por otra sesión. Carga la versión actual antes de guardar.";
const notDraftMessage = "Solo un Plan borrador puede eliminarse.";
const activateNotDraftMessage = "Solo un Plan borrador puede activarse.";
const activePlanExistsMessage = "Ya tienes un Plan activo. Complétalo antes de activar otro.";

// Los identificadores son opacos y se validan en el límite HTTP con Zod
// (spec «Arquitectura del backend»): un parámetro de ruta mal formado
// responde el error común 400 antes de llegar al caso de uso, y solo un
// identificador bien formado que no exista o sea ajeno responde 404.
const planIdParamSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/, "El identificador del Plan no es válido.");
const trainingIdParamSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/, "El identificador del Entrenamiento no es válido.");

const planActivateSchema = z
  .object({
    revision: z.number().int().min(1, "Indica la revisión del Plan que editas."),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe usar el formato AAAA-MM-DD."),
  })
  .strict();

const planActionRevisionSchema = z
  .object({
    revision: z.number().int().min(1, "Indica la revisión del Plan que editas."),
  })
  .strict();

const planDeleteQuerySchema = z
  .object({
    revision: z.coerce.number().int().min(1, "Indica la revisión del Plan que eliminas."),
  })
  .strict();

const completeNotActiveMessage = "Solo un Plan activo puede completarse.";

function toPlanInput(body: {
  name: string;
  weeks: Array<{
    id?: string;
    trainings: Array<{
      id?: string;
      day: number;
      source: "rutina" | "especifico";
      routineId?: string | null;
      specific?: Array<{
        id?: string;
        exerciseId: string;
        series: Array<{ id?: string; carga?: number | null; repeticiones?: number | null; duracion?: number | null }>;
      }>;
    }>;
  }>;
}): PlanInput {
  return {
    name: body.name,
    weeks: body.weeks.map((week) => ({
      id: week.id,
      trainings: week.trainings.map((training) => ({
        id: training.id,
        day: training.day,
        source: training.source,
        routineId: training.routineId,
        specific: training.specific ?? [],
      })),
    })),
  };
}

function validationError(error: z.ZodError): ReturnType<typeof apiError> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = fieldKey(...issue.path.map((segment) => String(segment)));
    const existing = fields[key] ?? [];
    existing.push(issue.message);
    fields[key] = existing;
  }
  return apiError("VALIDATION_ERROR", "La petición no es válida.", fields);
}

export function createPlansRouter({
  database,
  authenticatedUserId,
  now,
}: PlansRouterDependencies): Hono<PlansRouterEnv> {
  const router = new Hono<PlansRouterEnv>();

  // El valor del parámetro se valida dentro de un objeto para que el error
  // común lleve el campo con el nombre del parámetro (`planId`/`trainingId`)
  // en lugar de una clave vacía.
  const requirePlanId = (context: Context<PlansRouterEnv>): string | Response => {
    const parsed = z
      .object({ planId: planIdParamSchema })
      .strict()
      .safeParse({ planId: context.req.param("planId") });
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }
    return parsed.data.planId;
  };
  const requireTrainingId = (context: Context<PlansRouterEnv>): string | Response => {
    const parsed = z
      .object({ trainingId: trainingIdParamSchema })
      .strict()
      .safeParse({ trainingId: context.req.param("trainingId") });
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }
    return parsed.data.trainingId;
  };

  // Toda la API de Planes exige una Cuenta autenticada: la sesión se obtiene
  // del sistema de autenticación, nunca de un identificador del cliente. El
  // middleware sin patrón se ejecuta para todas las peticiones bajo /api (los
  // sub-enrutadores montados de Hono no ejecutan middleware con patrón), así
  // que el prefijo de ruta acota la comprobación a los destinos del módulo.
  router.use(async (context, next) => {
    if (!context.req.path.startsWith("/api/plans")) {
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

  router.get("/plans", async (context) => {
    const items = await listPlanDocuments(database, {
      accountId: context.get("accountId"),
    });
    return context.json({ items });
  });

  router.get("/plans/:planId", async (context) => {
    const planId = requirePlanId(context);
    if (typeof planId !== "string") {
      return planId;
    }
    const document = await getPlanDocument(database, {
      accountId: context.get("accountId"),
      planId,
    });
    if (!document) {
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }
    return context.json({ plan: document });
  });

  router.post("/plans", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = planCreateSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const outcome = await createPlan(database, {
      accountId: context.get("accountId"),
      input: toPlanInput(parsed.data),
      now: now(),
    });
    if (!outcome.ok) {
      return context.json(apiError("VALIDATION_ERROR", "La petición no es válida.", outcome.fields), 400);
    }

    const document = await getPlanDocument(database, {
      accountId: context.get("accountId"),
      planId: outcome.planId,
    });
    return context.json({ plan: document }, 201);
  });

  router.put("/plans/:planId", async (context) => {
    const planId = requirePlanId(context);
    if (typeof planId !== "string") {
      return planId;
    }
    const body = await context.req.json().catch(() => null);
    const parsed = planReplaceSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const { revision, ...input } = parsed.data;
    const outcome = await replacePlan(database, {
      accountId: context.get("accountId"),
      planId,
      input: toPlanInput(input),
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
      if (outcome.reason === "transition-impossible") {
        return context.json(apiError("TRANSITION_IMPOSSIBLE", outcome.message), 409);
      }
      return context.json(apiError("VALIDATION_ERROR", "La petición no es válida.", outcome.fields), 400);
    }

    const document = await getPlanDocument(database, {
      accountId: context.get("accountId"),
      planId,
    });
    return context.json({ plan: document });
  });

  router.delete("/plans/:planId", async (context) => {
    const planId = requirePlanId(context);
    if (typeof planId !== "string") {
      return planId;
    }
    const queryParsed = planDeleteQuerySchema.safeParse(context.req.query());
    if (!queryParsed.success) {
      return context.json(validationError(queryParsed.error), 400);
    }
    const outcome = await deletePlan(database, {
      accountId: context.get("accountId"),
      planId,
      revision: queryParsed.data.revision,
    });
    if (!outcome.ok) {
      if (outcome.reason === "not-draft") {
        return context.json(apiError("TRANSITION_IMPOSSIBLE", notDraftMessage), 409);
      }
      if (outcome.reason === "stale-revision") {
        return context.json(apiError("STALE_REVISION", staleRevisionMessage), 409);
      }
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }
    return context.json({ deleted: true });
  });

  router.post("/plans/:planId/activate", async (context) => {
    const planId = requirePlanId(context);
    if (typeof planId !== "string") {
      return planId;
    }
    const body = await context.req.json().catch(() => null);
    const parsed = planActivateSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const outcome = await activatePlan(database, {
      accountId: context.get("accountId"),
      planId,
      startDate: parsed.data.startDate,
      revision: parsed.data.revision,
      now: now(),
    });
    if (!outcome.ok) {
      if (outcome.reason === "stale-revision") {
        return context.json(apiError("STALE_REVISION", staleRevisionMessage), 409);
      }
      if (outcome.reason === "not-draft") {
        return context.json(apiError("TRANSITION_IMPOSSIBLE", activateNotDraftMessage), 409);
      }
      if (outcome.reason === "active-exists") {
        return context.json(apiError("TRANSITION_IMPOSSIBLE", activePlanExistsMessage), 409);
      }
      if (outcome.reason === "validation") {
        return context.json(
          apiError("VALIDATION_ERROR", "La petición no es válida.", outcome.fields),
          400,
        );
      }
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }

    const document = await getPlanDocument(database, {
      accountId: context.get("accountId"),
      planId,
    });
    return context.json({ plan: document });
  });

  router.post("/plans/:planId/complete", async (context) => {
    const planId = requirePlanId(context);
    if (typeof planId !== "string") {
      return planId;
    }
    const body = await context.req.json().catch(() => null);
    const parsed = planActionRevisionSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const outcome = await completePlan(database, {
      accountId: context.get("accountId"),
      planId,
      revision: parsed.data.revision,
      now: now(),
    });
    if (!outcome.ok) {
      if (outcome.reason === "stale-revision") {
        return context.json(apiError("STALE_REVISION", staleRevisionMessage), 409);
      }
      if (outcome.reason === "not-active") {
        return context.json(apiError("TRANSITION_IMPOSSIBLE", completeNotActiveMessage), 409);
      }
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }
    const document = await getPlanDocument(database, {
      accountId: context.get("accountId"),
      planId,
    });
    return context.json({ plan: document });
  });

  router.post("/plans/:planId/trainings/:trainingId/omit", async (context) => {
    const planId = requirePlanId(context);
    if (typeof planId !== "string") {
      return planId;
    }
    const trainingId = requireTrainingId(context);
    if (typeof trainingId !== "string") {
      return trainingId;
    }
    const body = await context.req.json().catch(() => null);
    const parsed = planActionRevisionSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const outcome = await omitTraining(database, {
      accountId: context.get("accountId"),
      planId,
      trainingId,
      revision: parsed.data.revision,
      now: now(),
    });
    if (!outcome.ok) {
      if (outcome.reason === "stale-revision") {
        return context.json(apiError("STALE_REVISION", staleRevisionMessage), 409);
      }
      if (outcome.reason === "not-active") {
        return context.json(apiError("TRANSITION_IMPOSSIBLE", outcome.message), 409);
      }
      if (outcome.reason === "transition-impossible") {
        return context.json(apiError("TRANSITION_IMPOSSIBLE", outcome.message), 409);
      }
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }
    const document = await getPlanDocument(database, {
      accountId: context.get("accountId"),
      planId,
    });
    return context.json({ plan: document });
  });

  router.post("/plans/:planId/trainings/:trainingId/restore", async (context) => {
    const planId = requirePlanId(context);
    if (typeof planId !== "string") {
      return planId;
    }
    const trainingId = requireTrainingId(context);
    if (typeof trainingId !== "string") {
      return trainingId;
    }
    const body = await context.req.json().catch(() => null);
    const parsed = planActionRevisionSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const outcome = await restoreTraining(database, {
      accountId: context.get("accountId"),
      planId,
      trainingId,
      revision: parsed.data.revision,
      now: now(),
    });
    if (!outcome.ok) {
      if (outcome.reason === "stale-revision") {
        return context.json(apiError("STALE_REVISION", staleRevisionMessage), 409);
      }
      if (outcome.reason === "not-active" || outcome.reason === "transition-impossible") {
        return context.json(apiError("TRANSITION_IMPOSSIBLE", outcome.message), 409);
      }
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }
    const document = await getPlanDocument(database, {
      accountId: context.get("accountId"),
      planId,
    });
    return context.json({ plan: document });
  });

  router.post("/plans/:planId/duplicate", async (context) => {
    const planId = requirePlanId(context);
    if (typeof planId !== "string") {
      return planId;
    }
    const body = await context.req.json().catch(() => null);
    const parsed = planActionRevisionSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const source = await getPlanDocument(database, {
      accountId: context.get("accountId"),
      planId,
    });
    if (!source) {
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }
    const defaultName =
      source.name.length + " (copia)".length <= 80 ? `${source.name} (copia)` : source.name;

    const outcome = await duplicatePlan(database, {
      accountId: context.get("accountId"),
      planId,
      name: defaultName,
      revision: parsed.data.revision,
      now: now(),
    });
    if (!outcome.ok) {
      if (outcome.reason === "stale-revision") {
        return context.json(apiError("STALE_REVISION", staleRevisionMessage), 409);
      }
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }

    const document = await getPlanDocument(database, {
      accountId: context.get("accountId"),
      planId: outcome.planId,
    });
    return context.json({ plan: document }, 201);
  });

  return router;
}
