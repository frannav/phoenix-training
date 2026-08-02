import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, normalizeAuthError } from "../src/app";
import { migrateDatabase } from "../src/db/migrate";
import { openDatabase, type DatabaseConnection } from "../src/db/open-database";
import type { MailAdapter } from "../src/mail/mail-adapter";

const baseUrl = "http://127.0.0.1:3000";
const origin = baseUrl;

type SentVerificationEmail = { to: string; url: string };
type SentPasswordResetEmail = { to: string; url: string };

type TestContext = {
  connection: DatabaseConnection;
  app: ReturnType<typeof createApp>;
  sentEmails: SentVerificationEmail[];
  sentPasswordResetEmails: SentPasswordResetEmail[];
  mailAdapter: MailAdapter;
  currentTime: Date;
  advanceTime: (milliseconds: number) => void;
};

function tokenFromUrl(url: string): string {
  return new URL(url).searchParams.get("token") ?? "";
}

function createTestContext(
  secureCookies = false,
  passwordResetTokenLifetimeMs = 60 * 60 * 1000,
): TestContext {
  let currentTime = new Date();
  const sentEmails: SentVerificationEmail[] = [];
  const sentPasswordResetEmails: SentPasswordResetEmail[] = [];
  const mailAdapter: MailAdapter = {
    sendVerificationEmail: async ({ to, url }) => {
      sentEmails.push({ to, url });
    },
    sendPasswordResetEmail: async ({ to, url }) => {
      sentPasswordResetEmails.push({ to, url });
    },
  };
  const connection = openDatabase(":memory:");
  return {
    connection,
    app: createApp({
      database: connection.db,
      auth: { baseUrl, trustedOrigins: [origin], secureCookies },
      mailAdapter,
      now: () => currentTime,
      verificationTokenLifetimeMs: 60 * 60 * 1000,
      passwordResetTokenLifetimeMs,
    }),
    sentEmails,
    sentPasswordResetEmails,
    mailAdapter,
    currentTime,
    advanceTime: (milliseconds) => {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
}

async function migrate(context: TestContext): Promise<void> {
  await migrateDatabase(context.connection.db);
}

describe("registro público de una Cuenta", () => {
  let context: TestContext | undefined;

  beforeEach(async () => {
    context = createTestContext();
    await migrate(context);
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("crea una Cuenta pendiente, normaliza el correo y envía un enlace por el adaptador", async () => {
    const response = await context!.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        name: "Deportista",
        email: "Deportista@Example.com",
        password: "contraseña-segura",
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      token: string | null;
      user: { email: string; emailVerified: boolean };
    };
    expect(body.token).toBeNull();
    expect(body.user.email).toBe("deportista@example.com");
    expect(body.user.emailVerified).toBe(false);

    expect(context!.sentEmails).toHaveLength(1);
    const sent = context!.sentEmails[0]!;
    expect(sent.to).toBe("deportista@example.com");
    expect(sent.url).toContain("/api/auth/verify-email?token=");
    expect(tokenFromUrl(sent.url)).not.toBe("");
  });

  test("no revela si el correo ya está registrado ni reenvía otro enlace", async () => {
    const register = async (email: string) => {
      const response = await context!.app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ name: "Deportista", email, password: "contraseña-segura" }),
      });
      return { status: response.status, body: (await response.json()) as { token: string | null; user: { email: string; emailVerified: boolean } } };
    };

    const first = await register("deportista@example.com");
    const second = await register("deportista@example.com");

    expect(second.status).toBe(first.status);
    expect(second.body.token).toBeNull();
    expect(second.body.user.email).toBe(first.body.user.email);
    expect(second.body.user.emailVerified).toBe(false);
    expect(context!.sentEmails).toHaveLength(1);
  });

  test("exige una contraseña de entre 8 y 128 caracteres", async () => {
    const attempt = async (password: string) => {
      const response = await context!.app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ name: "Deportista", email: "deportista@example.com", password }),
      });
      return { status: response.status, body: (await response.json()) as { error?: { code?: string } } };
    };

    expect((await attempt("corta12")).status).toBe(400);
    expect((await attempt("x".repeat(129))).status).toBe(400);
    expect((await attempt("contraseña-segura")).status).toBe(200);
  });

  test("rechaza un correo con formato inválido", async () => {
    const response = await context!.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ name: "Deportista", email: "no-es-un-correo", password: "contraseña-segura" }),
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "VALIDATION_ERROR",
    );
    expect(context!.sentEmails).toHaveLength(0);
  });
});

