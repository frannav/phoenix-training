import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppDatabase } from "../db/open-database";
import { parseDomainDate } from "../domain/domain-dates";
import { apiError } from "../http/api-error";
import { readDiaryDay, readMonthlyDiary } from "./diary";

export type DiaryRouterDependencies = {
  database: AppDatabase;
  authenticatedUserId: (request: Request) => Promise<string | null>;
};

type DiaryRouterEnv = { Variables: { accountId: string } };

/** Año del calendario del Diario: acotado a un rango razonable de uso. */
const diaryYearSchema = z.coerce.number().int().min(1970).max(2100);

const monthQuerySchema = z
  .object({
    year: diaryYearSchema,
    month: z.coerce.number().int().min(1).max(12),
  })
  .strict();

/** Fecha de dominio YYYY-MM-DD que además sea una fecha real (spec «API y concurrencia»). */
const domainDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe usar el formato AAAA-MM-DD.")
  .refine((value) => parseDomainDate(value) !== null, {
    message: "La fecha indicada no es válida.",
  });

const dayQuerySchema = z
  .object({
    date: domainDateSchema,
  })
  .strict();

const unauthorizedMessage = "Debes iniciar sesión para consultar tu Diario.";

/**
 * Contrato de `GET /api/diary` y `GET /api/diary/day`: la lectura del Diario
 * de entrenamiento —el calendario mensual navegable y el detalle de un día—
 * a partir de las Sesiones finalizadas de la Cuenta autenticada, sin
 * reinterpretar sus reglas. Las rutas exigen una Cuenta verificada (Better
 * Auth solo emite sesión a correos verificados) y filtran por la Cuenta
 * autenticada: los datos de otra Cuenta se comportan como inexistentes.
 */
export function createDiaryRouter({
  database,
  authenticatedUserId,
}: DiaryRouterDependencies): Hono<DiaryRouterEnv> {
  const router = new Hono<DiaryRouterEnv>();

  // Toda la lectura del Diario exige una Cuenta autenticada. La Cuenta se
  // obtiene de la sesión de autenticación, nunca de un identificador enviado
  // por el cliente; sin sesión la respuesta es 401 antes de tocar el dominio.
  // Los patrones limitan el middleware a los destinos del módulo (la raíz y
  // sus subrutas) para no interceptar otros sub-enrutadores montados en /api.
  const requireAccount = async (context: Context<DiaryRouterEnv>, next: () => Promise<void>) => {
    const userId = await authenticatedUserId(context.req.raw);
    if (!userId) {
      return context.json(apiError("UNAUTHORIZED", unauthorizedMessage), 401);
    }
    context.set("accountId", userId);
    await next();
  };
  router.use("/diary", requireAccount);
  router.use("/diary/*", requireAccount);

  router.get("/diary", async (context) => {
    const parsed = monthQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json(
        apiError("VALIDATION_ERROR", "La petición no es válida."),
        400,
      );
    }
    const diary = await readMonthlyDiary(database, {
      accountId: context.get("accountId"),
      year: parsed.data.year,
      month: parsed.data.month,
    });
    return context.json(diary);
  });

  router.get("/diary/day", async (context) => {
    const parsed = dayQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json(
        apiError("VALIDATION_ERROR", "La petición no es válida."),
        400,
      );
    }
    const day = await readDiaryDay(database, {
      accountId: context.get("accountId"),
      date: parsed.data.date,
    });
    return context.json(day);
  });

  return router;
}
