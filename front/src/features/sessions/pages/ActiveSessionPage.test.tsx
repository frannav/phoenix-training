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
import type {
  SessionDocument,
  SessionExerciseDocument,
  SessionSeriesDocument,
  SeriesStatus,
} from "../api/sessions-api";
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

const benchOccurrence: SessionExerciseDocument = {
  id: "cccccccccccccccccccccccccccccccc",
  exerciseId: benchPress.id,
  sortOrder: 0,
  exercise: {
    id: benchPress.id,
    name: benchPress.name,
    recordingMode: benchPress.recordingMode,
    provenance: benchPress.provenance,
  },
  series: [],
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
    expect(putBodies).toEqual([
      { revision: 1, exercises: [{ exerciseId: benchPress.id, series: [] }] },
    ]);
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
                  series: [],
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

const pushUps = {
  id: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  name: "Flexiones",
  instructions: "Baja el pecho hasta el suelo manteniendo el cuerpo recto.",
  recordingMode: "repeticiones_sin_carga",
  category: "Pecho",
  bodyPart: "Pecho",
  equipment: "Ninguno",
  provenance: "catalogo",
  available: true,
} as const;

const plank = {
  id: "ffffffffffffffffffffffffffffffff",
  name: "Plancha",
  instructions: "Mantén el cuerpo recto apoyado en antebrazos.",
  recordingMode: "tiempo_por_serie",
  category: "Core",
  bodyPart: "Abdomen",
  equipment: "Ninguno",
  provenance: "catalogo",
  available: true,
} as const;

const rowing = {
  id: "11111111111111111111111111111111",
  name: "Remo en máquina",
  instructions: "Tira del asa hacia el abdomen con la espalda recta.",
  recordingMode: "cardio_continuo",
  category: "Cardio",
  bodyPart: "Espalda",
  equipment: "Máquina",
  provenance: "catalogo",
  available: true,
} as const;

function seriesDoc(overrides: Partial<SessionSeriesDocument> = {}): SessionSeriesDocument {
  return {
    id: "serie-1",
    order: 0,
    status: "pendiente",
    added: true,
    goal: { carga: null, repeticiones: null, duracion: null },
    result: { carga: null, repeticiones: null, duracion: null },
    rpe: null,
    ...overrides,
  };
}

function occurrenceDoc(
  exercise: typeof benchPress | typeof pushUps | typeof plank | typeof rowing,
  series: SessionSeriesDocument[],
  overrides: Partial<SessionExerciseDocument> = {},
): SessionExerciseDocument {
  return {
    id: overrides.id ?? "occurrence-1",
    exerciseId: exercise.id,
    sortOrder: 0,
    exercise: {
      id: exercise.id,
      name: exercise.name,
      recordingMode: exercise.recordingMode,
      provenance: exercise.provenance,
    },
    series,
    ...overrides,
  };
}

function sessionWithOccurrence(occurrence: SessionExerciseDocument): SessionDocument {
  return {
    ...emptySession,
    revision: 2,
    // Sin último Ejercicio confirmado: el acordeón comienza plegado y los
    // tests despliegan el Ejercicio con un toque, como haría un Deportista.
    lastExerciseId: null,
    exercises: [occurrence],
  };
}

describe("registrar resultados por Serie en la interfaz", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("los Objetivos de serie inicializan los campos de resultado sin completar la Serie", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({ id: "serie-1", goal: { carga: 80, repeticiones: 10, duracion: null } }),
    ]);
    stubFetch((url) => {
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    renderPage();

    await userEvent.setup().click(
      await screen.findByRole("button", { name: /Press de banca con barra/ }),
    );

    const row = await screen.findByRole("group", { name: "Serie 1" });
    expect(within(row).getByText("Pendiente")).toBeInTheDocument();
    const cargaInput = within(row).getByLabelText("Carga (kg)") as HTMLInputElement;
    const repeticionesInput = within(row).getByLabelText("Repeticiones") as HTMLInputElement;
    expect(cargaInput.value).toBe("80");
    expect(repeticionesInput.value).toBe("10");
    // los objetivos no completan la Serie: sigue pendiente y sin botones de resultado
    expect(within(row).getByRole("button", { name: "Completar" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Omitir" })).toBeInTheDocument();
  });

  test("completar una Serie válida sustituye el agregado y muestra Guardado y Completada", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({ id: "serie-1", goal: { carga: 80, repeticiones: 10, duracion: null } }),
    ]);
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        return {
          status: 200,
          body: {
            session: sessionWithOccurrence(
              occurrenceDoc(benchPress, [
                seriesDoc({
                  id: "serie-1",
                  status: "completada",
                  goal: { carga: 80, repeticiones: 10, duracion: null },
                  result: { carga: 80, repeticiones: 10, duracion: null },
                  rpe: 8.5,
                }),
              ]),
            ),
          },
        };
      }
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Press de banca con barra/ }),
    );
    const row = await screen.findByRole("group", { name: "Serie 1" });
    await user.type(within(row).getByLabelText(/RPE \(1-10\)/), "8.5");
    await user.click(within(row).getByRole("button", { name: "Completar" }));

    expect(await screen.findByText("Guardado")).toBeInTheDocument();
    expect(putBodies).toEqual([
      {
        revision: 2,
        exercises: [
          {
            id: occurrence.id,
            exerciseId: benchPress.id,
            series: [
              {
                id: "serie-1",
                status: "completada",
                goal: { carga: 80, repeticiones: 10, duracion: null },
                result: { carga: 80, repeticiones: 10, duracion: null },
                rpe: 8.5,
              },
            ],
          },
        ],
      },
    ]);
    const completed = await screen.findByRole("group", { name: "Serie 1" });
    expect(within(completed).getByText("Completada")).toBeInTheDocument();
    expect(within(completed).getByText(/80 kg × 10 rep/)).toBeInTheDocument();
    expect(within(completed).getByText(/RPE 8,5/)).toBeInTheDocument();
    expect(
      within(completed).queryByRole("button", { name: "Completar" }),
    ).not.toBeInTheDocument();
  });

  test("una entrada parcial muestra el error junto al campo y no guarda", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({ id: "serie-1", goal: { carga: 80, repeticiones: null, duracion: null } }),
    ]);
    let putCalls = 0;
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putCalls += 1;
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Press de banca con barra/ }),
    );
    const row = await screen.findByRole("group", { name: "Serie 1" });
    await user.click(within(row).getByRole("button", { name: "Completar" }));

    expect(
      await within(row).findByText("Las repeticiones son obligatorias para completar la Serie."),
    ).toBeInTheDocument();
    expect(putCalls).toBe(0);
    expect(within(row).getByText("Pendiente")).toBeInTheDocument();
  });

  test("repeticiones sin carga y tiempo por serie muestran solo su campo y completan con él", async () => {
    const cases = [
      {
        exercise: pushUps,
        occurrence: occurrenceDoc(pushUps, [seriesDoc({ id: "serie-1" })]),
        value: "12",
        payload: { repeticiones: 12 },
        label: "Repeticiones",
      },
      {
        exercise: plank,
        occurrence: occurrenceDoc(plank, [seriesDoc({ id: "serie-1" })]),
        value: "45",
        payload: { duracion: 45 },
        label: "Duración (seg)",
      },
    ];
    for (const { exercise, occurrence, value, payload, label } of cases) {
      const putBodies: unknown[] = [];
      stubFetch((url, init) => {
        if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
          putBodies.push(JSON.parse(String(init.body)));
          return {
            status: 200,
            body: {
              session: sessionWithOccurrence(
                occurrenceDoc(exercise, [
                  seriesDoc({
                    id: "serie-1",
                    status: "completada",
                    result: { carga: null, repeticiones: null, duracion: null, ...payload },
                  }),
                ]),
              ),
            },
          };
        }
        if (url === "/api/sessions/sesion-activa") {
          return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
        }
        return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole("button", { name: new RegExp(exercise.name) }),
      );
      const row = await screen.findByRole("group", { name: "Serie 1" });
      expect(within(row).queryByLabelText("Carga (kg)")).not.toBeInTheDocument();
      await user.type(within(row).getByLabelText(label), value);
      await user.click(within(row).getByRole("button", { name: "Completar" }));

      expect(await screen.findByText("Guardado")).toBeInTheDocument();
      const seriesPayload = (putBodies[0] as { exercises: { series: unknown[] }[] })
        .exercises[0]!.series[0]!;
      expect(seriesPayload).toMatchObject({ status: "completada", result: payload });
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  test("cardio continuo admite exactamente una Serie y no ofrece añadir más", async () => {
    const occurrence = occurrenceDoc(rowing, [
      seriesDoc({ id: "serie-1", goal: { duracion: 600, carga: null, repeticiones: null } }),
    ]);
    stubFetch((url) => {
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    renderPage();

    await userEvent.setup().click(
      await screen.findByRole("button", { name: /Remo en máquina/ }),
    );
    const details = await screen.findByText("Serie 1");
    expect(details).toBeInTheDocument();
    const row = await screen.findByRole("group", { name: "Serie 1" });
    expect(within(row).getByLabelText("Duración (seg)")).toBeInTheDocument();
    expect(within(row).queryByLabelText("Carga (kg)")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Añadir serie" }),
    ).not.toBeInTheDocument();
  });

  test("omitir una Serie pendiente y restaurarla conservan los objetivos", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({ id: "serie-1", goal: { carga: 60, repeticiones: 8, duracion: null } }),
    ]);
    let mode: SeriesStatus = "pendiente";
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        const body = JSON.parse(String(init.body)) as {
          exercises: { series: { id: string; status: SeriesStatus }[] }[];
        };
        putBodies.push(body);
        mode = body.exercises[0]!.series[0]!.status;
        return {
          status: 200,
          body: {
            session: sessionWithOccurrence(
              occurrenceDoc(benchPress, [
                seriesDoc({
                  id: "serie-1",
                  status: mode,
                  goal: { carga: 60, repeticiones: 8, duracion: null },
                }),
              ]),
            ),
          },
        };
      }
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Press de banca con barra/ }),
    );
    let row = await screen.findByRole("group", { name: "Serie 1" });
    await user.click(within(row).getByRole("button", { name: "Omitir" }));

    expect(await screen.findByText("Omitida")).toBeInTheDocument();
    expect((putBodies[0] as { exercises: { series: { status: SeriesStatus }[] }[] })
      .exercises[0]!.series[0]!.status).toBe("omitida");
    expect(
      (putBodies[0] as { exercises: { series: { result: unknown; rpe: unknown }[] }[] })
        .exercises[0]!.series[0]!.rpe,
    ).toBeNull();

    row = await screen.findByRole("group", { name: "Serie 1" });
    await user.click(within(row).getByRole("button", { name: "Restaurar" }));

    expect(await screen.findByText("Pendiente")).toBeInTheDocument();
    expect((putBodies[1] as { exercises: { series: { status: SeriesStatus }[] }[] })
      .exercises[0]!.series[0]!.status).toBe("pendiente");
    // los objetivos vuelven a inicializar los campos
    const restoredRow = await screen.findByRole("group", { name: "Serie 1" });
    expect((within(restoredRow).getByLabelText("Carga (kg)") as HTMLInputElement).value).toBe("60");
  });

  test("un RPE fuera de los pasos de 0,5 señala el campo sin guardar", async () => {
    const occurrence = occurrenceDoc(pushUps, [seriesDoc({ id: "serie-1" })]);
    let putCalls = 0;
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putCalls += 1;
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Flexiones/ }),
    );
    const row = await screen.findByRole("group", { name: "Serie 1" });
    await user.type(within(row).getByLabelText("Repeticiones"), "10");
    await user.type(within(row).getByLabelText(/RPE \(1-10\)/), "7.3");
    await user.click(within(row).getByRole("button", { name: "Completar" }));

    expect(
      await within(row).findByText("El RPE admite pasos de 0,5."),
    ).toBeInTheDocument();
    expect(putCalls).toBe(0);
  });

  test("añadir una Serie propone como borrador los valores de la anterior", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({ id: "serie-1", status: "completada", result: { carga: 80, repeticiones: 10, duracion: null } }),
    ]);
    const proposedGoal = { carga: 80, repeticiones: 10, duracion: null };
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        return {
          status: 200,
          body: {
            session: sessionWithOccurrence(
              occurrenceDoc(benchPress, [
                seriesDoc({ id: "serie-1", status: "completada", result: proposedGoal }),
                seriesDoc({ id: "serie-2", order: 1, goal: proposedGoal }),
              ]),
            ),
          },
        };
      }
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Press de banca con barra/ }),
    );
    await user.click(screen.getByRole("button", { name: "Añadir serie" }));

    const payload = (putBodies[0] as { exercises: { series: unknown[] }[] }).exercises[0]!;
    expect(payload.series).toHaveLength(2);
    // la Serie nueva nace pendiente con los valores de la anterior como
    // Objetivos, que inicializan los campos del formulario sin completarla.
    expect(payload.series[1]).toEqual({ status: "pendiente", goal: proposedGoal, result: null });

    const row = await screen.findByRole("group", { name: "Serie 2" });
    expect(within(row).getByText("Pendiente")).toBeInTheDocument();
    expect((within(row).getByLabelText("Carga (kg)") as HTMLInputElement).value).toBe("80");
    expect((within(row).getByLabelText("Repeticiones") as HTMLInputElement).value).toBe("10");
  });

  test("añadir una Serie copia los Objetivos de una anterior pendiente", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({ id: "serie-1", goal: { carga: 60, repeticiones: 8, duracion: null } }),
    ]);
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        return {
          status: 200,
          body: {
            session: sessionWithOccurrence(
              occurrenceDoc(benchPress, [
                seriesDoc({ id: "serie-1", goal: { carga: 60, repeticiones: 8, duracion: null } }),
                seriesDoc({ id: "serie-2", order: 1, goal: { carga: 60, repeticiones: 8, duracion: null } }),
              ]),
            ),
          },
        };
      }
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Press de banca con barra/ }),
    );
    await user.click(screen.getByRole("button", { name: "Añadir serie" }));

    const payload = (putBodies[0] as { exercises: { series: unknown[] }[] }).exercises[0]!;
    expect(payload.series[1]).toEqual({
      status: "pendiente",
      goal: { carga: 60, repeticiones: 8, duracion: null },
      result: null,
    });
    const row = await screen.findByRole("group", { name: "Serie 2" });
    expect((within(row).getByLabelText("Carga (kg)") as HTMLInputElement).value).toBe("60");
    expect((within(row).getByLabelText("Repeticiones") as HTMLInputElement).value).toBe("8");
  });

  test("añadir un Ejercicio de cardio continuo desde el selector crea su única Serie pendiente", async () => {
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
              lastExerciseId: rowing.id,
              exercises: [
                occurrenceDoc(rowing, [
                  seriesDoc({ id: "serie-cardio", goal: { duracion: 600, carga: null, repeticiones: null } }),
                ]),
              ],
            },
          },
        };
      }
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: emptySession } };
      }
      if (url.startsWith("/api/exercises")) {
        return { status: 200, body: { items: [rowing], nextCursor: null } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Remo en máquina/ }),
    );

    expect(await screen.findByRole("group", { name: "Serie 1" })).toBeInTheDocument();
    expect(putBodies).toEqual([
      {
        revision: 1,
        exercises: [
          {
            exerciseId: rowing.id,
            series: [{ status: "pendiente", goal: null, result: null }],
          },
        ],
      },
    ]);
    expect(screen.queryByRole("button", { name: "Añadir serie" })).not.toBeInTheDocument();
  });

  test("un conflicto entre pestañas carga la versión vigente sin duplicar Series", async () => {
    const occurrence = occurrenceDoc(benchPress, [seriesDoc({ id: "serie-1" })]);
    let conflicted = false;
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        conflicted = true;
        return {
          status: 409,
          body: { error: { code: "REVISION_CONFLICT", message: "La Sesión ha cambiado." } },
        };
      }
      if (url === "/api/sessions/sesion-activa") {
        return {
          status: 200,
          body: {
            session: conflicted
              ? {
                  ...sessionWithOccurrence(
                    occurrenceDoc(benchPress, [
                      seriesDoc({
                        id: "serie-otra",
                        status: "completada",
                        result: { carga: 100, repeticiones: 3, duracion: null },
                      }),
                    ]),
                  ),
                  lastExerciseId: benchPress.id,
                }
              : sessionWithOccurrence(occurrence),
          },
        };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Press de banca con barra/ }),
    );
    const row = await screen.findByRole("group", { name: "Serie 1" });
    await user.type(within(row).getByLabelText("Carga (kg)"), "90");
    await user.type(within(row).getByLabelText("Repeticiones"), "5");
    await user.click(within(row).getByRole("button", { name: "Completar" }));

    expect(
      await screen.findByText(
        "La Sesión cambió en otra pestaña. Se cargó la versión vigente.",
      ),
    );
    // la versión vigente de la otra pestaña: una sola Serie completada, sin fusión
    await waitFor(() =>
      expect(screen.getByRole("group", { name: "Serie 1" })).toBeInTheDocument(),
    );
    const freshRow = screen.getByRole("group", { name: "Serie 1" });
    expect(within(freshRow).getByText("Completada")).toBeInTheDocument();
    expect(within(freshRow).getByText(/100 kg × 3 rep/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Serie 2" })).not.toBeInTheDocument();
  });
});
