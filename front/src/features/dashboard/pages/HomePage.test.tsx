import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubFetch } from "../../../test/mock-fetch";
import type { SessionDocument } from "../../sessions/api/sessions-api";
import { App } from "../../../app/App";

const verifiedSession = {
  session: { id: "sesion-opaca", expiresAt: "2026-08-09T00:00:00.000Z", userId: "cuenta-opaca" },
  user: {
    id: "cuenta-opaca",
    email: "deportista@example.com",
    name: "deportista",
    emailVerified: true,
  },
};

const emptySession: SessionDocument = {
  id: "sesion-nueva",
  revision: 1,
  origin: "libre",
  status: "activa",
  datePerformed: "2025-03-10",
  plannedDate: null,
  routineId: null,
  planTrainingId: null,
  lastExerciseId: null,
  exercises: [],
  startedAt: "2025-03-10T09:30:00.000Z",
  updatedAt: "2025-03-10T09:30:00.000Z",
};

const existingSession: SessionDocument = {
  ...emptySession,
  id: "sesion-existente",
  revision: 2,
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
  ],
};

type StubOptions = {
  active: SessionDocument | null | (() => SessionDocument | null);
  start: { status: number; body: unknown };
  onStart?: (body: unknown) => void;
};

function stubHome({ active, start, onStart }: StubOptions) {
  stubFetch((url, init) => {
    if (url === "/api/auth/get-session") {
      return { status: 200, body: verifiedSession };
    }
    if (url === "/api/sessions/active") {
      const current = typeof active === "function" ? active() : active;
      return { status: 200, body: { session: current } };
    }
    if (url === "/api/sessions" && (init.method ?? "GET") === "POST") {
      onStart?.(JSON.parse(String(init.body)));
      return start;
    }
    if (url === "/api/sessions/sesion-nueva") {
      return { status: 200, body: { session: emptySession } };
    }
    if (url === "/api/sessions/sesion-existente") {
      return { status: 200, body: { session: existingSession } };
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

describe("primer bloque de Inicio: entrenamiento actual", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("ofrece Iniciar Sesión libre cuando no hay Sesión activa y abre la nueva Sesión", async () => {
    const postBodies: unknown[] = [];
    stubHome({
      active: null,
      start: {
        status: 201,
        body: { session: emptySession },
      },
      onStart: (body) => postBodies.push(body),
    });
    const user = userEvent.setup();
    render(<App />);

    const startButton = await screen.findByRole("button", {
      name: "Iniciar Sesión libre",
    });
    await user.click(startButton);

    await waitFor(() =>
      expect(window.location.pathname).toBe("/sesion/sesion-nueva"),
    );
    expect(postBodies).toEqual([{ origin: "libre" }]);
    expect(await screen.findByRole("heading", { name: "Sesión activa" })).toBeInTheDocument();
  });

  test("prioriza Continuar cuando existe una Sesión activa", async () => {
    stubHome({
      active: existingSession,
      start: { status: 409, body: { error: { code: "ACTIVE_SESSION_EXISTS", message: "no" } } },
    });
    render(<App />);

    expect(
      (await screen.findAllByRole("link", { name: "Continuar" })).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByRole("button", { name: "Iniciar Sesión libre" }),
    ).not.toBeInTheDocument();
  });

  test("un segundo inicio con conflicto abre la Sesión existente", async () => {
    let conflicted = false;
    stubHome({
      active: () => (conflicted ? existingSession : null),
      start: {
        status: 409,
        body: {
          error: {
            code: "ACTIVE_SESSION_EXISTS",
            message: "Ya tienes una Sesión activa.",
            sessionId: existingSession.id,
          },
        },
      },
      onStart: () => {
        conflicted = true;
      },
    });
    const user = userEvent.setup();
    render(<App />);

    const startButton = await screen.findByRole("button", {
      name: "Iniciar Sesión libre",
    });
    await user.click(startButton);

    await waitFor(() =>
      expect(window.location.pathname).toBe("/sesion/sesion-existente"),
    );
    expect(await screen.findByRole("heading", { name: "Sesión activa" })).toBeInTheDocument();
  });
});
