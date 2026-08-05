import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { extname, join, resolve, sep } from "node:path";
import { z } from "zod";
import { createAuth } from "./auth/auth";
import {
  createVerificationToken,
  consumeVerificationToken,
  hashVerificationToken,
  issuePasswordResetToken,
  issueVerificationToken,
} from "./auth/verification-tokens";
import { appMetadata, passwordResetToken, user, verification } from "./db/schema";
import type { AppDatabase } from "./db/open-database";
import { apiError, type ApiError, type ApiErrorCode } from "./http/api-error";
import { opaqueCursorKey } from "./http/opaque-cursor";
import { createExercisesRouter } from "./exercises/exercises-router";
import { createSessionsRouter } from "./sessions/sessions-router";
import { createRoutinesRouter } from "./routines/routines-router";
import { createPlansRouter } from "./plans/plans-router";
import { createAccountRouter } from "./account/account-router";
import { createDashboardRouter } from "./dashboard/dashboard-router";
import { createDiaryRouter } from "./diary/diary-router";
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
  passwordResetTokenLifetimeMs?: number;
  now?: () => Date;
};

const noOpMailAdapter: MailAdapter = {
  sendVerificationEmail: async ({ to, url }) => {
    console.info(`[correo] Enlace de verificación para ${to}: ${url}`);
  },
  sendPasswordResetEmail: async ({ to, url }) => {
    console.info(`[correo] Enlace de recuperación para ${to}: ${url}`);
  },
};

const verificationTokenLifetimeMsDefault = 60 * 60 * 1000;
const passwordResetTokenLifetimeMsDefault = 60 * 60 * 1000;

/**
 * Endpoints de autenticación cuyas respuestas JSON no deben revelar el token
 * de sesión: la sesión se entrega únicamente en su cookie.
 */
const sessionTokenEndpoints = new Set(["/api/auth/sign-in/email", "/api/auth/get-session"]);
const requestPasswordResetSchema = z.object({ email: z.email() });

