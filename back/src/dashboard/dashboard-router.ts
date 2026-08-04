import { Hono } from "hono";
import { z } from "zod";
import type { AppDatabase } from "../db/open-database";
import { toDomainDate } from "../domain/domain-dates";
import type { RecordedMaxDocument } from "../exercises/recorded-max";
import { apiError } from "../http/api-error";
import {
  evolutionOptions,
  exerciseEvolution,
  recentRecordedMaxes,
  weeklyVolume,
  type EvolutionOption,
  type ExerciseEvolution,
  type WeeklyVolume,
} from "./analytics";
import { readHomeState, type ActivePlanSummary, type HomeAction } from "./home-read";

export type DashboardRouterDependencies = {
  database: AppDatabase;
  authenticatedUserId: (request: Request) => Promise<string | null>;
  now: () => Date;
};

type DashboardRouterEnv = { Variables: { accountId: string } };

/** Consulta de la lectura única: el Ejercicio del bloque «Evolución». */
const dashboardQuerySchema = z
  .object({
    exerciseId: z
      .string()
      .min(1, "El identificador del Ejercicio no es válido.")
      .max(200, "El identificador del Ejercicio no es válido.")
      .optional(),
  })
  .strict();

/**
 * Contrato de `GET /api/dashboard` (ticket 33): la lectura única que compone
 * los cinco bloques de Inicio —entrenamiento actual, Plan activo, volumen
 * semanal, RM recientes y evolución— a partir de los modelos de lectura de
 * los tickets 30 y 31, sin reinterpretar sus reglas. La ruta exige una
 * Cuenta verificada (Better Auth solo emite sesión a correos verificados) y
 * filtra por la Cuenta autenticada: los datos de otra Cuenta se comportan
 * como inexistentes.
 */
export type DashboardResponse = {
  /** Bloque «entrenamiento actual»: la acción prioritaria con sus referencias. */
  training: HomeAction;
  /** Bloque «Plan activo»: resumen del Plan activo o ausencia explícita. */
  activePlan: ActivePlanSummary | null;
  /** Bloque «volumen semanal»: totales, comparación y barras de seis semanas. */
  weeklyVolume: WeeklyVolume;
  /** Bloque «RM recientes»: hasta tres marcas expresas, sin resultados calculados. */
  recentRecordedMaxes: RecordedMaxDocument[];
  /**
   * Bloque «Evolución»: las opciones del selector (Ejercicios con Series
   * completadas) y la serie temporal del Ejercicio elegido —el pedido por la
   * consulta o, en su defecto, el más reciente— o ausencia explícita cuando
   * no hay datos analíticos.
   */
  evolution: {
    options: EvolutionOption[];
    current: ExerciseEvolution | null;
  };
};

const unauthorizedMessage = "Debes iniciar sesión para consultar tu Inicio.";

export function createDashboardRouter({
  database,
  authenticatedUserId,
  now,
}: DashboardRouterDependencies): Hono<DashboardRouterEnv> {
  const router = new Hono<DashboardRouterEnv>();

  // La lectura única exige una Cuenta autenticada: la sesión se obtiene del
  // sistema de autenticación, nunca de un identificador del cliente, y la
  // ausencia de sesión responde 401 antes de tocar el dominio.
  router.use(async (context, next) => {
    if (!context.req.path.startsWith("/api/dashboard")) {
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

  router.get("/dashboard", async (context) => {
    const query = dashboardQuerySchema.safeParse(context.req.query());
    if (!query.success) {
      return context.json(
        apiError("VALIDATION_ERROR", "La petición no es válida."),
        400,
      );
    }

    const accountId = context.get("accountId");
    const currentInstant = now();
    const today = toDomainDate(currentInstant);

    // Los cinco bloques se leen al momento sobre el estado vigente: finalizar,
    // corregir o eliminar una Sesión, omitir o restaurar un Entrenamiento o
    // registrar un RM cambia la siguiente lectura, sin cachés ni derivados.
    const [home, volume, recent, options] = await Promise.all([
      readHomeState(database, { accountId, today }),
      weeklyVolume(database, { accountId, today: currentInstant }),
      recentRecordedMaxes(database, { accountId }),
      evolutionOptions(database, { accountId }),
    ]);

    const requestedId = query.data.exerciseId;
    const selectedId = requestedId ?? options[0]?.id ?? null;
    const selected = selectedId
      ? await exerciseEvolution(database, { accountId, exerciseId: selectedId })
      : null;

    return context.json({
      training: home.action,
      activePlan: home.activePlan,
      weeklyVolume: volume,
      recentRecordedMaxes: recent,
      evolution: { options, current: selected },
    });
  });

  return router;
}
