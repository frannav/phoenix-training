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
  secret?: string;
  trustedOrigins?: string[];
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

function normalizeAuthError(body: unknown): ApiError | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const candidate = body as Record<string, unknown>;

  if (
    typeof candidate.error === "object" &&
    candidate.error !== null &&
    typeof (candidate.error as Record<string, unknown>).code === "string"
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
    const auth = createAuth({
      database,
      baseUrl: authConfig.baseUrl,
      secret: authConfig.secret,
      trustedOrigins: authConfig.trustedOrigins,
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
      return context.redirect(`/verificar?estado=${estado}`);
    });

    app.all("/api/auth/*", async (context) => {
      const response = await auth.handler(context.req.raw);

      if (response.ok) {
        return response;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        return response;
      }

      const body = (await response.json().catch(() => null)) as unknown;
      const normalized = normalizeAuthError(body);

      if (normalized) {
        return new Response(JSON.stringify(normalized), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      return response;
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
