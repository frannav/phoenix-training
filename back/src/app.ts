import { Hono } from "hono";
import { extname, join, resolve, sep } from "node:path";
import { z } from "zod";
import { createAuth } from "./auth/auth";
import { consumeVerificationToken } from "./auth/verification-tokens";
import { appMetadata } from "./db/schema";
import type { AppDatabase } from "./db/open-database";
import { apiError, type ApiError, type ApiErrorCode } from "./http/api-error";
import type { MailAdapter } from "./mail/mail-adapter";

export type AuthDependencies = {
  baseUrl: string;
  appBaseUrl?: string;
  secret?: string;
  trustedOrigins?: string[];
  secureCookies?: boolean;
};

export type AppDependencies = {
  database: AppDatabase;
  frontendRoot?: string;
  auth?: AuthDependencies;
  mailAdapter?: MailAdapter;
  verificationTokenLifetimeMs?: number;
  now?: () => Date;
};

const noOpMailAdapter: MailAdapter = {
  sendVerificationEmail: async ({ to, url }) => {
    console.info(`[correo] Enlace de verificación para ${to}: ${url}`);
  },
};

const verificationTokenLifetimeMsDefault = 60 * 60 * 1000;

/**
 * Endpoints de autenticación cuyas respuestas JSON no deben revelar el token
 * de sesión: la sesión se entrega únicamente en su cookie.
 */
const sessionTokenEndpoints = new Set(["/api/auth/sign-in/email", "/api/auth/get-session"]);

function stripSessionToken(body: unknown): unknown {
  if (typeof body !== "object" || body === null) {
    return body;
  }

  const cleaned = { ...(body as Record<string, unknown>) };
  delete cleaned.token;

  if (typeof cleaned.session === "object" && cleaned.session !== null) {
    const session = { ...(cleaned.session as Record<string, unknown>) };
    delete session.token;
    cleaned.session = session;
  }

  return cleaned;
}

export function normalizeAuthError(body: unknown): ApiError | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const candidate = body as Record<string, unknown>;
  const error = candidate.error;

  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as Record<string, unknown>).code === "string" &&
    typeof (error as Record<string, unknown>).message === "string"
  ) {
    return body as ApiError;
  }

  if (typeof candidate.code === "string" && typeof candidate.message === "string") {
    return {
      error: {
        code: candidate.code as ApiErrorCode,
        message: candidate.message,
      },
    };
  }

  return null;
}

export function createApp({
  database,
  frontendRoot,
  auth: authConfig,
  mailAdapter = noOpMailAdapter,
  verificationTokenLifetimeMs = verificationTokenLifetimeMsDefault,
  now = () => new Date(),
}: AppDependencies): Hono {
  const app = new Hono();
  const healthQuery = z.object({}).strict();

  app.get("/api/health", async (context) => {
    if (!healthQuery.safeParse(context.req.query()).success) {
      return context.json(apiError("INVALID_REQUEST", "La petición no es válida."), 400);
    }

    await database.select({ key: appMetadata.key }).from(appMetadata).limit(1);

    return context.json({
      status: "ok",
      database: "ready",
    });
  });

  if (authConfig) {
    const appBaseUrl = authConfig.appBaseUrl ?? authConfig.baseUrl;
    const auth = createAuth({
      database,
      baseUrl: authConfig.baseUrl,
      appBaseUrl,
      secret: authConfig.secret,
      trustedOrigins: authConfig.trustedOrigins,
      secureCookies: authConfig.secureCookies,
      mailAdapter,
      verificationTokenLifetimeMs,
      now,
    });

    app.get("/api/auth/verify-email", async (context) => {
      const token = context.req.query("token");
      const outcome =
        token && token.length > 0
          ? await consumeVerificationToken(database, { rawToken: token, now: now() })
          : "invalid";

      const estado = outcome === "success" ? "verificado" : "invalido";
      return context.redirect(`${appBaseUrl}/verificar?estado=${estado}`);
    });

    app.all("/api/auth/*", async (context) => {
      const response = await auth.handler(context.req.raw);
      const pathname = new URL(context.req.url).pathname;

      if (response.ok && sessionTokenEndpoints.has(pathname)) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const body = (await response.json().catch(() => null)) as unknown;
          const cleaned = stripSessionToken(body);
          return new Response(JSON.stringify(cleaned), {
            status: response.status,
            headers: new Headers(response.headers),
          });
        }
      }

      if (response.ok) {
        return response;
      }

      let errorBody: unknown = null;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        errorBody = (await response.json().catch(() => null)) as unknown;
      }

      const normalized =
        normalizeAuthError(errorBody) ??
        apiError("AUTH_ERROR", "La petición de autenticación ha fallado.");

      return new Response(JSON.stringify(normalized), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    });
  }

  if (frontendRoot) {
    const resolvedFrontendRoot = resolve(frontendRoot);

    app.get("*", async (context) => {
      if (context.req.path === "/api" || context.req.path.startsWith("/api/")) {
        return context.notFound();
      }

      const requestedPath = resolve(
        resolvedFrontendRoot,
        `.${decodeURIComponent(context.req.path)}`,
      );
      const staysInsideFrontendRoot =
        requestedPath === resolvedFrontendRoot ||
        requestedPath.startsWith(`${resolvedFrontendRoot}${sep}`);

      if (staysInsideFrontendRoot) {
        const asset = Bun.file(requestedPath);

        if (await asset.exists()) {
          return new Response(asset);
        }
      }

      if (extname(context.req.path)) {
        return context.notFound();
      }

      const index = Bun.file(join(resolvedFrontendRoot, "index.html"));
      return (await index.exists()) ? new Response(index) : context.notFound();
    });
  }

  app.notFound((context) => {
    if (context.req.path === "/api" || context.req.path.startsWith("/api/")) {
      return context.json(
        apiError("NOT_FOUND", "El recurso solicitado no existe."),
        404,
      );
    }

    return context.text("Not Found", 404);
  });

  return app;
}
