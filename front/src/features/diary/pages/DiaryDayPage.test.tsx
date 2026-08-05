import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../../../app/App";
import { stubFetch } from "../../../test/mock-fetch";
import { emptyDashboard } from "../../../test/dashboard-fixtures";
import type { DiaryDay, DiaryDaySession } from "../api/diary-api";

const verifiedSession = {
  session: { id: "sesion-opaca", expiresAt: "2026-08-09T00:00:00.000Z", userId: "cuenta-opaca" },
  user: {
    id: "cuenta-opaca",
    email: "deportista@example.com",
    name: "deportista",
    emailVerified: true,
  },
};

/** Sesión del Plan con una Rutina de origen: documenta el detalle completo. */
function planSessionFixture(): DiaryDaySession {
  return {
    id: "sesion-1",
    revision: 2,
    origin: "plan",
    status: "finalizada",
    datePerformed: "2025-03-12",
    plannedDate: "2025-03-10",
    routineId: "rutina-1",
    planTrainingId: "training-1",
    lastExerciseId: "ex-1",
    title: "Día de empuje",
    planName: "Ciclo base",
    routineName: "Día de empuje",
    volumeKgRep: 600,
    exercises: [
      {
        id: "occ-1",
        exerciseId: "ex-1",
        sortOrder: 0,
        added: false,
        exercise: {
          id: "ex-1",
          name: "Sentadilla",
          recordingMode: "fuerza_con_carga",
          provenance: "catalogo",
        },
        series: [
          {
            id: "serie-1",
            order: 0,
            status: "completada",
            added: false,
            goal: { carga: 100, repeticiones: 5, duracion: null },
            result: { carga: 120, repeticiones: 5, duracion: null },
            rpe: 8,
          },
          {
            id: "serie-2",
            order: 1,
            status: "omitida",
            added: false,
            goal: { carga: 100, repeticiones: 5, duracion: null },
            result: { carga: null, repeticiones: null, duracion: null },
            rpe: null,
          },
        ],
      },
    ],
    startedAt: "2025-03-12T09:30:00.000Z",
    updatedAt: "2025-03-12T10:05:00.000Z",
  };
}

function dayFixture(date: string, sessions: DiaryDaySession[]): DiaryDay {
  return {
    date,
    volumeKgRep: sessions.reduce((sum, session) => sum + session.volumeKgRep, 0),
    sessions,
  };
}

