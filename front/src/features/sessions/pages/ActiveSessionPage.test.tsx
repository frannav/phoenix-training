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
import { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubFetch, type MockedResponse } from "../../../test/mock-fetch";
import type {
  SessionDocument,
  SessionExerciseDocument,
  SessionSeriesDocument,
  SeriesMagnitudes,
  SeriesStatus,
} from "../api/sessions-api";
import type { RecordingMode } from "../../exercises/api/exercises-api";
import { ActiveSessionPage } from "./ActiveSessionPage";

function renderPage(sesionId = "sesion-activa", home: ReactElement | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/sesion/${sesionId}`]}>
        <Routes>
          <Route path="/sesion/:sesionId" element={<ActiveSessionPage />} />
          {home && <Route path="/" element={home} />}
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
  plannedDate: null,
  routineId: null,
  planTrainingId: null,
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
  added: false,
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
                  added: true,
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
  exercise: {
    id: string;
    name: string;
    recordingMode: RecordingMode;
    provenance: "catalogo" | "personalizado";
  },
  series: SessionSeriesDocument[],
  overrides: Partial<SessionExerciseDocument> = {},
): SessionExerciseDocument {
  const { added, ...rest } = overrides;
  return {
    id: rest.id ?? "occurrence-1",
    exerciseId: exercise.id,
    sortOrder: 0,
    added: added ?? false,
    exercise: {
      id: exercise.id,
      name: exercise.name,
      recordingMode: exercise.recordingMode,
      provenance: exercise.provenance,
    },
    series,
    ...rest,
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

  test("omitir una Serie y restaurarla como completada conservan los objetivos en los campos", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({ id: "serie-1", goal: { carga: 60, repeticiones: 8, duracion: null } }),
    ]);
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        const sent = (putBodies[putBodies.length - 1] as {
          exercises: {
            series: {
              id: string;
              status: SeriesStatus;
              result: SeriesMagnitudes | null;
              rpe: number | null;
            }[];
          }[];
        }).exercises[0]!.series[0]!;
        return {
          status: 200,
          body: {
            session: sessionWithOccurrence(
              occurrenceDoc(benchPress, [
                seriesDoc({
                  id: "serie-1",
                  status: sent.status,
                  goal: { carga: 60, repeticiones: 8, duracion: null },
                  result:
                    sent.status === "completada"
                      ? (sent.result ?? { carga: null, repeticiones: null, duracion: null })
                      : { carga: null, repeticiones: null, duracion: null },
                  rpe: sent.rpe,
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
    const omitSent = (putBodies[0] as {
      exercises: { series: { status: SeriesStatus; result: unknown; rpe: unknown }[] }[];
    }).exercises[0]!.series[0]!;
    expect(omitSent.status).toBe("omitida");
    expect(omitSent.result).toBeNull();
    expect(omitSent.rpe).toBeNull();

    // la fila omitida conserva los Objetivos como borrador de los campos
    row = await screen.findByRole("group", { name: "Serie 1" });
    expect((within(row).getByLabelText("Carga (kg)") as HTMLInputElement).value).toBe("60");
    expect((within(row).getByLabelText("Repeticiones") as HTMLInputElement).value).toBe("8");

    // restaurar exige el resultado completo y completa en la misma sustitución
    await user.click(within(row).getByRole("button", { name: "Restaurar" }));

    expect(await screen.findByText("Completada")).toBeInTheDocument();
    const restoreSent = (putBodies[1] as {
      exercises: { series: { status: SeriesStatus; result: SeriesMagnitudes | null }[] }[];
    }).exercises[0]!.series[0]!;
    expect(restoreSent.status).toBe("completada");
    expect(restoreSent.result).toEqual({ carga: 60, repeticiones: 8, duracion: null });
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

  test("añadir una Serie propone como borrador los valores de la anterior sin persistirlos", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({ id: "serie-1", status: "completada", result: { carga: 80, repeticiones: 10, duracion: null } }),
    ]);
    const proposedResult = { carga: 80, repeticiones: 10, duracion: null };
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        return {
          status: 200,
          body: {
            session: sessionWithOccurrence(
              occurrenceDoc(benchPress, [
                seriesDoc({ id: "serie-1", status: "completada", result: proposedResult }),
                seriesDoc({ id: "serie-2", order: 1 }),
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
    // la Serie nueva nace pendiente sin perseguir los valores de la anterior:
    // solo se proponen como borrador del formulario del navegador.
    expect(payload.series[1]).toEqual({ status: "pendiente", goal: null, result: null });

    const row = await screen.findByRole("group", { name: "Serie 2" });
    expect(within(row).getByText("Pendiente")).toBeInTheDocument();
    expect((within(row).getByLabelText("Carga (kg)") as HTMLInputElement).value).toBe("80");
    expect((within(row).getByLabelText("Repeticiones") as HTMLInputElement).value).toBe("10");
  });

  test("añadir una Serie copia los Objetivos de una anterior pendiente como borrador", async () => {
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
                seriesDoc({ id: "serie-2", order: 1 }),
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
      goal: null,
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

describe("transiciones y eliminación de Series en la interfaz", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("una Serie completada puede omitirse tras confirmar y pierde resultado y RPE", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({
        id: "serie-1",
        status: "completada",
        goal: { carga: 80, repeticiones: 10, duracion: null },
        result: { carga: 80, repeticiones: 10, duracion: null },
        rpe: 8.5,
      }),
    ]);
    let mode: SeriesStatus = "completada";
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        mode = "omitida";
        return {
          status: 200,
          body: {
            session: sessionWithOccurrence(
              occurrenceDoc(benchPress, [
                seriesDoc({ id: "serie-1", status: mode, goal: { carga: 80, repeticiones: 10, duracion: null } }),
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
    expect(within(row).getByText("Completada")).toBeInTheDocument();

    // cancelar no pierde el resultado
    await user.click(within(row).getByRole("button", { name: "Omitir" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Omitir la Serie",
    });
    expect(
      within(dialog).getByText("Omitir la Serie eliminará su Resultado y su RPE."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(putBodies).toHaveLength(0);
    expect(screen.getByRole("group", { name: "Serie 1" }).textContent).toContain("80 kg × 10 rep");

    // confirmar omite y pierde resultado y RPE
    await user.click(
      within(screen.getByRole("group", { name: "Serie 1" })).getByRole("button", { name: "Omitir" }),
    );
    await user.click(
      within(await screen.findByRole("dialog", { name: "Omitir la Serie" })).getByRole("button", { name: "Omitir" }),
    );

    expect(await screen.findByText("Omitida")).toBeInTheDocument();
    const payload = (putBodies[0] as { exercises: { series: { status: string; result: unknown; rpe: unknown }[] }[] }).exercises[0]!.series;
    expect(payload[0]).toMatchObject({
      status: "omitida",
      result: null,
      rpe: null,
    });
    expect(screen.queryByText(/80 kg × 10 rep/)).not.toBeInTheDocument();
  });

  test("devolver una Serie completada a pendiente exige confirmación y elimina resultado y RPE", async () => {
    const occurrence = occurrenceDoc(pushUps, [
      seriesDoc({
        id: "serie-1",
        status: "completada",
        result: { carga: null, repeticiones: 12, duracion: null },
        rpe: 8,
      }),
    ]);
    let mode: SeriesStatus = "completada";
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        mode = "pendiente";
        return {
          status: 200,
          body: {
            session: sessionWithOccurrence(
              occurrenceDoc(pushUps, [seriesDoc({ id: "serie-1", status: mode })]),
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
      await screen.findByRole("button", { name: /Flexiones/ }),
    );
    const row = await screen.findByRole("group", { name: "Serie 1" });
    await user.click(within(row).getByRole("button", { name: "Volver a pendiente" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Volver la Serie a pendiente",
    });
    await user.click(within(dialog).getByRole("button", { name: "Volver a pendiente" }));

    expect(await screen.findByText("Pendiente")).toBeInTheDocument();
    const payload = (putBodies[0] as { exercises: { series: { status: string; result: unknown; rpe: unknown }[] }[] }).exercises[0]!.series;
    expect(payload[0]).toMatchObject({
      status: "pendiente",
      result: null,
      rpe: null,
    });
    expect(screen.queryByText(/12 rep/)).not.toBeInTheDocument();
  });

  test("una Serie añadida pendiente se elimina directamente sin confirmación", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({ id: "serie-1", goal: { carga: 80, repeticiones: 10, duracion: null } }),
      seriesDoc({ id: "serie-2", order: 1 }),
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
                seriesDoc({ id: "serie-1", goal: { carga: 80, repeticiones: 10, duracion: null } }),
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
    const row = await screen.findByRole("group", { name: "Serie 2" });
    await user.click(within(row).getByRole("button", { name: "Eliminar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Serie 1")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Serie 2" })).not.toBeInTheDocument();
    const payload = (putBodies[0] as { exercises: { series: { id: string }[] }[] }).exercises[0]!;
    expect(payload.series.map((entry) => entry.id)).toEqual(["serie-1"]);
  });

  test("una Serie añadida completada exige confirmación para eliminarse", async () => {
    const occurrence = occurrenceDoc(pushUps, [
      seriesDoc({
        id: "serie-1",
        status: "completada",
        result: { carga: null, repeticiones: 10, duracion: null },
        rpe: 6,
      }),
    ]);
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        return {
          status: 200,
          body: {
            session: sessionWithOccurrence(occurrenceDoc(pushUps, [])),
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
      await screen.findByRole("button", { name: /Flexiones/ }),
    );
    const row = await screen.findByRole("group", { name: "Serie 1" });
    await user.click(within(row).getByRole("button", { name: "Eliminar" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Eliminar la Serie añadida",
    });
    expect(
      within(dialog).getByText("Eliminar la Serie añadida eliminará su Resultado y su RPE."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    expect(putBodies).toHaveLength(1);
    const payload = (putBodies[0] as { exercises: { series: unknown[] }[] }).exercises[0]!;
    expect(payload.series).toEqual([]);
    expect(await screen.findByText(/Aún no hay Series/)).toBeInTheDocument();
  });

  test("una Serie prevista (del origen) no ofrece eliminación en la interfaz", async () => {
    const occurrence = occurrenceDoc(pushUps, [
      seriesDoc({ id: "serie-1", status: "completada", added: false, result: { carga: null, repeticiones: 10, duracion: null } }),
    ]);
    stubFetch((url) => {
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    renderPage();

    await userEvent.setup().click(
      await screen.findByRole("button", { name: /Flexiones/ }),
    );
    const row = await screen.findByRole("group", { name: "Serie 1" });
    expect(within(row).queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Omitir" })).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "Volver a pendiente" }),
    ).toBeInTheDocument();
  });

  test("restaurar una Serie omitida como completada exige un resultado completo en el mismo flujo", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({ id: "serie-1", status: "omitida", goal: { carga: 60, repeticiones: null, duracion: null } }),
    ]);
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        const sent = (putBodies[putBodies.length - 1] as {
          exercises: {
            series: {
              status: SeriesStatus;
              result: SeriesMagnitudes | null;
              rpe: number | null;
            }[];
          }[];
        }).exercises[0]!.series[0]!;
        return {
          status: 200,
          body: {
            session: sessionWithOccurrence(
              occurrenceDoc(benchPress, [
                seriesDoc({
                  id: "serie-1",
                  status: sent.status,
                  goal: { carga: 60, repeticiones: null, duracion: null },
                  result:
                    sent.status === "completada"
                      ? (sent.result ?? { carga: null, repeticiones: null, duracion: null })
                      : { carga: null, repeticiones: null, duracion: null },
                  rpe: sent.rpe,
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
    // la fila omitida ofrece los campos de resultado inicializados con los Objetivos
    const row = await screen.findByRole("group", { name: "Serie 1" });
    expect(within(row).getByText("Omitida")).toBeInTheDocument();
    expect((within(row).getByLabelText("Carga (kg)") as HTMLInputElement).value).toBe("60");

    // restaurar sin un resultado completo señala el campo y no guarda
    await user.click(within(row).getByRole("button", { name: "Restaurar" }));
    expect(putBodies).toHaveLength(0);
    expect(
      await within(row).findByText("Las repeticiones son obligatorias para completar la Serie."),
    ).toBeInTheDocument();

    // el resultado completo restaura como completada en una sola sustitución
    await user.type(within(row).getByLabelText(/Repeticiones/), "8");
    await user.click(within(row).getByRole("button", { name: "Restaurar" }));

    expect(await screen.findByText("Completada")).toBeInTheDocument();
    expect(putBodies).toHaveLength(1);
    const restoreSent = (putBodies[0] as {
      exercises: { series: { status: SeriesStatus; result: SeriesMagnitudes | null }[] }[];
    }).exercises[0]!.series[0]!;
    expect(restoreSent.status).toBe("completada");
    expect(restoreSent.result).toEqual({ carga: 60, repeticiones: 8, duracion: null });
    expect(
      within(screen.getByRole("group", { name: "Serie 1" })).getByText(/60 kg × 8 rep/),
    ).toBeInTheDocument();
  });

  test("restaurar una Serie omitida respeta la regla del RPE opcional y no guarda con uno inválido", async () => {
    const occurrence = occurrenceDoc(pushUps, [
      seriesDoc({ id: "serie-1", status: "omitida", goal: { carga: null, repeticiones: 8, duracion: null } }),
    ]);
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        const sent = (putBodies[putBodies.length - 1] as {
          exercises: {
            series: { status: SeriesStatus; result: SeriesMagnitudes | null; rpe: number | null }[];
          }[];
        }).exercises[0]!.series[0]!;
        return {
          status: 200,
          body: {
            session: sessionWithOccurrence(
              occurrenceDoc(pushUps, [
                seriesDoc({
                  id: "serie-1",
                  status: sent.status,
                  goal: { carga: null, repeticiones: 8, duracion: null },
                  result:
                    sent.status === "completada"
                      ? (sent.result ?? { carga: null, repeticiones: null, duracion: null })
                      : { carga: null, repeticiones: null, duracion: null },
                  rpe: sent.rpe,
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
      await screen.findByRole("button", { name: /Flexiones/ }),
    );
    const row = await screen.findByRole("group", { name: "Serie 1" });
    expect((within(row).getByLabelText("Repeticiones") as HTMLInputElement).value).toBe("8");

    // un RPE fuera de los pasos de 0,5 señala el campo y no restaura
    await user.type(within(row).getByLabelText(/RPE \(1-10\)/), "7.3");
    await user.click(within(row).getByRole("button", { name: "Restaurar" }));
    expect(putBodies).toHaveLength(0);
    expect(
      await within(row).findByText("El RPE admite pasos de 0,5."),
    ).toBeInTheDocument();

    // sin RPE el resultado completo restaura como completada
    await user.clear(within(row).getByLabelText(/RPE \(1-10\)/));
    await user.click(within(row).getByRole("button", { name: "Restaurar" }));

    expect(await screen.findByText("Completada")).toBeInTheDocument();
    const restoreSent = (putBodies[0] as {
      exercises: { series: { status: SeriesStatus; result: SeriesMagnitudes | null; rpe: number | null }[] }[];
    }).exercises[0]!.series[0]!;
    expect(restoreSent.status).toBe("completada");
    expect(restoreSent.result).toEqual({ carga: null, repeticiones: 8, duracion: null });
    expect(restoreSent.rpe).toBeNull();
  });

  test("un Ejercicio añadido sin resultados en sus Series se elimina sin confirmación", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({ id: "serie-1" }),
      seriesDoc({ id: "serie-2", order: 1 }),
    ], { added: true });
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        return { status: 200, body: { session: { ...emptySession, revision: 3 } } };
      }
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
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
    await user.click(
      await screen.findByRole("button", { name: "Eliminar ejercicio" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(putBodies).toEqual([
      { revision: 2, exercises: [] },
    ]);
    // la Sesión vacía vuelve a abrir el selector para añadir un Ejercicio
    expect(
      await screen.findByRole("region", { name: "Añadir Ejercicio a la Sesión" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Añade tu primer Ejercicio para empezar a registrar."),
    ).toBeInTheDocument();
  });

  test("un Ejercicio añadido con resultados exige confirmación para eliminarse", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({
        id: "serie-1",
        status: "completada",
        result: { carga: 80, repeticiones: 10, duracion: null },
      }),
    ], { added: true });
    const putBodies: unknown[] = [];
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa" && (init.method ?? "GET") === "PUT") {
        putBodies.push(JSON.parse(String(init.body)));
        return { status: 200, body: { session: { ...emptySession, revision: 3 } } };
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
    await user.click(
      await screen.findByRole("button", { name: "Eliminar ejercicio" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Eliminar «Press de banca con barra»",
    });
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(putBodies).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Eliminar ejercicio" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Eliminar «Press de banca con barra»" })).getByRole("button", { name: "Eliminar" }),
    );
    expect(putBodies).toEqual([{ revision: 2, exercises: [] }]);
  });

  test("el acordeón de una sola columna mantiene un Ejercicio desplegado y muestra el progreso", async () => {
    const session = {
      ...emptySession,
      revision: 3,
      lastExerciseId: null,
      exercises: [
        occurrenceDoc(benchPress, [
          seriesDoc({ id: "serie-1", status: "completada", result: { carga: 80, repeticiones: 10, duracion: null } }),
          seriesDoc({ id: "serie-2", order: 1 }),
        ]),
        occurrenceDoc(
          bulgarianSquats,
          [seriesDoc({ id: "serie-3", status: "omitida" })],
          { id: "occurrence-2" },
        ),
      ],
    };
    stubFetch((url) => {
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    const bench = await screen.findByRole("button", { name: /Press de banca con barra/ });
    const squats = screen.getByRole("button", { name: /Sentadilla búlgara/ });

    // al desplegar un Ejercicio se muestra su progreso; al abrir otro, el
    // anterior se pliega: una sola columna activa
    await user.click(bench);
    expect(screen.getByRole("button", { name: /Press de banca con barra/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("1 completadas · 1 pendientes")).toBeInTheDocument();

    // pulsar el Ejercicio desplegado no pliega el último: la Sesión mantiene
    // un Ejercicio desplegado en todo momento
    await user.click(screen.getByRole("button", { name: /Press de banca con barra/ }));
    expect(screen.getByRole("button", { name: /Press de banca con barra/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Sentadilla búlgara/ })).toHaveAttribute("aria-expanded", "false");

    await user.click(squats);
    expect(screen.getByRole("button", { name: /Press de banca con barra/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Sentadilla búlgara/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("0 completadas · 1 omitidas")).toBeInTheDocument();
  });
});

describe("finalizar y eliminar la Sesión activa", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("Finalizar queda inhabilitado sin ninguna Serie completada", async () => {
    const occurrence = occurrenceDoc(pushUps, [
      seriesDoc({ id: "serie-1" }),
      seriesDoc({ id: "serie-2", order: 1 }),
    ]);
    stubFetch((url) => {
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    renderPage();

    await userEvent.setup().click(
      await screen.findByRole("button", { name: /Flexiones/ }),
    );
    expect(await screen.findByRole("button", { name: "Finalizar" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("Finalizar con Series pendientes pide confirmación indicando cuántas pasarán a omitidas", async () => {
    const occurrence = occurrenceDoc(pushUps, [
      seriesDoc({ id: "serie-1", status: "completada", result: { carga: null, repeticiones: 10, duracion: null } }),
      seriesDoc({ id: "serie-2", order: 1 }),
      seriesDoc({ id: "serie-3", order: 2 }),
    ]);
    let postCalls = 0;
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa/finalize") {
        postCalls += 1;
        return {
          status: 200,
          body: {
            session: {
              ...sessionWithOccurrence(
                occurrenceDoc(pushUps, [
                  seriesDoc({ id: "serie-1", status: "completada", result: { carga: null, repeticiones: 10, duracion: null } }),
                  seriesDoc({ id: "serie-2", order: 1, status: "omitida" }),
                  seriesDoc({ id: "serie-3", order: 2, status: "omitida" }),
                ]),
              ),
              status: "finalizada",
            },
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
      await screen.findByRole("button", { name: /Flexiones/ }),
    );
    await user.click(screen.getByRole("button", { name: "Finalizar" }));

    const dialog = await screen.findByRole("dialog", { name: "Finalizar la Sesión" });
    expect(
      within(dialog).getByText("2 Series pendientes pasarán a omitidas al finalizar."),
    ).toBeInTheDocument();
    // cancelar no finaliza
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(postCalls).toBe(0);

    // confirmar finaliza y muestra el resumen sin Series pendientes
    await user.click(screen.getByRole("button", { name: "Finalizar" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Finalizar la Sesión" })).getByRole("button", { name: "Finalizar" }),
    );

    expect(await screen.findByRole("heading", { name: "Sesión finalizada" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Resumen de la Sesión" }),
    ).toBeInTheDocument();
    expect(postCalls).toBe(1);
    const resumen = screen.getByRole("region", { name: "Resumen de la Sesión" });
    expect(within(resumen).getByRole("status")).toHaveTextContent("1 completadas · 2 omitidas");
    expect(
      screen.getByText("La Sesión quedó sin Series pendientes y ya no aparece como activa."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Inicio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalizar" })).not.toBeInTheDocument();
  });

  test("Finalizar sin Series pendientes no pide confirmación", async () => {
    const occurrence = occurrenceDoc(pushUps, [
      seriesDoc({ id: "serie-1", status: "completada", result: { carga: null, repeticiones: 10, duracion: null } }),
    ]);
    let postCalls = 0;
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa/finalize") {
        postCalls += 1;
        return {
          status: 200,
          body: {
            session: {
              ...sessionWithOccurrence(
                occurrenceDoc(pushUps, [
                  seriesDoc({ id: "serie-1", status: "completada", result: { carga: null, repeticiones: 10, duracion: null } }),
                ]),
              ),
              status: "finalizada",
            },
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
      await screen.findByRole("button", { name: /Flexiones/ }),
    );
    await user.click(screen.getByRole("button", { name: "Finalizar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Sesión finalizada" })).toBeInTheDocument();
    expect(postCalls).toBe(1);
  });

  test("eliminar una Sesión activa exige confirmación y devuelve a Inicio", async () => {
    const occurrence = occurrenceDoc(benchPress, [
      seriesDoc({ id: "serie-1" }),
    ]);
    let deleteCalls: string[] = [];
    stubFetch((url, init) => {
      if ((init.method ?? "GET") === "DELETE") {
        deleteCalls.push(url);
        return { status: 200, body: { deleted: true } };
      }
      if (url === "/api/sessions/sesion-activa") {
        return { status: 200, body: { session: sessionWithOccurrence(occurrence) } };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage("sesion-activa", <div>Inicio de prueba</div>);

    await user.click(
      await screen.findByRole("button", { name: /Press de banca con barra/ }),
    );
    await user.click(screen.getByRole("button", { name: "Eliminar sesión" }));

    const dialog = await screen.findByRole("dialog", { name: "Eliminar la Sesión activa" });
    expect(
      within(dialog).getByText("Se eliminará la Sesión y todo su registro. Esta acción no se puede deshacer."),
    ).toBeInTheDocument();
    // cancelar no elimina
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(deleteCalls).toHaveLength(0);

    // confirmar elimina con la revisión y vuelve a Inicio
    await user.click(screen.getByRole("button", { name: "Eliminar sesión" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Eliminar la Sesión activa" })).getByRole("button", { name: "Eliminar sesión" }),
    );

    expect(await screen.findByText("Inicio de prueba")).toBeInTheDocument();
    expect(deleteCalls).toEqual(["/api/sessions/sesion-activa?revision=2"]);
  });

  test("un conflicto al finalizar carga la versión vigente sin inventar estado", async () => {
    const occurrence = occurrenceDoc(pushUps, [
      seriesDoc({ id: "serie-1", status: "completada", result: { carga: null, repeticiones: 10, duracion: null } }),
    ]);
    stubFetch((url, init) => {
      if (url === "/api/sessions/sesion-activa/finalize") {
        return {
          status: 409,
          body: { error: { code: "REVISION_CONFLICT", message: "La Sesión ha cambiado." } },
        };
      }
      if (url === "/api/sessions/sesion-activa") {
        return {
          status: 200,
          body: {
            session: {
              ...sessionWithOccurrence(occurrence),
              revision: 3,
            },
          },
        };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Flexiones/ }),
    );
    await user.click(screen.getByRole("button", { name: "Finalizar" }));

    expect(
      await screen.findByText("La Sesión cambió en otra pestaña. Se cargó la versión vigente."),
    ).toBeInTheDocument();
    // la versión vigente sigue activa y se puede volver a intentar
    expect(screen.getByRole("button", { name: "Finalizar" })).toBeInTheDocument();
  });
});
