import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubFetch } from "../../../test/mock-fetch";
import type { ExerciseItem } from "../../exercises/api/exercises-api";
import type { RoutineItem } from "../../routines/api/routines-api";
import type { SessionDocument } from "../../sessions/api/sessions-api";
import type { PlanItem } from "../api/plans-api";
import { NewPlanPage } from "./NewPlanPage";
import { PlanDetailPage } from "./PlanDetailPage";
import { PlansPage } from "./PlansPage";

const press = {
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

function routineFixture(overrides: Partial<RoutineItem> = {}): RoutineItem {
  return {
    id: "11111111111111111111111111111111",
    name: "Día de empuje",
    revision: 1,
    archived: false,
    createdAt: "2025-08-01T10:00:00.000Z",
    updatedAt: "2025-08-01T10:00:00.000Z",
    exercises: [
      {
        id: "22222222222222222222222222222222",
        exerciseId: press.id,
        order: 0,
        exercise: {
          id: press.id,
          name: press.name,
          recordingMode: "fuerza_con_carga",
          available: true,
          provenance: "catalogo",
        },
        series: [
          {
            id: "33333333333333333333333333333333",
            order: 0,
            carga: 60,
            repeticiones: 10,
            duracion: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function planFixture(overrides: Partial<PlanItem> = {}): PlanItem {
  const routine = routineFixture();
  return {
    id: "44444444444444444444444444444444",
    name: "Ciclo base",
    status: "borrador",
    startDate: null,
    revision: 1,
    createdAt: "2025-08-01T10:00:00.000Z",
    updatedAt: "2025-08-01T10:00:00.000Z",
    weeks: [
      {
        id: "55555555555555555555555555555555",
        order: 0,
        trainings: [
          {
            id: "66666666666666666666666666666666",
            day: 0,
            plannedDate: null,
            status: null,
            source: "rutina",
            routineId: routine.id,
            routine: { id: routine.id, name: routine.name, archived: false },
            content: routine.exercises,
          },
        ],
      },
    ],
    ...overrides,
  };
}

type PlansHandlers = {
  list: () => PlanItem[];
  get?: (id: string) => PlanItem;
  create?: (body: unknown) => PlanItem;
  replace?: (id: string, body: unknown) => { status: number; body: unknown };
  delete?: (id: string, revision: number) => void;
  activate?: (id: string, body: { revision: number; startDate: string }) => PlanItem;
  complete?: (id: string, body: { revision: number }) => PlanItem;
  omit?: (id: string, trainingId: string, body: { revision: number }) => PlanItem;
  restore?: (id: string, trainingId: string, body: { revision: number }) => PlanItem;
  duplicate?: (id: string, body: { revision: number; name?: string }) => PlanItem;
  routines?: () => RoutineItem[];
  availableExercises?: () => ExerciseItem[];
  /** Inicio de una Sesión desde un Origen: responde al POST /api/sessions. */
  startSession?: (body: unknown) => { status: number; body: unknown };
  /** Sesión activa vigente de la Cuenta para el conflicto recuperable. */
  activeSession?: () => SessionDocument | null;
};

function stubPlans(handlers: PlansHandlers) {
  stubFetch((url, init) => {
    const parsed = new URL(url, "http://test");
    const method = init.method ?? "GET";
    const body = init.body ? (JSON.parse(String(init.body)) as unknown) : undefined;

    if (parsed.pathname === "/api/plans" && method === "GET") {
      return { status: 200, body: { items: handlers.list() } };
    }
    if (parsed.pathname === "/api/plans" && method === "POST") {
      return { status: 201, body: { plan: handlers.create!(body) } };
    }
    const detailMatch = parsed.pathname.match(/^\/api\/plans\/([0-9a-f]+)$/);
    if (detailMatch && method === "GET") {
      return { status: 200, body: { plan: handlers.get!(detailMatch[1]!) } };
    }
    if (detailMatch && method === "PUT") {
      return handlers.replace!(detailMatch[1]!, body);
    }
    if (detailMatch && method === "DELETE") {
      handlers.delete!(detailMatch[1]!, Number(parsed.searchParams.get("revision")));
      return { status: 200, body: { deleted: true } };
    }
    const activateMatch = parsed.pathname.match(/^\/api\/plans\/([0-9a-f]+)\/activate$/);
    if (activateMatch && method === "POST") {
      return {
        status: 200,
        body: {
          plan: handlers.activate!(
            activateMatch[1]!,
            body as { revision: number; startDate: string },
          ),
        },
      };
    }
    const completeMatch = parsed.pathname.match(/^\/api\/plans\/([0-9a-f]+)\/complete$/);
    if (completeMatch && method === "POST") {
      return {
        status: 200,
        body: {
          plan: handlers.complete!(completeMatch[1]!, body as { revision: number }),
        },
      };
    }
    const omitMatch = parsed.pathname.match(
      /^\/api\/plans\/([0-9a-f]+)\/trainings\/([0-9a-f]+)\/omit$/,
    );
    if (omitMatch && method === "POST") {
      return {
        status: 200,
        body: {
          plan: handlers.omit!(omitMatch[1]!, omitMatch[2]!, body as { revision: number }),
        },
      };
    }
    const restoreMatch = parsed.pathname.match(
      /^\/api\/plans\/([0-9a-f]+)\/trainings\/([0-9a-f]+)\/restore$/,
    );
    if (restoreMatch && method === "POST") {
      return {
        status: 200,
        body: {
          plan: handlers.restore!(restoreMatch[1]!, restoreMatch[2]!, body as { revision: number }),
        },
      };
    }
    const duplicateMatch = parsed.pathname.match(/^\/api\/plans\/([0-9a-f]+)\/duplicate$/);
    if (duplicateMatch && method === "POST") {
      return {
        status: 201,
        body: {
          plan: handlers.duplicate!(
            duplicateMatch[1]!,
            body as { revision: number; name?: string },
          ),
        },
      };
    }
    if (parsed.pathname === "/api/routines" && method === "GET") {
      return { status: 200, body: { items: handlers.routines?.() ?? [] } };
    }
    if (parsed.pathname === "/api/exercises" && method === "GET") {
      return {
        status: 200,
        body: { items: handlers.availableExercises?.() ?? [press], nextCursor: null },
      };
    }
    if (parsed.pathname === "/api/sessions" && method === "POST") {
      return handlers.startSession!(body);
    }
    if (parsed.pathname === "/api/sessions/active" && method === "GET") {
      return { status: 200, body: { session: handlers.activeSession?.() ?? null } };
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
  });
}

function renderWithRoutes(initialPath: string, routes: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>{routes}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Sesión activa creada desde un Entrenamiento planificado, tal como la entrega la API. */
function sessionFixture(overrides: Partial<SessionDocument> = {}): SessionDocument {
  return {
    id: "88888888888888888888888888888888",
    revision: 1,
    origin: "plan",
    status: "activa",
    datePerformed: "2025-08-06",
    plannedDate: "2025-08-04",
    routineId: null,
    planTrainingId: "66666666666666666666666666666666",
    lastExerciseId: null,
    exercises: [],
    startedAt: "2025-08-06T09:00:00.000Z",
    updatedAt: "2025-08-06T09:00:00.000Z",
    ...overrides,
  };
}

/** Destino de la Sesión: muestra el identificador al que se navegó. */
function SessionRoute() {
  const { sesionId } = useParams<{ sesionId: string }>();
  return <div>Sesión {sesionId}</div>;
}

describe("listado de Planes", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("muestra los Planes con su resumen y enlaza a su detalle", async () => {
    stubPlans({
      list: () => [planFixture(), planFixture({ id: "99999999999999999999999999999999", name: "Ciclo avanzado" })],
    });
    renderWithRoutes(
      "/planes",
      <Routes>
        <Route path="/planes" element={<PlansPage />} />
      </Routes>,
    );

    expect(await screen.findByText("Ciclo base")).toBeInTheDocument();
    expect(screen.getByText("Ciclo avanzado")).toBeInTheDocument();
    expect(screen.getAllByText(/1 semana · 1 Entrenamiento/)).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Nuevo Plan" })).toHaveAttribute(
      "href",
      "/planes/nuevo",
    );
  });

  test("eliminar un borrador exige confirmación accesible y no se confirma por accidente", async () => {
    const user = userEvent.setup();
    const items = [planFixture()];
    stubPlans({
      list: () => items,
      delete: (id, revision) => {
        expect(revision).toBe(1);
        items.splice(
          items.findIndex((item) => item.id === id),
          1,
        );
      },
    });
    renderWithRoutes(
      "/planes",
      <Routes>
        <Route path="/planes" element={<PlansPage />} />
      </Routes>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Eliminar Ciclo base" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Eliminar «Ciclo base»/i,
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    // cancelar conserva el Plan
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Eliminar Ciclo base" }),
    ).toBeInTheDocument();

    // confirmar lo elimina
    await user.click(screen.getByRole("button", { name: "Eliminar Ciclo base" }));
    const confirmed = await screen.findByRole("dialog", {
      name: /Eliminar «Ciclo base»/i,
    });
    await user.click(within(confirmed).getByRole("button", { name: "Eliminar" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Eliminar Ciclo base" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/Todavía no has creado ningún Plan/)).toBeInTheDocument();
  });
});describe("crear un Plan", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("valida el borrador y crea un Plan con un Entrenamiento que usa una Rutina", async () => {
    const user = userEvent.setup();
    const payloads: unknown[] = [];
    const routine = routineFixture();
    stubPlans({
      list: () => [],
      routines: () => [routine],
      create: (body) => {
        payloads.push(body);
        return planFixture({ name: (body as { name: string }).name });
      },
    });
    renderWithRoutes(
      "/planes/nuevo",
      <Routes>
        <Route path="/planes/nuevo" element={<NewPlanPage />} />
        <Route path="/planes/:planId" element={<div>Detalle del Plan</div>} />
        <Route path="/planes" element={<div>Listado de Planes</div>} />
      </Routes>,
    );

    // validación inmediata del borrador
    await user.click(screen.getByRole("button", { name: "Crear Plan" }));
    expect(await screen.findByText("Escribe un nombre para el Plan.")).toBeInTheDocument();
    expect(screen.getByText("Un Plan necesita al menos un Entrenamiento planificado.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nombre del Plan"), "Ciclo base");
    await user.click(screen.getByRole("button", { name: "Añadir entrenamiento" }));

    // el Entrenamiento nuevo usa una Rutina disponible
    await user.selectOptions(screen.getByLabelText("Rutina"), routine.id);
    expect(screen.getByText("Personalizar solo este día")).toBeInTheDocument();
    expect(screen.getByText(/Press de banca con barra/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Crear Plan" }));

    await waitFor(() => expect(payloads).toHaveLength(1));
    expect(payloads[0]).toEqual({
      name: "Ciclo base",
      weeks: [
        {
          id: undefined,
          trainings: [
            {
              id: undefined,
              day: 0,
              source: "rutina",
              routineId: routine.id,
              specific: [],
            },
          ],
        },
      ],
    });
    expect(await screen.findByText("Detalle del Plan")).toBeInTheDocument();
  });
});

describe("editar un Plan", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("personalizar solo este día convierte la Rutina en contenido independiente", async () => {
    const user = userEvent.setup();
    const plan = planFixture();
    const routine = routineFixture();
    const payloads: unknown[] = [];
    stubPlans({
      list: () => [plan],
      get: () => plan,
      routines: () => [routine],
      replace: (id, body) => {
        payloads.push({ id, body });
        return {
          status: 200,
          body: {
            plan: {
              ...plan,
              revision: 2,
              weeks: [
                {
                  ...plan.weeks[0]!,
                  trainings: [
                    {
                      ...plan.weeks[0]!.trainings[0]!,
                      source: "especifico",
                      routineId: null,
                      routine: null,
                    },
                  ],
                },
              ],
            },
          },
        };
      },
    });
    renderWithRoutes(
      `/planes/${plan.id}`,
      <Routes>
        <Route path="/planes/:planId" element={<PlanDetailPage />} />
        <Route path="/planes" element={<div>Listado de Planes</div>} />
      </Routes>,
    );

    const nameInput = (await screen.findByLabelText("Nombre del Plan")) as HTMLInputElement;
    expect(nameInput).toHaveValue("Ciclo base");

    // el Entrenamiento muestra el contenido actual de la Rutina
    expect(await screen.findByText("Día de empuje")).toBeInTheDocument();
    expect(screen.getByText(/Press de banca con barra/)).toBeInTheDocument();

    // personalizar el día: copia el contenido y lo vuelve independiente
    await user.click(screen.getByRole("button", { name: "Personalizar solo este día" }));
    const exerciseCard = screen.getByRole("article", { name: "Press de banca con barra" });
    expect(within(exerciseCard).getByLabelText("Carga (kg)")).toHaveValue(60);
    expect(within(exerciseCard).getByLabelText("Repeticiones")).toHaveValue(10);
    expect(
      screen.queryByRole("button", { name: "Personalizar solo este día" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(payloads).toHaveLength(1));
    expect(payloads[0]).toMatchObject({
      id: plan.id,
      body: {
        revision: 1,
        name: "Ciclo base",
        weeks: [
          {
            id: "55555555555555555555555555555555",
            trainings: [
              {
                id: "66666666666666666666666666666666",
                day: 0,
                source: "especifico",
                routineId: null,
                // las copias no conservan las identidades de la Rutina
                specific: [
                  {
                    exerciseId: press.id,
                    series: [{ carga: 60, repeticiones: 10, duracion: null }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  test("una revisión obsoleta informa del conflicto y carga la versión vigente sin mezclar", async () => {
    const user = userEvent.setup();
    const plan = planFixture();
    const routine = routineFixture();
    const replaceCalls = { count: 0 };
    const refetches = { count: 0 };
    stubPlans({
      list: () => [plan],
      get: (id) => {
        void id;
        refetches.count += 1;
        return plan;
      },
      routines: () => [routine],
      replace: () => {
        replaceCalls.count += 1;
        return {
          status: 409,
          body: {
            error: {
              code: "STALE_REVISION",
              message: "El Plan fue modificado por otra sesión. Carga la versión actual antes de guardar.",
            },
          },
        };
      },
    });
    renderWithRoutes(
      `/planes/${plan.id}`,
      <Routes>
        <Route path="/planes/:planId" element={<PlanDetailPage />} />
        <Route path="/planes" element={<div>Listado de Planes</div>} />
      </Routes>,
    );

    const nameInput = (await screen.findByLabelText("Nombre del Plan")) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Cambio ajeno");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /modificado por otra sesión/i,
    );
    expect(replaceCalls.count).toBe(1);

    const fetchesBefore = refetches.count;
    await user.click(screen.getByRole("button", { name: "Cargar la versión actual" }));
    await waitFor(() => expect(refetches.count).toBeGreaterThan(fetchesBefore));
    expect(await screen.findByLabelText("Nombre del Plan")).toHaveValue("Ciclo base");
  });
});

function activePlanFixture(overrides: Partial<PlanItem> = {}): PlanItem {
  const plan = planFixture({ status: "activo", startDate: "2025-08-04" });
  return {
    ...plan,
    weeks: [
      {
        ...plan.weeks[0]!,
        trainings: [
          {
            ...plan.weeks[0]!.trainings[0]!,
            plannedDate: "2025-08-04",
            status: "pendiente",
          },
        ],
      },
    ],
    ...overrides,
  };
}

function completedPlanFixture(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    ...activePlanFixture({ status: "completado" }),
    weeks: [
      {
        ...activePlanFixture().weeks[0]!,
        trainings: [
          {
            ...activePlanFixture().weeks[0]!.trainings[0]!,
            plannedDate: "2025-08-04",
            status: "omitido",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("ciclo de vida en el listado", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("distingue Borrador, Activo y Completado y solo ofrece las transiciones reales", async () => {
    stubPlans({
      list: () => [
        planFixture(),
        activePlanFixture({ id: "99999999999999999999999999999991", name: "Ciclo activo" }),
        completedPlanFixture({ id: "99999999999999999999999999999992", name: "Ciclo completado" }),
      ],
    });
    renderWithRoutes(
      "/planes",
      <Routes>
        <Route path="/planes" element={<PlansPage />} />
      </Routes>,
    );

    expect(await screen.findByText("Ciclo base")).toBeInTheDocument();
    expect(screen.getByText("Ciclo activo")).toBeInTheDocument();
    expect(screen.getByText("Ciclo completado")).toBeInTheDocument();

    // estados distinguibles por texto
    expect(screen.getByText("Borrador")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Completado")).toBeInTheDocument();

    // el calendario solo se muestra para Planes activos o completados
    expect(screen.getAllByText(/4 ago – 10 ago/)).toHaveLength(2);

    // transiciones inexistentes nunca se ofrecen
    expect(screen.queryByRole("button", { name: /Pausar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancelar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Archivar/i })).not.toBeInTheDocument();

    // las acciones dependen del estado: eliminar solo borradores, duplicar cualquiera
    expect(screen.getByRole("button", { name: "Eliminar Ciclo base" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Eliminar Ciclo activo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Eliminar Ciclo completado" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Duplicar/ })).toHaveLength(3);
  });

  test("duplicar desde el listado pide un borrador nuevo", async () => {
    const user = userEvent.setup();
    const items = [planFixture()];
    const requests: Array<{ id: string; body: unknown }> = [];
    stubPlans({
      list: () => items,
      duplicate: (id, body) => {
        requests.push({ id, body });
        const copy = planFixture({
          id: "99999999999999999999999999999999",
          name: "Ciclo base (copia)",
        });
        items.push(copy);
        return copy;
      },
    });
    renderWithRoutes(
      "/planes",
      <Routes>
        <Route path="/planes" element={<PlansPage />} />
      </Routes>,
    );

    await user.click(await screen.findByRole("button", { name: "Duplicar Ciclo base" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      id: "44444444444444444444444444444444",
      body: { revision: 1 },
    });
    expect(await screen.findByText("Ciclo base (copia)")).toBeInTheDocument();
  });
});

describe("activar un Plan borrador", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("envía la fecha elegida y refleja la Fecha prevista calculada", async () => {
    const user = userEvent.setup();
    const plan = planFixture();
    const requests: Array<{ id: string; body: { revision: number; startDate: string } }> = [];
    stubPlans({
      list: () => [plan],
      get: () => plan,
      activate: (id, body) => {
        requests.push({ id, body });
        return {
          ...activePlanFixture(),
          id: plan.id,
          name: plan.name,
          revision: 2,
        };
      },
    });
    renderWithRoutes(
      `/planes/${plan.id}`,
      <Routes>
        <Route path="/planes/:planId" element={<PlanDetailPage />} />
        <Route path="/planes" element={<div>Listado de Planes</div>} />
      </Routes>,
    );

    expect(await screen.findByText("Activar en el calendario")).toBeInTheDocument();
    expect(screen.getByText(/calculará las Fechas previstas/)).toBeInTheDocument();

    const dateInput = screen.getByLabelText("Lunes de la primera semana");
    const activateButton = screen.getByRole("button", { name: "Activar Plan" });
    expect(activateButton).toBeDisabled();

    // La validación de que la fecha sea lunes pertenece al servidor; aquí se
    // comprueba que el editor envía la fecha elegida junto a la revisión.
    fireEvent.change(dateInput, { target: { value: "2025-08-04" } });
    expect(activateButton).toBeEnabled();

    await user.click(activateButton);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      id: plan.id,
      body: { revision: 1, startDate: "2025-08-04" },
    });

    // el estado activo se refleja y el panel de activación desaparece
    expect(await screen.findByRole("button", { name: "Completar Plan" })).toBeInTheDocument();
    expect(screen.queryByText("Activar en el calendario")).not.toBeInTheDocument();
  });

  test("un conflicto de unicidad muestra el mensaje del servidor sin salir del borrador", async () => {
    const user = userEvent.setup();
    const plan = planFixture();
    stubFetch((url, init) => {
      const path = new URL(url, "http://test").pathname;
      const method = init.method ?? "GET";
      if (path === "/api/plans" && method === "GET") {
        return { status: 200, body: { items: [plan] } };
      }
      if (path === `/api/plans/${plan.id}` && method === "GET") {
        return { status: 200, body: { plan } };
      }
      if (path === `/api/plans/${plan.id}/activate` && method === "POST") {
        return {
          status: 409,
          body: {
            error: {
              code: "TRANSITION_IMPOSSIBLE",
              message: "Ya tienes un Plan activo. Complétalo antes de activar otro.",
            },
          },
        };
      }
      return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
    });
    renderWithRoutes(
      `/planes/${plan.id}`,
      <Routes>
        <Route path="/planes/:planId" element={<PlanDetailPage />} />
        <Route path="/planes" element={<div>Listado de Planes</div>} />
      </Routes>,
    );

    const dateInput = await screen.findByLabelText("Lunes de la primera semana");
    fireEvent.change(dateInput, { target: { value: "2025-08-04" } });
    await user.click(screen.getByRole("button", { name: "Activar Plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Ya tienes un Plan activo/);
    // el Plan sigue en el panel de activación, sin transición parcial
    expect(screen.getByText("Activar en el calendario")).toBeInTheDocument();
  });
});

describe("gestionar un Plan activo", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("omite con confirmación, devuelve a pendiente y completa con confirmación", async () => {
    const user = userEvent.setup();
    const trainingId = "66666666666666666666666666666666";
    let current = activePlanFixture();
    const requests: string[] = [];
    stubPlans({
      list: () => [current],
      get: () => current,
      omit: (id, training, _body) => {
        requests.push(`omit:${id}:${training}`);
        current = {
          ...current,
          revision: current.revision + 1,
          weeks: current.weeks.map((week) => ({
            ...week,
            trainings: week.trainings.map((t) =>
              t.id === training ? { ...t, status: "omitido" } : t,
            ),
          })),
        };
        return current;
      },
      restore: (id, training, _body) => {
        requests.push(`restore:${id}:${training}`);
        current = {
          ...current,
          revision: current.revision + 1,
          weeks: current.weeks.map((week) => ({
            ...week,
            trainings: week.trainings.map((t) =>
              t.id === training ? { ...t, status: "pendiente" } : t,
            ),
          })),
        };
        return current;
      },
      complete: (id, _body) => {
        requests.push(`complete:${id}`);
        current = {
          ...current,
          status: "completado",
          revision: current.revision + 1,
          weeks: current.weeks.map((week) => ({
            ...week,
            trainings: week.trainings.map((t) => ({ ...t, status: "omitido" })),
          })),
        };
        return current;
      },
    });
    renderWithRoutes(
      `/planes/${current.id}`,
      <Routes>
        <Route path="/planes/:planId" element={<PlanDetailPage />} />
        <Route path="/planes" element={<div>Listado de Planes</div>} />
      </Routes>,
    );

    // el día pendiente muestra su Fecha prevista como «Prevista» y ofrece omitir
    const omitButton = await screen.findByRole("button", { name: "Omitir este día" });
    expect(screen.getByText(/Día de empuje/)).toBeInTheDocument();
    await user.click(omitButton);

    // la omisión exige confirmación accesible y explícita
    const dialog = await screen.findByRole("dialog", { name: /Omitir este Entrenamiento/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText(/Lunes/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Omitir" }));

    await waitFor(() => expect(requests).toContain(`omit:${current.id}:${trainingId}`));
    // el día omitido se presenta cerrado con su Fecha prevista
    expect(await screen.findByRole("article", { name: "Lunes omitido" })).toBeInTheDocument();
    expect(screen.getByText(/Prevista · 4 ago/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Omitir este día" })).not.toBeInTheDocument();

    // devolver a pendiente es directo y restaura la edición
    await user.click(screen.getByRole("button", { name: "Devolver a pendiente" }));
    await waitFor(() => expect(requests).toContain(`restore:${current.id}:${trainingId}`));
    expect(await screen.findByRole("button", { name: "Omitir este día" })).toBeInTheDocument();

    // completar exige confirmación y cierra el calendario
    await user.click(screen.getByRole("button", { name: "Completar Plan" }));
    const completeDialog = await screen.findByRole("dialog", {
      name: /Completar «Ciclo base»/i,
    });
    await user.click(within(completeDialog).getByRole("button", { name: "Completar" }));
    await waitFor(() => expect(requests).toContain(`complete:${current.id}`));

    // calendario cerrado: sin transiciones de Plan activo
    expect(await screen.findByText("Calendario cerrado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Omitir este día" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completar Plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Devolver a pendiente" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicar Plan" })).toBeInTheDocument();
  });

  test("un Plan activo no permite reorganizar el calendario en el editor", async () => {
    const plan = activePlanFixture();
    stubPlans({ list: () => [plan], get: () => plan });
    renderWithRoutes(
      `/planes/${plan.id}`,
      <Routes>
        <Route path="/planes/:planId" element={<PlanDetailPage />} />
      </Routes>,
    );

    expect(await screen.findByLabelText("Nombre del Plan")).toHaveValue("Ciclo base");
    expect(screen.queryByRole("button", { name: "Añadir semana" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar semana" })).not.toBeInTheDocument();
  });

  test("un día pendiente de un Plan activo muestra su Fecha prevista como «Prevista»", async () => {
    const plan = activePlanFixture();
    stubPlans({ list: () => [plan], get: () => plan });
    renderWithRoutes(
      `/planes/${plan.id}`,
      <Routes>
        <Route path="/planes/:planId" element={<PlanDetailPage />} />
      </Routes>,
    );

    // el día pendiente del editor presenta la Fecha prevista etiquetada, sin
    // confundirla con una Fecha realizada
    expect(await screen.findByText(/Prevista · 4 ago/)).toBeInTheDocument();
    expect(screen.queryByText(/Realizada/)).not.toBeInTheDocument();
  });
});

describe("un Plan completado en solo lectura", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("presenta el calendario cerrado sin transiciones y sin confundir Fechas previstas con realizadas", async () => {
    const completed = completedPlanFixture();
    stubPlans({ list: () => [completed], get: () => completed });
    renderWithRoutes(
      `/planes/${completed.id}`,
      <Routes>
        <Route path="/planes/:planId" element={<PlanDetailPage />} />
      </Routes>,
    );

    expect(await screen.findByText("Calendario cerrado")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Semana 1" })).toBeInTheDocument();
    // Fechas previstas etiquetadas como previstas, nunca como realizadas
    expect(screen.getByText(/Prevista · 4 ago/)).toBeInTheDocument();
    expect(screen.queryByText(/Realizada/)).not.toBeInTheDocument();

    // sin transiciones posibles: sin editar, sin omitir, sin completar
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Omitir este día" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completar Plan" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicar Plan" })).toBeInTheDocument();
  });
});

describe("iniciar una Sesión desde un Entrenamiento planificado", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("un Entrenamiento pendiente ofrece Iniciar y abre la Sesión creada desde él", async () => {
    const user = userEvent.setup();
    const plan = activePlanFixture();
    const trainingId = plan.weeks[0]!.trainings[0]!.id;
    const posts: unknown[] = [];
    const created = sessionFixture();
    stubPlans({
      list: () => [plan],
      get: () => plan,
      startSession: (body) => {
        posts.push(body);
        return { status: 201, body: { session: created } };
      },
    });
    renderWithRoutes(
      `/planes/${plan.id}`,
      <Routes>
        <Route path="/planes/:planId" element={<PlanDetailPage />} />
        <Route path="/sesion/:sesionId" element={<SessionRoute />} />
      </Routes>,
    );

    await user.click(await screen.findByRole("button", { name: "Iniciar" }));

    expect(posts).toEqual([{ origin: "plan", planId: plan.id, trainingId }]);
    expect(await screen.findByText(`Sesión ${created.id}`)).toBeInTheDocument();
  });

  test("si ya existe una Sesión activa, Iniciar conduce a ella sin crear otra", async () => {
    const user = userEvent.setup();
    const plan = activePlanFixture();
    const existing = sessionFixture({
      id: "99999999999999999999999999999999",
      revision: 3,
    });
    stubPlans({
      list: () => [plan],
      get: () => plan,
      startSession: () => ({
        status: 409,
        body: {
          error: {
            code: "ACTIVE_SESSION_EXISTS",
            message: "Ya tienes una Sesión activa.",
            sessionId: existing.id,
          },
        },
      }),
      activeSession: () => existing,
    });
    renderWithRoutes(
      `/planes/${plan.id}`,
      <Routes>
        <Route path="/planes/:planId" element={<PlanDetailPage />} />
        <Route path="/sesion/:sesionId" element={<SessionRoute />} />
      </Routes>,
    );

    await user.click(await screen.findByRole("button", { name: "Iniciar" }));

    expect(await screen.findByText(`Sesión ${existing.id}`)).toBeInTheDocument();
  });

  test("un día omitido no ofrece Iniciar", async () => {
    const routine = routineFixture();
    const omitted = activePlanFixture({
      weeks: [
        {
          id: "55555555555555555555555555555555",
          order: 0,
          trainings: [
            {
              id: "66666666666666666666666666666666",
              day: 0,
              plannedDate: "2025-08-04",
              status: "omitido",
              source: "rutina",
              routineId: routine.id,
              routine: { id: routine.id, name: routine.name, archived: false },
              content: routine.exercises,
            },
          ],
        },
      ],
    });
    stubPlans({ list: () => [omitted], get: () => omitted });
    renderWithRoutes(
      `/planes/${omitted.id}`,
      <Routes>
        <Route path="/planes/:planId" element={<PlanDetailPage />} />
      </Routes>,
    );

    expect(
      await screen.findByRole("article", { name: "Lunes omitido" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar" })).not.toBeInTheDocument();
  });

  test("un fallo al iniciar muestra el error del servidor sin navegar", async () => {
    const user = userEvent.setup();
    const plan = activePlanFixture();
    stubPlans({
      list: () => [plan],
      get: () => plan,
      startSession: () => ({
        status: 409,
        body: {
          error: {
            code: "TRANSITION_IMPOSSIBLE",
            message: "El Entrenamiento ya no puede iniciar una Sesión.",
          },
        },
      }),
    });
    renderWithRoutes(
      `/planes/${plan.id}`,
      <Routes>
        <Route path="/planes/:planId" element={<PlanDetailPage />} />
        <Route path="/sesion/:sesionId" element={<SessionRoute />} />
      </Routes>,
    );

    await user.click(await screen.findByRole("button", { name: "Iniciar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /ya no puede iniciar una Sesión/i,
    );
    expect(screen.queryByText(/^Sesión /)).not.toBeInTheDocument();
  });
});