function stubDay(date: string, day: DiaryDay, fail = false) {
  stubFetch((url) => {
    if (url === "/api/auth/get-session") {
      return { status: 200, body: verifiedSession };
    }
    if (url === "/api/sessions/active") {
      return { status: 200, body: { session: null } };
    }
    if (url.startsWith("/api/dashboard")) {
      return { status: 200, body: emptyDashboard };
    }
    if (url.startsWith("/api/diary/day")) {
      if (fail) {
        return { status: 500, body: { error: { code: "SERVER_ERROR", message: "no" } } };
      }
      return { status: 200, body: day };
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
  });
}

describe("Diario: detalle de un día", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/diario/2025-03-12");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("presenta la Sesión con Plan, Rutina, Ejercicios, Series, repeticiones y pesos", async () => {
    stubDay("2025-03-12", dayFixture("2025-03-12", [planSessionFixture()]));
    render(<App />);

    expect(await screen.findByRole("heading", { name: "12/03/2025" })).toBeInTheDocument();
    expect(await screen.findByText(/Volumen del día:/)).toHaveTextContent("600 kg·rep");

    // Origen resuelto: Plan, Rutina y Fecha prevista.
    expect(await screen.findByRole("heading", { name: "Día de empuje" })).toBeInTheDocument();
    expect(screen.getByText("Del Plan")).toBeInTheDocument();
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "P" && element.textContent === "Plan: Ciclo base",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "P" && element.textContent === "Rutina: Día de empuje",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Fecha prevista: 10\/03\/2025/)).toBeInTheDocument();

    // Ejercicio con su Forma de registro y las Series con repeticiones y pesos.
    expect(screen.getByRole("heading", { name: "Sentadilla" })).toBeInTheDocument();
    expect(screen.getByText("Fuerza con carga")).toBeInTheDocument();
    expect(screen.getByText("Serie 1")).toBeInTheDocument();
    expect(screen.getByText("Completada")).toBeInTheDocument();
    expect(screen.getByText("120 kg × 5 rep")).toBeInTheDocument();
    expect(screen.getByText("RPE 8")).toBeInTheDocument();
    expect(screen.getByText("Serie 2")).toBeInTheDocument();
    expect(screen.getByText("Omitida")).toBeInTheDocument();
  });

  test("una Sesión libre conserva su estado sin Plan ni Rutina", async () => {
    const libre: DiaryDaySession = {
      ...planSessionFixture(),
      id: "sesion-libre",
      origin: "libre",
      plannedDate: null,
      routineId: null,
      planTrainingId: null,
      title: "Sesión libre",
      planName: null,
      routineName: null,
      volumeKgRep: 1000,
      exercises: [
        {
          ...planSessionFixture().exercises[0]!,
          series: [
            {
              id: "serie-1",
              order: 0,
              status: "completada",
              added: false,
              goal: { carga: null, repeticiones: null, duracion: null },
              result: { carga: 100, repeticiones: 10, duracion: null },
              rpe: null,
            },
          ],
        },
      ],
    };
    stubDay("2025-03-12", dayFixture("2025-03-12", [libre]));
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sesión libre" })).toBeInTheDocument();
    expect(screen.getByText("Libre")).toBeInTheDocument();
    expect(
      screen.queryByText((_, element) =>
        element?.tagName === "P" && element.textContent?.includes("Plan:"),
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText((_, element) =>
        element?.tagName === "P" && element.textContent?.includes("Rutina:"),
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Fecha prevista/)).not.toBeInTheDocument();
    expect(screen.getByText("100 kg × 10 rep")).toBeInTheDocument();
  });

  test("un día sin entrenamiento expresa su estado vacío y devuelve al calendario", async () => {
    stubDay("2025-03-20", dayFixture("2025-03-20", []));
    window.history.replaceState({}, "", "/diario/2025-03-20");
    render(<App />);

    expect(await screen.findByText("Este día no tiene entrenamientos registrados.")).toBeInTheDocument();
    expect(screen.getByText(/Volumen del día:/)).toHaveTextContent("0 kg·rep");

    const back = screen.getAllByRole("link", { name: "Volver al Diario" }).at(-1)!;
    expect(back).toHaveAttribute("href", "/diario?mes=2025-03");
  });

  test("una fecha no válida no consulta la API y ofrece volver", async () => {
    window.history.replaceState({}, "", "/diario/2025-13-40");
    let diaryCalls = 0;
    stubFetch((url) => {
      if (url === "/api/auth/get-session") {
        return { status: 200, body: verifiedSession };
      }
      if (url === "/api/sessions/active") {
        return { status: 200, body: { session: null } };
      }
      if (url.startsWith("/api/diary")) {
        diaryCalls += 1;
        return { status: 200, body: { date: "2025-03-12", volumeKgRep: 0, sessions: [] } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Día no válido" })).toBeInTheDocument();
    expect(diaryCalls).toBe(0);
    const back = screen.getByRole("link", { name: "Volver al Diario" });
    expect(back).toHaveAttribute("href", "/diario");
  });

  test("muestra la carga y permite reintentar cuando falla", async () => {
    let fails = true;
    stubFetch((url) => {
      if (url === "/api/auth/get-session") {
        return { status: 200, body: verifiedSession };
      }
      if (url === "/api/sessions/active") {
        return { status: 200, body: { session: null } };
      }
      if (url.startsWith("/api/diary/day")) {
        if (fails) {
          return { status: 500, body: { error: { code: "SERVER_ERROR", message: "no" } } };
        }
        return { status: 200, body: dayFixture("2025-03-12", [planSessionFixture()]) };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByText(/No se pudo cargar este día/),
    ).toBeInTheDocument();

    fails = false;
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Día de empuje" })).toBeInTheDocument();
  });
});
