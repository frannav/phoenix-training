import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";

const verifiedSession = {
  session: { id: "sesion-opaca", expiresAt: "2026-08-09T00:00:00.000Z", userId: "cuenta-opaca" },
  user: {
    id: "cuenta-opaca",
    email: "deportista@example.com",
    name: "deportista",
    emailVerified: true,
  },
};

const emptySession = {
  id: "sesion-opaca",
  revision: 1,
  origin: "libre",
  status: "activa",
  datePerformed: "2025-03-10",
  lastExerciseId: null,
  exercises: [],
  startedAt: "2025-03-10T09:30:00.000Z",
  updatedAt: "2025-03-10T09:30:00.000Z",
};

describe("application navigation", () => {
  const agreedDestinations = [
    ["/registro", "Crear cuenta"],
    ["/verificar", "Verificar correo"],
    ["/recuperar", "Recuperar contraseña"],
    ["/restablecer", "Restablecer contraseña"],
    ["/planes/nuevo", "Nuevo Plan"],
    ["/planes/plan-opaco", "Detalle del Plan"],
    ["/rutinas", "Rutinas"],
    ["/rutinas/nueva", "Nueva Rutina"],
    ["/rutinas/rutina-opaca", "Detalle de la Rutina"],
    ["/historial", "Historial"],
    ["/historial/sesion-opaca", "Detalle de la Sesión"],
    ["/ejercicios", "Ejercicios"],
    ["/cuenta", "Cuenta"],
    ["/sesion/sesion-opaca", "Sesión activa"],
  ] as const;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/auth/get-session") {
          return Response.json(verifiedSession);
        }
        if (url === "/api/sessions/active") {
          return Response.json({ session: null });
        }
        if (url === "/api/sessions/sesion-opaca") {
          return Response.json({ session: emptySession });
        }
        if (url.startsWith("/api/exercises")) {
          return Response.json({ items: [], nextCursor: null });
        }
        return Response.json({
          status: "ok",
          database: "ready",
        });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("a Deportista can reach Planes from the mobile navigation", async () => {
    const user = userEvent.setup();
    render(<App />);

    const mobileNavigation = await screen.findByRole("navigation", {
      name: "Navegación móvil",
    });
    await user.click(within(mobileNavigation).getByRole("link", { name: "Planes" }));

    expect(await screen.findByRole("heading", { name: "Planes" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/planes");
  });

  test("Más gives direct access to Ejercicios and Cuenta", async () => {
    const user = userEvent.setup();
    render(<App />);

    const mobileNavigation = await screen.findByRole("navigation", {
      name: "Navegación móvil",
    });
    await user.click(within(mobileNavigation).getByRole("button", { name: "Más" }));

    const moreDestinations = screen.getByRole("dialog", { name: "Más destinos" });
    expect(
      within(moreDestinations).getByRole("link", { name: "Ejercicios" }),
    ).toBeInTheDocument();
    expect(
      within(moreDestinations).getByRole("link", { name: "Cuenta" }),
    ).toBeInTheDocument();
  });

  test("desktop navigation exposes every main area", async () => {
    render(<App />);

    const desktopNavigation = await screen.findByRole("navigation", {
      name: "Navegación de escritorio",
    });

    for (const destination of [
      "Inicio",
      "Planes",
      "Rutinas",
      "Historial",
      "Ejercicios",
      "Cuenta",
    ]) {
      expect(
        within(desktopNavigation).getByRole("link", { name: destination }),
      ).toBeInTheDocument();
    }
  });

  test("the login route is navigable outside the private AppShell", () => {
    window.history.replaceState({}, "", "/entrar");

    render(<App />);

    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Navegación móvil" }),
    ).not.toBeInTheDocument();
  });

  test.each(agreedDestinations)("%s has an agreed destination", async (path, heading) => {
    window.history.replaceState({}, "", path);

    render(<App />);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });
});
