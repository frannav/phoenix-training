import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppDatabase } from "../db/open-database";
import { apiError } from "../http/api-error";
import {
  deleteActiveSession,
  finalizeSession,
  getActiveSession,
  getSessionForAccount,
  replaceSession,
  sessionFieldKey,
  startFreeSession,
  type SessionExerciseInput,
} from "./sessions";

export type SessionsRouterDependencies = {
  database: AppDatabase;
  authenticatedUserId: (request: Request) => Promise<string | null>;
  now: () => Date;
};

type SessionsRouterEnv = { Variables: { accountId: string } };

const startSessionSchema = z
  .object({
    origin: z.literal("libre", {
      message: "El único origen disponible por ahora es «libre».",
    }),
  })
  .strict();

const seriesMagnitudesSchema = z
  .object({
    carga: z.number().nullable().optional(),
    repeticiones: z.number().nullable().optional(),
    duracion: z.number().nullable().optional(),
  })
  .strict();

const seriesInputSchema = z
  .object({
    id: z.string().max(200).optional(),
    status: z.enum(["pendiente", "completada", "omitida"], {
      message: "El estado de la Serie no es válido.",
    }),
    goal: seriesMagnitudesSchema.nullable().optional(),
    result: seriesMagnitudesSchema.nullable().optional(),
    rpe: z.number().nullable().optional(),
  })
  .strict();

const sessionExerciseSchema = z
  .object({
    id: z.string().max(200).optional(),
    exerciseId: z
      .string()
      .min(1, "Indica el Ejercicio que se añade a la Sesión.")
      .max(200, "El identificador del Ejercicio no es válido."),
    series: z
      .array(seriesInputSchema)
      .max(200, "Una aparición no puede contener más de 200 Series."),
  })
  .strict();

const replaceSessionSchema = z
  .object({
    revision: z.number().int().min(1, "Indica la revisión leída de la Sesión."),
    exercises: z
      .array(sessionExerciseSchema)
      .max(100, "Una Sesión no puede contener más de 100 Ejercicios."),
  })
  .strict();

const sessionRevisionSchema = z.object({
  revision: z.number().int().min(1, "Indica la revisión leída de la Sesión."),
});

const sessionRevisionQuerySchema = z.object({
  revision: z.coerce.number().int().min(1, "Indica la revisión leída de la Sesión."),
});

const unauthorizedMessage = "Debes iniciar sesión para gestionar tus Sesiones.";
const notFoundMessage = "La Sesión solicitada no existe o no pertenece a tu Cuenta.";
const activeSessionExistsMessage = "Ya tienes una Sesión activa.";
const revisionConflictMessage =
  "La Sesión ha cambiado desde tu última lectura. Recarga la versión vigente antes de continuar.";
const notActiveMessage = "Solo una Sesión activa admite esta acción.";
const noCompletedSeriesMessage =
  "Finalizar requiere al menos una Serie completada en la Sesión.";

function validationError(error: z.ZodError): ReturnType<typeof apiError> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = sessionFieldKey(...issue.path.map((segment) => String(segment)));
    const existing = fields[key] ?? [];
    existing.push(issue.message);
    fields[key] = existing;
  }
  return apiError("VALIDATION_ERROR", "La petición no es válida.", fields);
}

