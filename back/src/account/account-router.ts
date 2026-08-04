import { Hono } from "hono";
import { z } from "zod";
import type { AppDatabase } from "../db/open-database";
import { apiError } from "../http/api-error";
import { deleteAccount } from "./delete-account";

export type AccountRouterDependencies = {
  database: AppDatabase;
  authenticatedUserId: (request: Request) => Promise<string | null>;
  /**
   * Expira la cookie local de sesión. Tras eliminar la Cuenta, la sesión ya
   * no existe; la respuesta de cierre conserva las cabeceras Set-Cookie que
   * la interfaz recibe para limpiar la cookie del navegador.
   */
  clearSessionCookie: (request: Request) => Promise<Response>;
};

type AccountRouterEnv = { Variables: { accountId: string } };

const deleteAccountSchema = z
  .object({
    password: z
      .string()
      .min(1, "Vuelve a introducir tu contraseña para eliminar la Cuenta.")
      .max(128, "La contraseña no puede superar los 128 caracteres."),
    confirmed: z
      .boolean({
        message: "Confirma la advertencia para eliminar la Cuenta definitivamente.",
      })
      .refine((value) => value === true, {
        message: "Confirma la advertencia para eliminar la Cuenta definitivamente.",
      }),
  })
  .strict();

const unauthorizedMessage = "Debes iniciar sesión para eliminar tu Cuenta.";
const invalidPasswordMessage = "La contraseña actual no es correcta.";
const missingConfirmationMessage =
  "Confirma la advertencia para eliminar la Cuenta definitivamente.";

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

export function createAccountRouter({
  database,
  authenticatedUserId,
  clearSessionCookie,
}: AccountRouterDependencies): Hono<AccountRouterEnv> {
  const router = new Hono<AccountRouterEnv>();

  // La eliminación de la Cuenta exige una Cuenta autenticada: la sesión se
  // obtiene del sistema de autenticación, nunca de un identificador del
  // cliente, y la ausencia de sesión responde 401 antes de tocar el dominio.
  router.use(async (context, next) => {
    if (!context.req.path.startsWith("/api/account")) {
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

  router.delete("/account", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = deleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error), 400);
    }

    let outcome;
    try {
      outcome = await deleteAccount(database, {
        userId: context.get("accountId"),
        password: parsed.data.password,
        confirmed: parsed.data.confirmed,
      });
    } catch (error) {
      // Un fallo en cualquier parte de la transacción la revierte por
      // completo y conserva la Cuenta utilizable (lo demuestran las pruebas
      // HTTP); la respuesta no revela el detalle interno.
      console.error("No se pudo eliminar la Cuenta:", error);
      return context.json(
        apiError("INTERNAL_ERROR", "No se pudo eliminar la Cuenta. Inténtalo de nuevo."),
        500,
      );
    }

    if (!outcome.ok) {
      // La confirmación ausente no llega aquí (el esquema la exige); la rama
      // protege el caso de uso invocado fuera del límite HTTP.
      return context.json(
        apiError(
          outcome.reason === "not-confirmed" ? "VALIDATION_ERROR" : "INVALID_PASSWORD",
          outcome.reason === "not-confirmed" ? missingConfirmationMessage : invalidPasswordMessage,
        ),
        400,
      );
    }

    // La sesión de autenticación ya no existe; la respuesta de cierre expira
    // la cookie local para que el navegador no conserve una sesión muerta.
    const signedOut = await clearSessionCookie(context.req.raw);
    const responseHeaders = new Headers(signedOut.headers);
    responseHeaders.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ status: true }), {
      status: 200,
      headers: responseHeaders,
    });
  });

  return router;
}
