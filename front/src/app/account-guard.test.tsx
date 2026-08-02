import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { stubFetch } from "../test/mock-fetch";

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
});
