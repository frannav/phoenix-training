import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { stubFetch } from "../test/mock-fetch";

type Session = {
  session: { id: string; expiresAt: string; userId: string };
  user: { id: string; email: string; name: string; emailVerified: boolean };
} | null;

const verifiedSession: Session = {
  session: { id: "sesion-opaca", expiresAt: "2026-08-09T00:00:00.000Z", userId: "cuenta-opaca" },
  user: {
    id: "cuenta-opaca",
    email: "deportista@example.com",
    name: "deportista",
    emailVerified: true,
  },
};
function renderAppAt(path: string) {
  window.history.replaceState({}, "", path);
  return render(<App />);
}

describe("guard de rutas privadas", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("una persona anónima es enviada a la entrada", async () => {
    stubFetch((url) => {
      if (url === "/api/auth/get-session") {
        return { status: 200, body: null };
      }
      return { status: 200, body: { status: "ok", database: "ready" } };
    });

    renderAppAt("/");

    expect(
      await screen.findByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/entrar");
    expect(
      screen.queryByRole("navigation", { name: "Navegación móvil" }),
    ).not.toBeInTheDocument();
  });

  test("una Cuenta pendiente de verificación no accede a datos privados", async () => {
    stubFetch((url) => {
      if (url === "/api/auth/get-session") {
        return {
          status: 200,
          body: {
            session: { id: "sesion-opaca", expiresAt: "2026-08-09T00:00:00.000Z", userId: "cuenta-opaca" },
            user: {
              id: "cuenta-opaca",
              email: "pendiente@example.com",
              name: "pendiente",
              emailVerified: false,
            },
          },
        };
      }
      return { status: 200, body: { status: "ok", database: "ready" } };
    });

    renderAppAt("/planes");

    expect(
      await screen.findByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/entrar");
  });

  test("una Cuenta verificada puede recorrer las rutas privadas", async () => {
    stubFetch((url) => {
      if (url === "/api/auth/get-session") {
        return {
          status: 200,
          body: {
            session: { id: "sesion-opaca", expiresAt: "2026-08-09T00:00:00.000Z", userId: "cuenta-opaca" },
            user: {
              id: "cuenta-opaca",
              email: "deportista@example.com",
              name: "deportista",
              emailVerified: true,
            },
          },
        };
      }
      return { status: 200, body: { status: "ok", database: "ready" } };
    });

    renderAppAt("/");

    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  test("una persona anónima puede autenticarse y entrar en la ruta privada sin ser devuelta", async () => {
    let session: Session = null;
    stubFetch((url) => {
      if (url === "/api/auth/get-session") {
        return { status: 200, body: session };
      }
      if (url === "/api/auth/sign-in/email") {
        session = verifiedSession;
        return { status: 200, body: { user: verifiedSession.user } };
      }
      return { status: 200, body: { status: "ok", database: "ready" } };
    });

    renderAppAt("/");
    expect(
      await screen.findByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Correo electrónico"), "deportista@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "contraseña-segura");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  test("cerrar sesión deniega de nuevo las rutas privadas sin reutilizar la sesión cacheada", async () => {
    let session: Session = verifiedSession;
    stubFetch((url) => {
      if (url === "/api/auth/get-session") {
        return { status: 200, body: session };
      }
      if (url === "/api/auth/sign-out") {
        session = null;
        return { status: 200, body: { success: true } };
      }
      return { status: 200, body: { status: "ok", database: "ready" } };
    });

    renderAppAt("/cuenta");
    expect(await screen.findByRole("heading", { name: "Cuenta" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(
      await screen.findByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Phoenix Training" }));

    expect(
      await screen.findByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/entrar");
  });
});
