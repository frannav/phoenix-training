import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";

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
      vi.fn(async () =>
        Response.json({
          status: "ok",
          database: "ready",
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("a Deportista can reach Planes from the mobile navigation", async () => {
    const user = userEvent.setup();
    render(<App />);

    const mobileNavigation = screen.getByRole("navigation", {
      name: "Navegación móvil",
    });
    await user.click(within(mobileNavigation).getByRole("link", { name: "Planes" }));

    expect(await screen.findByRole("heading", { name: "Planes" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/planes");
  });

  test("Más gives direct access to Ejercicios and Cuenta", async () => {
    const user = userEvent.setup();
    render(<App />);

    const mobileNavigation = screen.getByRole("navigation", {
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

  test("desktop navigation exposes every main area", () => {
    render(<App />);

    const desktopNavigation = screen.getByRole("navigation", {
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

  test.each(agreedDestinations)("%s has an agreed destination", (path, heading) => {
    window.history.replaceState({}, "", path);

    render(<App />);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });
});
