import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubFetch } from "../test/mock-fetch";
import { emptyDashboard } from "../test/dashboard-fixtures";
import type { SessionDocument } from "../features/sessions/api/sessions-api";
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

const activeSession: SessionDocument = {
  id: "sesion-activa",
  revision: 3,
  origin: "libre",
  status: "activa",
  datePerformed: "2025-03-10",
  plannedDate: null,
  routineId: null,
  planTrainingId: null,
  lastExerciseId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  exercises: [
    {
      id: "cccccccccccccccccccccccccccccccc",
      exerciseId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sortOrder: 0,
      added: false,
      exercise: {
        id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Press de banca con barra",
        recordingMode: "fuerza_con_carga",
        provenance: "catalogo",
      },
      series: [],
    },
    {
      id: "dddddddddddddddddddddddddddddddd",
      exerciseId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      sortOrder: 1,
      added: false,
      exercise: {
        id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        name: "Sentadilla búlgara",
        recordingMode: "fuerza_con_carga",
        provenance: "personalizado",
      },
      series: [],
    },
  ],
  startedAt: "2025-03-10T09:30:00.000Z",
  updatedAt: "2025-03-10T10:05:00.000Z",
};

function stubApp(session: SessionDocument | null) {
  stubFetch((url) => {
    if (url === "/api/auth/get-session") {
      return { status: 200, body: verifiedSession };
    }
    if (url.startsWith("/api/dashboard")) {
      // Inicio consume el contrato del dashboard: sin datos basta para el
      // acceso persistente; el estado vacío de Inicio no participa aquí.
      return { status: 200, body: emptyDashboard };
    }
    if (url === "/api/sessions/active") {
      return { status: 200, body: { session } };
    }
    if (url === "/api/sessions/sesion-activa") {
      return { status: 200, body: { session } };
    }
    if (url.startsWith("/api/exercises")) {
      return { status: 200, body: { items: [], nextCursor: null } };
    }
    if (url === "/api/health") {
      return { status: 200, body: { status: "ok", database: "ready" } };
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
  });
}

describe("acceso persistente a la Sesión activa", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("con Sesión activa muestra el acceso persistente fuera de Inicio", async () => {
    stubApp(activeSession);
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sesión activa" })).not.toBeInTheDocument();

    const mobileNavigation = await screen.findByRole("navigation", {
      name: "Navegación móvil",
    });
    await userEvent
      .setup()
      .click(within(mobileNavigation).getByRole("link", { name: "Rutinas" }));

    const access = await screen.findByRole("region", { name: "Sesión activa" });
    expect(within(access).getByText("Sesión libre")).toBeInTheDocument();
    expect(within(access).getByText("Entrenamiento libre · 10/03/2025")).toBeInTheDocument();
    expect(within(access).getByText("2 ejercicios")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(access).getByRole("link", { name: "Continuar" }));

    expect(window.location.pathname).toBe("/sesion/sesion-activa");
    expect(await screen.findByRole("heading", { name: "Sesión activa" })).toBeInTheDocument();
  });

  test("sin Sesión activa no muestra el acceso persistente", async () => {
    stubApp(null);
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Sesión activa" }),
    ).not.toBeInTheDocument();
  });
});