type JsonBody = Record<string, unknown>;

async function registerPending(
  context: TestContext,
  email = "deportista@example.com",
  password = "contraseña-segura",
): Promise<string> {
  const response = await context.app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ name: "Deportista", email, password }),
  });
  expect(response.status).toBe(200);
  const sent = context.sentEmails.at(-1);
  expect(sent).toBeDefined();
  return tokenFromUrl(sent!.url);
}

async function verifyLink(context: TestContext, token: string) {
  const response = await context.app.request(`/api/auth/verify-email?token=${token}`);
  return { status: response.status, location: response.headers.get("location") };
}

async function signIn(
  context: TestContext,
  email: string,
  password: string,
  cookies: string[],
): Promise<{ status: number; body: JsonBody; setCookies: string[] }> {
  const response = await context.app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookies.length > 0 ? { Cookie: cookies.join("; ") } : {}),
    },
    body: JSON.stringify({ email, password }),
  });
  return {
    status: response.status,
    body: (await response.json()) as JsonBody,
    setCookies: response.headers.getSetCookie(),
  };
}

function sessionCookieFrom(setCookies: string[]): string {
  const match = setCookies
    .map((entry: string) => entry.split(";")[0])
    .filter((entry): entry is string => entry !== undefined)
    .find((entry) => entry.startsWith("better-auth.session_token="));
  expect(match).toBeDefined();
  return match!;
}

async function getSession(context: TestContext, cookie: string) {
  const response = await context.app.request("/api/auth/get-session", {
    headers: { Cookie: cookie, Origin: origin },
  });
  return { status: response.status, body: (await response.json()) as JsonBody | null };
}

async function requestPasswordReset(context: TestContext, email: string) {
  const response = await context.app.request("/api/auth/request-password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email }),
  });
  return { status: response.status, body: (await response.json()) as JsonBody };
}

async function resetPassword(context: TestContext, token: string, newPassword: string) {
  const response = await context.app.request("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ token, newPassword }),
  });
  return { status: response.status, body: (await response.json()) as JsonBody };
}

