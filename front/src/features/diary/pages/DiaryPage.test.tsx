import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../../../app/App";
import { stubFetch } from "../../../test/mock-fetch";
import { emptyDashboard } from "../../../test/dashboard-fixtures";
import type { MonthlyDiary } from "../api/diary-api";

const verifiedSession = {
  session: { id: "sesion-opaca", expiresAt: "2026-08-09T00:00:00.000Z", userId: "cuenta-opaca" },
  user: {
    id: "cuenta-opaca",
    email: "deportista@example.com",
    name: "deportista",
    emailVerified: true,
  },
};

/** Marzo de 2025 con tres días de entrenamiento y el resto vacíos. */
function marchDiary(): MonthlyDiary {
  return {
    year: 2025,
    month: 3,
    days: Array.from({ length: 31 }, (_, index) => ({
      date: `2025-03-${`${index + 1}`.padStart(2, "0")}`,
      sessions: [],
      volumeKgRep: 0,
    })),
  };
}

function withSessions(diary: MonthlyDiary, ...days: MonthlyDiary["days"]) {
  for (const day of days) {
    const index = Number(day.date.slice(8)) - 1;
    diary.days[index] = day;
  }
  return diary;
}

function aprilDiary(): MonthlyDiary {
  return {
    year: 2025,
    month: 4,
    days: Array.from({ length: 30 }, (_, index) => ({
      date: `2025-04-${`${index + 1}`.padStart(2, "0")}`,
      sessions: [],
      volumeKgRep: 0,
    })),
  };
}

type StubOptions = {
  month?: (year: number, month: number) => MonthlyDiary;
  onRequest?: (url: string) => void;
};

function stubDiary({ month, onRequest }: StubOptions = {}) {
  stubFetch((url) => {
    onRequest?.(url);
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
      const params = new URL(url, "http://test.local").searchParams;
      const date = params.get("date") ?? "";
      return { status: 200, body: { date, volumeKgRep: 0, sessions: [] } };
    }
    if (url.startsWith("/api/diary")) {
      const params = new URL(url, "http://test.local").searchParams;
      const year = Number(params.get("year"));
      const monthNumber = Number(params.get("month"));
      const fixture = month ? month(year, monthNumber) : marchDiary();
      return { status: 200, body: fixture };
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
  });
}

describe("Diario: calendario mensual", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/diario?mes=2025-03");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("muestra el mes consultado y distingue los días con entrenamiento", async () => {
    const diary = withSessions(
      marchDiary(),
      {
        date: "2025-03-05",
        sessions: [
          { id: "s1", title: "Sesión libre" },
          { id: "s2", title: "Sesión libre" },
        ],
        volumeKgRep: 1500,
      },
      {
        date: "2025-03-12",
        sessions: [{ id: "s3", title: "Día de empuje" }],
        volumeKgRep: 600,
      },
    );
    stubDiary({ month: () => diary });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Diario" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "marzo de 2025" })).toBeInTheDocument();

    // Días con Sesiones finalizadas: enlace con resumen de Sesiones y volumen.
    // (es-ES no agrupa los miles de cuatro cifras: 1500, no 1.500)
    const day5 = await screen.findByRole("link", {
      name: "05/03/2025 · 2 Sesiones · 1500 kg·rep",
    });
    expect(day5).toHaveAttribute("href", "/diario/2025-03-05");

    const day12 = await screen.findByRole("link", {
      name: "12/03/2025 · 1 Sesión · 600 kg·rep",
    });
    expect(day12).toHaveAttribute("href", "/diario/2025-03-12");

    // Días sin entrenamiento: enlace con estado vacío explícito.
    const emptyDay = await screen.findByRole("link", { name: "01/03/2025 · sin entrenamiento" });
    expect(emptyDay).toHaveAttribute("href", "/diario/2025-03-01");

    // La celda con entrenamiento se distingue visualmente.
    const trainingCell = day12.closest("td");
    expect(trainingCell).toHaveAttribute("data-has-sessions", "true");
  });

  test("abre el detalle de un día desde su celda", async () => {
    stubDiary();
    const user = userEvent.setup();
    render(<App />);

    const emptyDay = (await screen.findAllByRole("link", { name: /sin entrenamiento/ }))[0]!;
    await user.click(emptyDay);

    expect(window.location.pathname).toBe("/diario/2025-03-01");
    expect(
      await screen.findByRole("heading", { name: "01/03/2025" }),
    ).toBeInTheDocument();
  });

  test("navega entre meses y puede volver al mes actual", async () => {
    const requested: string[] = [];
    stubDiary({
      month: (year, month) => (month === 4 ? aprilDiary() : marchDiary()),
      onRequest: (url) => {
        if (url.startsWith("/api/diary?")) {
          requested.push(url);
        }
      },
    });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "marzo de 2025" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(await screen.findByRole("heading", { name: "abril de 2025" })).toBeInTheDocument();
    expect(window.location.search).toBe("?mes=2025-04");

    await user.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(await screen.findByRole("heading", { name: "marzo de 2025" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hoy" }));
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;
    expect(window.location.search).toBe(`?mes=${currentMonth}`);

    // El mes consultado se pide al servidor y el regreso a un mes en caché no
    // vuelve a pedirlo (TanStack Query conserva la lectura dentro de su
    // ventana de frescura).
    expect(requested.slice(0, 2)).toEqual([
      "/api/diary?year=2025&month=3",
      "/api/diary?year=2025&month=4",
    ]);
  });

  test("un mes sin entrenamientos expresa su estado vacío", async () => {
    stubDiary({ month: () => aprilDiary() });
    window.history.replaceState({}, "", "/diario?mes=2025-04");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "abril de 2025" })).toBeInTheDocument();
    expect(
      await screen.findByText("Este mes no tiene entrenamientos registrados."),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByRole("link", { name: /sin entrenamiento/ }),
    ).toHaveLength(30);
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
      if (url.startsWith("/api/diary")) {
        if (fails) {
          return { status: 500, body: { error: { code: "SERVER_ERROR", message: "no" } } };
        }
        return { status: 200, body: marchDiary() };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByText(/No se pudo cargar tu Diario/),
    ).toBeInTheDocument();

    fails = false;
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "marzo de 2025" })).toBeInTheDocument();
  });
});
