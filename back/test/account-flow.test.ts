import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { migrateDatabase } from "../src/db/migrate";
import { openDatabase, type DatabaseConnection } from "../src/db/open-database";
import type { MailAdapter } from "../src/mail/mail-adapter";

const baseUrl = "http://127.0.0.1:3000";
const origin = baseUrl;

type SentVerificationEmail = { to: string; url: string };

type TestContext = {
  connection: DatabaseConnection;
  app: ReturnType<typeof createApp>;
  sentEmails: SentVerificationEmail[];
  mailAdapter: MailAdapter;
  currentTime: Date;
  advanceTime: (milliseconds: number) => void;
};

function tokenFromUrl(url: string): string {
  return new URL(url).searchParams.get("token") ?? "";
}

function createTestContext(): TestContext {
  let currentTime = new Date("2026-08-02T12:00:00.000Z");
  const sentEmails: SentVerificationEmail[] = [];
  const mailAdapter: MailAdapter = {
    sendVerificationEmail: async ({ to, url }) => {
      sentEmails.push({ to, url });
    },
  };
  const connection = openDatabase(":memory:");
  return {
    connection,
    app: createApp({
      database: connection.db,
      auth: { baseUrl, trustedOrigins: [origin] },
      mailAdapter,
      now: () => currentTime,
      verificationTokenLifetimeMs: 60 * 60 * 1000,
    }),
    sentEmails,
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
});