async function changePassword(
  context: TestContext,
  cookie: string,
  currentPassword: string,
  newPassword: string,
) {
  const response = await context.app.request("/api/auth/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: cookie,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return { status: response.status, body: (await response.json()) as JsonBody };
}

async function revokeAllSessions(context: TestContext, cookie: string) {
  const response = await context.app.request("/api/auth/revoke-sessions", {
    method: "POST",
    headers: { Origin: origin, Cookie: cookie },
  });
  return { status: response.status, body: (await response.json()) as JsonBody };
}

describe("verificación del correo", () => {
  let context: TestContext | undefined;

  beforeEach(async () => {
    context = createTestContext();
    await migrate(context);
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("un enlace válido verifica la Cuenta una sola vez y permite iniciar sesión", async () => {
    const token = await registerPending(context!);

    const first = await verifyLink(context!, token);
    expect(first.status).toBe(302);
    expect(first.location).toContain("/verificar?estado=verificado");

    const second = await verifyLink(context!, token);
    expect(second.status).toBe(302);
    expect(second.location).toContain("/verificar?estado=invalido");

    const denied = await signIn(context!, "deportista@example.com", "contraseña-segura", []);
    expect(denied.status).toBe(200);
    expect(denied.body.user).toMatchObject({ email: "deportista@example.com", emailVerified: true });
    expect(denied.setCookies).toHaveLength(1);

    const cookie = sessionCookieFrom(denied.setCookies);
    const session = await getSession(context!, cookie);
    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({
      session: expect.any(Object) as unknown,
      user: { email: "deportista@example.com", emailVerified: true },
    });
  });

  test("un enlace vencido no verifica la Cuenta", async () => {
    const token = await registerPending(context!);

    context!.advanceTime(60 * 60 * 1000 + 1);

    const outcome = await verifyLink(context!, token);
    expect(outcome.status).toBe(302);
    expect(outcome.location).toContain("/verificar?estado=invalido");

    const denied = await signIn(context!, "deportista@example.com", "contraseña-segura", []);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  });

  test("solicitar otro enlace invalida los anteriores", async () => {
    const firstToken = await registerPending(context!);

    const resend = await context!.app.request("/api/auth/send-verification-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email: "deportista@example.com" }),
    });
    expect(resend.status).toBe(200);
    expect((await resend.json()) as JsonBody).toEqual({ status: true });

    const secondToken = tokenFromUrl(context!.sentEmails.at(-1)!.url);
    expect(secondToken).not.toBe(firstToken);
    expect(context!.sentEmails).toHaveLength(2);

    const replaced = await verifyLink(context!, firstToken);
    expect(replaced.location).toContain("/verificar?estado=invalido");

    const valid = await verifyLink(context!, secondToken);
    expect(valid.location).toContain("/verificar?estado=verificado");
  });

  test("un enlace desconocido conduce a solicitar otro", async () => {
    const outcome = await verifyLink(context!, "enlace-inventado");
    expect(outcome.status).toBe(302);
    expect(outcome.location).toContain("/verificar?estado=invalido");
  });

  test("la solicitud de otro enlace no revela si el correo existe", async () => {
    const response = await context!.app.request("/api/auth/send-verification-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email: "nadie@example.com" }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as JsonBody).toEqual({ status: true });
    expect(context!.sentEmails).toHaveLength(0);
  });
});

describe("recuperación de credenciales", () => {
  let context: TestContext | undefined;

  beforeEach(async () => {
    context = createTestContext();
    await migrate(context);
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("una Cuenta pendiente recibe verificación y no un enlace de recuperación", async () => {
    await registerPending(context!, "pendiente@example.com");

    const response = await requestPasswordReset(context!, "pendiente@example.com");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: true });
    expect(context!.sentPasswordResetEmails).toHaveLength(0);
    expect(context!.sentEmails).toHaveLength(2);
    expect(context!.sentEmails.at(-1)!.url).toContain("/api/auth/verify-email?token=");
  });

  test("una Cuenta verificada recibe un enlace de un solo uso y el anterior queda invalidado", async () => {
    const verificationToken = await registerPending(context!, "deportista@example.com");
    await verifyLink(context!, verificationToken);

    const first = await requestPasswordReset(context!, "deportista@example.com");
    const firstToken = tokenFromUrl(context!.sentPasswordResetEmails.at(-1)!.url);
    const second = await requestPasswordReset(context!, "deportista@example.com");
    const secondToken = tokenFromUrl(context!.sentPasswordResetEmails.at(-1)!.url);

    expect(first.status).toBe(200);
    expect(second.status).toBe(first.status);
    expect(firstToken).not.toBe(secondToken);
    expect(context!.sentPasswordResetEmails).toHaveLength(2);

    const replaced = await resetPassword(context!, firstToken, "nueva-contraseña");
    expect(replaced.status).toBe(400);

    const valid = await resetPassword(context!, secondToken, "nueva-contraseña");
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({ status: true });
    expect((await resetPassword(context!, secondToken, "otra-contraseña")).status).toBe(400);

    const oldPassword = await signIn(context!, "deportista@example.com", "contraseña-segura", []);
    expect(oldPassword.status).toBe(401);
    const newPassword = await signIn(context!, "deportista@example.com", "nueva-contraseña", []);
    expect(newPassword.status).toBe(200);
  });

  test("una solicitud para un correo desconocido conserva la misma respuesta pública", async () => {
    const response = await requestPasswordReset(context!, "nadie@example.com");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: true });
    expect(context!.sentEmails).toHaveLength(0);
    expect(context!.sentPasswordResetEmails).toHaveLength(0);
  });

  test("un enlace de recuperación vencido no cambia la contraseña", async () => {
    const expiredContext = createTestContext(false, 0);
    await migrate(expiredContext);
    try {
      const verificationToken = await registerPending(expiredContext);
      await verifyLink(expiredContext, verificationToken);
      await requestPasswordReset(expiredContext, "deportista@example.com");
      const resetToken = tokenFromUrl(expiredContext.sentPasswordResetEmails.at(-1)!.url);

      const expired = await resetPassword(expiredContext, resetToken, "nueva-contraseña");

      expect(expired.status).toBe(400);
      expect(
        (await signIn(expiredContext, "deportista@example.com", "contraseña-segura", [])).status,
      ).toBe(200);
    } finally {
      expiredContext.connection.close();
    }
  });

  test("el restablecimiento respeta los límites de contraseña", async () => {
    const verificationToken = await registerPending(context!);
    await verifyLink(context!, verificationToken);

    await requestPasswordReset(context!, "deportista@example.com");
    const shortToken = tokenFromUrl(context!.sentPasswordResetEmails.at(-1)!.url);
    expect((await resetPassword(context!, shortToken, "1234567")).status).toBe(400);
    expect((await resetPassword(context!, shortToken, "12345678")).status).toBe(200);

    await requestPasswordReset(context!, "deportista@example.com");
    const longToken = tokenFromUrl(context!.sentPasswordResetEmails.at(-1)!.url);
    expect((await resetPassword(context!, longToken, "x".repeat(129))).status).toBe(400);
    expect((await resetPassword(context!, longToken, "x".repeat(128))).status).toBe(200);
  });
});

describe("sesiones de Cuenta", () => {
  let context: TestContext | undefined;

  beforeEach(async () => {
    context = createTestContext();
    await migrate(context);
  });

  afterEach(() => {
    context?.connection.close();
  });

  test("una Cuenta pendiente no puede iniciar sesión", async () => {
    await registerPending(context!);

    const denied = await signIn(context!, "deportista@example.com", "contraseña-segura", []);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(denied.setCookies).toHaveLength(0);
  });

  test("sin sesión no hay acceso a la sesión de Cuenta", async () => {
    const session = await getSession(context!, "");
    expect(session.status).toBe(200);
    expect(session.body).toBeNull();
  });

  test("un error de autenticación no normalizable sale en el formato canónico conservando el estado", async () => {
    const response = await context!.app.request("/api/auth/ruta-desconocida", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: "{}",
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect((await response.json()) as JsonBody).toEqual({
      error: { code: "AUTH_ERROR", message: "La petición de autenticación ha fallado." },
    });
  });

  test("el normalizador solo acepta error.code cuando también hay message", () => {
    expect(normalizeAuthError({ error: { code: "SOLO_CODIGO" } })).toBeNull();
    expect(normalizeAuthError({ error: { code: "OK", message: "mensaje" } })).toEqual({
      error: { code: "OK", message: "mensaje" },
    });
    expect(normalizeAuthError({ code: "OK", message: "mensaje" })).toEqual({
      error: { code: "OK", message: "mensaje" },
    });
    expect(normalizeAuthError("texto-plano")).toBeNull();
  });

  test("la entrada no expone el token de sesión en el cuerpo JSON", async () => {
    const token = await registerPending(context!);
    await verifyLink(context!, token);

    const session = await signIn(context!, "deportista@example.com", "contraseña-segura", []);
    expect(session.status).toBe(200);
    expect(session.body).not.toHaveProperty("token");
    expect(session.setCookies).toHaveLength(1);

    const cookie = sessionCookieFrom(session.setCookies);
    const current = await getSession(context!, cookie);
    const sessionObject = current.body as { session: Record<string, unknown>; user: Record<string, unknown> };
    expect(sessionObject.session).not.toHaveProperty("token");
    expect(sessionObject.user).toMatchObject({ emailVerified: true });
  });

  test("en producción la sesión se entrega en una única cookie Secure, HttpOnly y SameSite", async () => {
    const secureContext = createTestContext(true);
    await migrate(secureContext);
    try {
      await registerPending(secureContext, "seguro@example.com");
      const link = secureContext.sentEmails.at(-1)!;
      await verifyLink(secureContext, tokenFromUrl(link.url));

      const session = await signIn(secureContext, "seguro@example.com", "contraseña-segura", []);
      expect(session.status).toBe(200);
      expect(session.setCookies).toHaveLength(1);

      const cookieHeader = session.setCookies[0]!;
      expect(cookieHeader).toContain("__Secure-better-auth.session_token=");
      expect(cookieHeader).toContain("Secure");
      expect(cookieHeader).toContain("HttpOnly");
      expect(cookieHeader.toLowerCase()).toContain("samesite=lax");
    } finally {
      secureContext.connection.close();
    }
  });

  test("cerrar la sesión actual no afecta a otras sesiones de la Cuenta", async () => {
    const token = await registerPending(context!);
    await verifyLink(context!, token);

    const deviceA = await signIn(context!, "deportista@example.com", "contraseña-segura", []);
    const deviceB = await signIn(context!, "deportista@example.com", "contraseña-segura", []);
    expect(deviceA.status).toBe(200);
    expect(deviceB.status).toBe(200);

    const cookieA = sessionCookieFrom(deviceA.setCookies);
    const cookieB = sessionCookieFrom(deviceB.setCookies);
    expect(cookieA).not.toBe(cookieB);

    const signOut = await context!.app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { Origin: origin, Cookie: cookieA },
    });
    expect(signOut.status).toBe(200);

    const closed = await getSession(context!, cookieA);
    expect(closed.body).toBeNull();

    const other = await getSession(context!, cookieB);
    expect(other.status).toBe(200);
    expect(other.body).toMatchObject({
      user: { email: "deportista@example.com", emailVerified: true },
    });
  });

  test("cambiar la contraseña exige la actual y revoca todas las sesiones", async () => {
    const token = await registerPending(context!);
    await verifyLink(context!, token);

    const deviceA = await signIn(context!, "deportista@example.com", "contraseña-segura", []);
    const deviceB = await signIn(context!, "deportista@example.com", "contraseña-segura", []);
    const cookieA = sessionCookieFrom(deviceA.setCookies);
    const cookieB = sessionCookieFrom(deviceB.setCookies);

    const wrong = await changePassword(
      context!,
      cookieA,
      "contraseña-equivocada",
      "nueva-contraseña",
    );
    expect(wrong.status).toBe(400);

    const changed = await changePassword(
      context!,
      cookieA,
      "contraseña-segura",
      "nueva-contraseña",
    );
    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({ status: true });
    expect((await getSession(context!, cookieA)).body).toBeNull();
    expect((await getSession(context!, cookieB)).body).toBeNull();

    expect((await signIn(context!, "deportista@example.com", "contraseña-segura", [])).status).toBe(401);
    expect((await signIn(context!, "deportista@example.com", "nueva-contraseña", [])).status).toBe(200);
  });

  test("cerrar todas las sesiones revoca también la sesión actual", async () => {
    const token = await registerPending(context!);
    await verifyLink(context!, token);
    const deviceA = await signIn(context!, "deportista@example.com", "contraseña-segura", []);
    const deviceB = await signIn(context!, "deportista@example.com", "contraseña-segura", []);
    const cookieA = sessionCookieFrom(deviceA.setCookies);
    const cookieB = sessionCookieFrom(deviceB.setCookies);

    const revoked = await revokeAllSessions(context!, cookieA);

    expect(revoked.status).toBe(200);
    expect(revoked.body).toEqual({ status: true });
    expect((await getSession(context!, cookieA)).body).toBeNull();
    expect((await getSession(context!, cookieB)).body).toBeNull();
    expect(revoked.status).toBe(200);
  });

  test("las credenciales y sesiones de otra Cuenta permanecen aisladas", async () => {
    const accountAToken = await registerPending(context!, "a@example.com");
    const accountBToken = await registerPending(context!, "b@example.com");
    await verifyLink(context!, accountAToken);
    await verifyLink(context!, accountBToken);

    const accountA = await signIn(context!, "a@example.com", "contraseña-segura", []);
    const accountB = await signIn(context!, "b@example.com", "contraseña-segura", []);
    const cookieA = sessionCookieFrom(accountA.setCookies);
    const cookieB = sessionCookieFrom(accountB.setCookies);

    await changePassword(context!, cookieA, "contraseña-segura", "nueva-contraseña");

    expect((await getSession(context!, cookieB)).body).toMatchObject({
      user: { email: "b@example.com" },
    });
    expect((await signIn(context!, "b@example.com", "contraseña-segura", [])).status).toBe(200);
    expect((await signIn(context!, "a@example.com", "contraseña-segura", [])).status).toBe(401);
  });
});
