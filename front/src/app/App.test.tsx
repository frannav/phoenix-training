import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { emptyDashboard } from "../test/dashboard-fixtures";
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
        if (url.startsWith("/api/dashboard")) {
          // Inicio consume el contrato del dashboard; sin datos basta para
          // la navegación, que es lo que se comprueba aquí.
          return Response.json(emptyDashboard);
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
        if (url === "/api/routines") {
          return Response.json({ items: [] });
        }
        if (url === "/api/routines/rutina-opaca") {
          return Response.json({
            routine: {
              id: "rutina-opaca",
              name: "Detalle de la Rutina",
              revision: 1,
              archived: false,
              createdAt: "2025-08-01T10:00:00.000Z",
              updatedAt: "2025-08-01T10:00:00.000Z",
              exercises: [],
            },
          });
        }
        if (url === "/api/plans") {
          return Response.json({ items: [] });
        }
        if (url === "/api/plans/plan-opaco") {
                    return Response.json({
            plan: {
              id: "plan-opaco",
              name: "Detalle del Plan",
              status: "borrador",
              revision: 1,
              createdAt: "2025-08-01T10:00:00.000Z",
              updatedAt: "2025-08-01T10:00:00.000Z",
              weeks: [],
            },
          });
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