const passwordResetResponse = {
  status: true,
  message: "Si el correo existe, recibirás instrucciones para recuperar el acceso.",
};

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

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function forwardedAuthRequest(request: Request, pathname: string, body?: unknown): Request {
  const headers = new Headers(request.headers);
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  return new Request(new URL(pathname, request.url), {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
  passwordResetTokenLifetimeMs = passwordResetTokenLifetimeMsDefault,
  now = () => new Date(),
}: AppDependencies): Hono {
  const app = new Hono();
  const cursorKey = opaqueCursorKey(authConfig?.secret);
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

    const authenticatedUserId = async (request: Request): Promise<string | null> => {
      const session = await auth.api
        .getSession({ headers: request.headers })
        .catch(() => null);
      return session ? session.user.id : null;
    };

    const requestPasswordReset = async (request: Request): Promise<Response> => {
      const body = await request.clone().json().catch(() => null);
      const parsed = requestPasswordResetSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse(apiError("VALIDATION_ERROR", "La petición no es válida."), 400);
      }

      const email = parsed.data.email.trim().toLowerCase();
      const account = await database
        .select({ id: user.id, email: user.email, emailVerified: user.emailVerified })
        .from(user)
        .where(eq(user.email, email))
        .get();

      if (!account) {
        return jsonResponse(passwordResetResponse);
      }

      if (!account.emailVerified) {
        const token = await issueVerificationToken(database, {
          userId: account.id,
          email: account.email,
          now: now(),
          lifetimeMs: verificationTokenLifetimeMs,
        });
        await mailAdapter.sendVerificationEmail({
          to: account.email,
          url: `${appBaseUrl}/api/auth/verify-email?token=${token}`,
        });
        return jsonResponse(passwordResetResponse);
      }

      const token = await issuePasswordResetToken(database, {
        userId: account.id,
        now: now(),
        lifetimeMs: passwordResetTokenLifetimeMs,
      });
      await mailAdapter.sendPasswordResetEmail?.({
        to: account.email,
        url: `${appBaseUrl}/restablecer?token=${token}`,
      });
      return jsonResponse(passwordResetResponse);
    };

    const clearSessionCookie = async (request: Request): Promise<Response> => {
      return auth.handler(forwardedAuthRequest(request, "/api/auth/sign-out"));
    };

    const revokeAllSessions = async (request: Request): Promise<Response> => {
      const revoked = await auth.handler(
        forwardedAuthRequest(request, "/api/auth/revoke-sessions"),
      );
      if (!revoked.ok) {
        return revoked;
      }

      const signedOut = await clearSessionCookie(request);
      return jsonResponse({ status: true }, 200, signedOut.headers);
    };

    const changePassword = async (request: Request): Promise<Response> => {
      const body = await request.clone().json().catch(() => ({}));
      const changed = await auth.handler(
        forwardedAuthRequest(request, "/api/auth/change-password", {
          ...(typeof body === "object" && body !== null ? body : {}),
          revokeOtherSessions: false,
        }),
      );
      if (!changed.ok) {
        return changed;
      }

      return revokeAllSessions(request);
    };

    const resetPassword = async (request: Request): Promise<Response> => {
      const body = await request.clone().json().catch(() => null);
      const rawToken =
        typeof body === "object" && body !== null && "token" in body && typeof body.token === "string"
          ? body.token
          : "";
      const tokenHash = rawToken ? hashVerificationToken(rawToken) : "";
      const token = tokenHash
        ? await database
            .select()
            .from(passwordResetToken)
            .where(eq(passwordResetToken.tokenHash, tokenHash))
            .get()
        : undefined;

      if (!token || token.usedAt !== null || token.expiresAt.getTime() <= now().getTime()) {
        return jsonResponse(
          apiError("INVALID_TOKEN", "El enlace no es válido o ha vencido."),
          400,
        );
      }

      const internalToken = createVerificationToken();
      const internalExpiresAt = new Date(Date.now() + 60 * 1000);
      await database.insert(verification).values({
        id: createVerificationToken(),
        identifier: `reset-password:${internalToken}`,
        value: token.userId,
        expiresAt: internalExpiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      try {
        const changed = await auth.handler(
          forwardedAuthRequest(request, "/api/auth/reset-password", {
            ...(typeof body === "object" && body !== null ? body : {}),
            token: internalToken,
          }),
        );
        if (!changed.ok) {
          const errorBody = await changed.clone().json().catch(() => null);
          const normalized = normalizeAuthError(errorBody);
          if (normalized?.error.code === "PASSWORD_TOO_SHORT") {
            return jsonResponse(
              apiError("PASSWORD_TOO_SHORT", "La contraseña debe tener al menos 8 caracteres."),
              400,
            );
          }
          if (normalized?.error.code === "PASSWORD_TOO_LONG") {
            return jsonResponse(
              apiError("PASSWORD_TOO_LONG", "La contraseña no puede superar los 128 caracteres."),
              400,
            );
          }
          return jsonResponse(
            apiError("INVALID_TOKEN", "El enlace no es válido o ha vencido."),
            400,
          );
        }

        await database
          .update(passwordResetToken)
          .set({ usedAt: now() })
          .where(
            and(
              eq(passwordResetToken.tokenHash, tokenHash),
              isNull(passwordResetToken.usedAt),
            ),
          );
        return jsonResponse({ status: true });
      } finally {
        await database
          .delete(verification)
          .where(eq(verification.identifier, `reset-password:${internalToken}`));
      }
    };

    app.all("/api/auth/*", async (context) => {      const pathname = new URL(context.req.url).pathname;
      const response =
        pathname === "/api/auth/request-password-reset"
          ? await requestPasswordReset(context.req.raw)
          : pathname === "/api/auth/change-password"
            ? await changePassword(context.req.raw)
          : pathname === "/api/auth/revoke-sessions"
            ? await revokeAllSessions(context.req.raw)
            : pathname === "/api/auth/reset-password"
              ? await resetPassword(context.req.raw)
              : await auth.handler(context.req.raw);

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

    app.route(
      "/api",
      createExercisesRouter({
        database,
        cursorKey,
        authenticatedUserId,
        now,
      }),
    );

    app.route(
      "/api",
      createSessionsRouter({
        database,
        cursorKey,
        authenticatedUserId,
        now,
      }),
    );

    app.route(
      "/api",
      createRoutinesRouter({
        database,
        authenticatedUserId,
        now,
      }),
    );

    app.route(
      "/api",
      createPlansRouter({
        database,
        authenticatedUserId,
        now,
      }),
    );

    app.route(
      "/api",
      createAccountRouter({
        database,
        authenticatedUserId,
        clearSessionCookie,
      }),
    );

    app.route(
      "/api",
      createDashboardRouter({
        database,
        authenticatedUserId,
        now,
      }),
    );

    app.route(
      "/api",
      createDiaryRouter({
        database,
        authenticatedUserId,
      }),
    );
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