export function createSessionsRouter({
  database,
  authenticatedUserId,
  now,
}: SessionsRouterDependencies): Hono<SessionsRouterEnv> {
  const router = new Hono<SessionsRouterEnv>();

  // Toda la API de Sesiones exige una Cuenta autenticada. La Cuenta se
  // obtiene de la sesión de autenticación, nunca de un identificador enviado
  // por el cliente; sin sesión la respuesta es 401 antes de tocar el dominio.
  // Los patrones limitan el middleware a los destinos del módulo (la raíz y
  // sus subrutas) para no interceptar otros sub-enrutadores montados en /api.
  const requireAccount = async (context: Context<SessionsRouterEnv>, next: () => Promise<void>) => {
    const userId = await authenticatedUserId(context.req.raw);
    if (!userId) {
      return context.json(apiError("UNAUTHORIZED", unauthorizedMessage), 401);
    }
    context.set("accountId", userId);
    await next();
  };
  router.use("/sessions", requireAccount);
  router.use("/sessions/*", requireAccount);

  router.post("/sessions", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = startSessionSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const outcome = await startFreeSession(database, {
      accountId: context.get("accountId"),
      now: now(),
    });
    if (!outcome.ok) {
      // Conflicto recuperable: la Cuenta ya tiene una Sesión activa y la
      // respuesta entrega su identificador para que la interfaz la abra.
      return context.json(
        {
          error: {
            code: "ACTIVE_SESSION_EXISTS",
            message: activeSessionExistsMessage,
            sessionId: outcome.sessionId,
          },
        },
        409,
      );
    }
    return context.json({ session: outcome.session }, 201);
  });

  router.get("/sessions/active", async (context) => {
    const session = await getActiveSession(database, {
      accountId: context.get("accountId"),
    });
    return context.json({ session });
  });

  router.get("/sessions/:sessionId", async (context) => {
    const session = await getSessionForAccount(database, {
      accountId: context.get("accountId"),
      sessionId: context.req.param("sessionId") ?? "",
    });
    if (!session) {
      return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
    }
    return context.json({ session });
  });

  router.put("/sessions/:sessionId", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = replaceSessionSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const outcome = await replaceSession(database, {
      accountId: context.get("accountId"),
      sessionId: context.req.param("sessionId") ?? "",
      expectedRevision: parsed.data.revision,
      exercises: parsed.data.exercises as unknown as SessionExerciseInput[],
      now: now(),
    });
    if (!outcome.ok) {
      switch (outcome.reason) {
        case "revision-conflict":
          return context.json(apiError("REVISION_CONFLICT", revisionConflictMessage), 409);
        case "validation":
          return context.json(
            apiError("VALIDATION_ERROR", "La petición no es válida.", outcome.fields),
            400,
          );
        case "invalid-exercises":
          return context.json(
            apiError("VALIDATION_ERROR", "La petición no es válida.", {
              exercises: [outcome.message ?? "Los Ejercicios indicados no son válidos."],
            }),
            400,
          );
        case "unknown-child":
          return context.json(
            apiError("VALIDATION_ERROR", "La petición no es válida.", {
              exercises: ["La Sesión no contiene uno de los Ejercicios indicados."],
            }),
            400,
          );
        default:
          return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
      }
    }
    return context.json({ session: outcome.session });
  });

  router.post("/sessions/:sessionId/finalize", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = sessionRevisionSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const outcome = await finalizeSession(database, {
      accountId: context.get("accountId"),
      sessionId: context.req.param("sessionId") ?? "",
      expectedRevision: parsed.data.revision,
      now: now(),
    });
    if (!outcome.ok) {
      switch (outcome.reason) {
        case "revision-conflict":
          return context.json(apiError("REVISION_CONFLICT", revisionConflictMessage), 409);
        case "not-active":
          return context.json(apiError("SESSION_NOT_ACTIVE", notActiveMessage), 409);
        case "no-completed-series":
          return context.json(apiError("VALIDATION_ERROR", noCompletedSeriesMessage), 400);
        default:
          return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
      }
    }
    return context.json({ session: outcome.session });
  });

  router.delete("/sessions/:sessionId", async (context) => {
    const parsed = sessionRevisionQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    const outcome = await deleteActiveSession(database, {
      accountId: context.get("accountId"),
      sessionId: context.req.param("sessionId") ?? "",
      expectedRevision: parsed.data.revision,
    });
    if (!outcome.ok) {
      switch (outcome.reason) {
        case "revision-conflict":
          return context.json(apiError("REVISION_CONFLICT", revisionConflictMessage), 409);
        case "not-active":
          return context.json(apiError("SESSION_NOT_ACTIVE", notActiveMessage), 409);
        default:
          return context.json(apiError("NOT_FOUND", notFoundMessage), 404);
      }
    }
    return context.json({ deleted: true });
  });

  return router;
}
