import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubFetch } from "../../../test/mock-fetch";
import type { ExerciseItem } from "../../exercises/api/exercises-api";
import type { RoutineItem } from "../../routines/api/routines-api";
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
  delete?: (id: string) => void;
  routines?: () => RoutineItem[];
  availableExercises?: () => ExerciseItem[];
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
      handlers.delete!(detailMatch[1]!);
      return { status: 200, body: { deleted: true } };
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
      delete: (id) => {
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
