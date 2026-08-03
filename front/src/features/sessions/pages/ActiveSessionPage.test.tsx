import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubFetch, type MockedResponse } from "../../../test/mock-fetch";
import type { SessionDocument } from "../api/sessions-api";
import { ActiveSessionPage } from "./ActiveSessionPage";

function renderPage(sesionId = "sesion-activa") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/sesion/${sesionId}`]}>
        <Routes>
          <Route path="/sesion/:sesionId" element={<ActiveSessionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const emptySession: SessionDocument = {
  id: "sesion-activa",
  revision: 1,
  origin: "libre",
  status: "activa",
  datePerformed: "2025-03-10",
  lastExerciseId: null,
  exercises: [],
  startedAt: "2025-03-10T09:30:00.000Z",
  updatedAt: "2025-03-10T09:30:00.000Z",
};

const benchPress = {
  id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  name: "Press de banca con barra",
  instructions: "Túmbate sobre un banco y baja la barra hasta el pecho.",
  recordingMode: "fuerza_con_carga",
  category: "Pecho",
  bodyPart: "Pecho",
  equipment: "Barra",
  provenance: "catalogo",
  available: true,
} as const;

const bulgarianSquats = {
  id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  name: "Sentadilla búlgara",
  instructions: "Apoya el pie trasero sobre un banco y baja la rodilla.",
  recordingMode: "fuerza_con_carga",
  category: "Pierna",
  bodyPart: "Pierna",
  equipment: "Mancuernas",
  provenance: "personalizado",
  available: true,
} as const;

const benchOccurrence = {
  id: "cccccccccccccccccccccccccccccccc",
  exerciseId: benchPress.id,
  sortOrder: 0,
  exercise: {
    id: benchPress.id,
    name: benchPress.name,
    recordingMode: benchPress.recordingMode,
    provenance: benchPress.provenance,
  },
};

function stubCatalogPicker() {
  return {
    status: 200,
    body: { items: [benchPress, bulgarianSquats], nextCursor: null },
  };
}

describe("pantalla de la Sesión activa", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("una Sesión vacía abre de inmediato el selector combinado para añadir el primer Ejercicio", async () => {
    stubFetch((url) => {
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: emptySession } };
      }
      if (url.startsWith("/api/exercises")) {
        return stubCatalogPicker();
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Sesión activa" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sesión libre")).toBeInTheDocument();
    expect(screen.getByText("Guardado")).toBeInTheDocument();

    const picker = await screen.findByRole("region", {
      name: "Añadir Ejercicio a la Sesión",
    });
    expect(
      within(picker).getByRole("heading", { name: "Añadir Ejercicio" }),
    ).toBeInTheDocument();
    expect(
      await within(picker).findByText("Press de banca con barra"),
    ).toBeInTheDocument();
    expect(within(picker).getByText("Sentadilla búlgara")).toBeInTheDocument();
    expect(within(picker).getAllByText("Catálogo")).toHaveLength(1);
    expect(within(picker).getByText("Personalizado")).toBeInTheDocument();
  });

  test("añadir el primer Ejercicio sustituye el agregado con su revisión y muestra la aparición", async () => {
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        return {
          status: 200,
          body: {
            session: {
              ...emptySession,
              revision: 2,
              lastExerciseId: benchPress.id,
              exercises: [benchOccurrence],
            },
          },
        };
      }
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: emptySession } };
      }
      if (url.startsWith("/api/exercises")) {
        return stubCatalogPicker();
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Press de banca con barra/ }),
    );

    expect(await screen.findByText("1 ejercicio")).toBeInTheDocument();
    expect(putBodies).toEqual([{ revision: 1, exercises: [{ exerciseId: benchPress.id }] }]);
    expect(screen.getByText("Guardado")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Añadir Ejercicio a la Sesión" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Press de banca con barra")).toBeInTheDocument();
  });

  test("al reanudar abre el último Ejercicio confirmado", async () => {
    stubFetch((url) => {
      if (url === "/api/sessions/sesion-activa") {
        return {
          status: 200,
          body: {
            session: {
              ...emptySession,
              revision: 3,
              lastExerciseId: bulgarianSquats.id,
              exercises: [
                { ...benchOccurrence, sortOrder: 0 },
                {
                  id: "dddddddddddddddddddddddddddddddd",
                  exerciseId: bulgarianSquats.id,
                  sortOrder: 1,
                  exercise: {
                    id: bulgarianSquats.id,
                    name: bulgarianSquats.name,
                    recordingMode: bulgarianSquats.recordingMode,
                    provenance: bulgarianSquats.provenance,
                  },
                },
              ],
            },
          },
        };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    renderPage();

    const bench = await screen.findByRole("button", { name: /Press de banca con barra/ });
    const squats = screen.getByRole("button", { name: /Sentadilla búlgara/ });
    expect(bench).toHaveAttribute("aria-expanded", "false");
    expect(squats).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Último Ejercicio utilizado")).toBeInTheDocument();
  });

  test("muestra Guardando y Error al guardar y permite reintentar", async () => {
    let putCalls = 0;
    const pending = { release: null as (() => void) | null };
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putCalls += 1;
        if (putCalls === 1) {
          return new Promise<MockedResponse>((resolve) => {
            pending.release = () =>
              resolve({
                status: 500,
                body: { error: { code: "REQUEST_FAILED", message: "fallo" } },
              });
          });
        }
        return {
          status: 200,
          body: {
            session: {
              ...emptySession,
              revision: 2,
              lastExerciseId: benchPress.id,
              exercises: [benchOccurrence],
            },
          },
        };
      }
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: emptySession } };
      }
      if (url.startsWith("/api/exercises")) {
        return stubCatalogPicker();
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Press de banca con barra/ }),
    );

    expect(await screen.findByText("Guardando…")).toBeInTheDocument();
    pending.release?.();
    expect(await screen.findByText("Error al guardar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Guardado")).toBeInTheDocument();
    expect(putCalls).toBe(2);
  });

  test("un conflicto de revisión carga la versión vigente e informa sin mezclar cambios", async () => {
    let conflictSent = false;
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        conflictSent = true;
        return {
          status: 409,
          body: {
            error: { code: "REVISION_CONFLICT", message: "La Sesión ha cambiado." },
          },
        };
      }
      if (url === "/api/sessions/sesion-activa") {
        return {
          status: 200,
          body: {
            session: conflictSent
              ? {
                  ...emptySession,
                  revision: 2,
                  lastExerciseId: benchPress.id,
                  exercises: [benchOccurrence],
                }
              : emptySession,
          },
        };
      }
      if (url.startsWith("/api/exercises")) {
        return stubCatalogPicker();
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Press de banca con barra/ }),
    );

    expect(
      await screen.findByText(
        "La Sesión cambió en otra pestaña. Se cargó la versión vigente.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Press de banca con barra/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });
});
