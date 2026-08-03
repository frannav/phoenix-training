import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubFetch } from "../../../test/mock-fetch";
import type { ExerciseItem } from "../../exercises/api/exercises-api";
import type { RoutineItem } from "../api/routines-api";
import { NewRoutinePage } from "./NewRoutinePage";
import { RoutineDetailPage } from "./RoutineDetailPage";
import { RoutinesPage } from "./RoutinesPage";

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

const sprints: ExerciseItem = {
  id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  name: "Sprints",
  instructions: "Recorre una distancia corta a la máxima velocidad.",
  recordingMode: "cardio_continuo",
  category: "Cardio",
  bodyPart: "Cardio",
  equipment: "Peso corporal",
  provenance: "catalogo",
  available: true,
};

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
          { id: "33333333333333333333333333333333", order: 0, carga: 60, repeticiones: 10, duracion: null },
          { id: "44444444444444444444444444444444", order: 1, carga: null, repeticiones: 8, duracion: null },
        ],
      },
    ],
    ...overrides,
  };
}

type RoutineHandlers = {
  list: () => RoutineItem[];
  get?: (id: string) => RoutineItem;
  create?: (body: unknown) => RoutineItem;
  replace?: (id: string, body: unknown) => { status: number; body: unknown };
  archive?: (id: string) => RoutineItem;
  restore?: (id: string) => RoutineItem;
  availableExercises?: (q: string) => ExerciseItem[];
};

function stubRoutines(handlers: RoutineHandlers) {
  stubFetch((url, init) => {
    const parsed = new URL(url, "http://test");
    const method = init.method ?? "GET";
    const body = init.body ? (JSON.parse(String(init.body)) as unknown) : undefined;

    if (parsed.pathname === "/api/routines" && method === "GET") {
      return { status: 200, body: { items: handlers.list() } };
    }
    if (parsed.pathname === "/api/routines" && method === "POST") {
      const routine = handlers.create!(body);
      return { status: 201, body: { routine } };
    }
    const detailMatch = parsed.pathname.match(/^\/api\/routines\/([0-9a-f]+)$/);
    if (detailMatch && method === "GET") {
      return { status: 200, body: { routine: handlers.get!(detailMatch[1]!) } };
    }
    if (detailMatch && method === "PUT") {
      return handlers.replace!(detailMatch[1]!, body);
    }
    const archiveMatch = parsed.pathname.match(/^\/api\/routines\/([0-9a-f]+)\/archive$/);
    if (archiveMatch) {
      return { status: 200, body: { routine: handlers.archive!(archiveMatch[1]!) } };
    }
    const restoreMatch = parsed.pathname.match(/^\/api\/routines\/([0-9a-f]+)\/restore$/);
    if (restoreMatch) {
      return { status: 200, body: { routine: handlers.restore!(restoreMatch[1]!) } };
    }
    if (parsed.pathname === "/api/exercises" && method === "GET") {
      return {
        status: 200,
        body: {
          items: handlers.availableExercises?.(parsed.searchParams.get("q") ?? "") ?? [press, sprints],
          nextCursor: null,
        },
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

describe("listado de Rutinas", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("muestra las Rutinas disponibles con su resumen y las archivadas con Restaurar", async () => {
    const available = routineFixture();
    const archived = routineFixture({
      id: "99999999999999999999999999999999",
      name: "Día de tracción",
      archived: true,
    });
    stubRoutines({ list: () => [available, archived] });
    renderWithRoutes(
      "/rutinas",
      <Routes>
        <Route path="/rutinas" element={<RoutinesPage />} />
      </Routes>,
    );

    expect(await screen.findByText("Día de empuje")).toBeInTheDocument();
    expect(screen.getAllByText("1 Ejercicio · 2 Series")).toHaveLength(2);
    expect(screen.getByText("Día de tracción")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rutinas archivadas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nueva Rutina" })).toHaveAttribute(
      "href",
      "/rutinas/nueva",
    );
  });

  test("archivar con confirmación accesible: cancelar conserva y confirmar retira", async () => {
    const user = userEvent.setup();
    const available = [routineFixture()];
    const archived: RoutineItem[] = [];
    stubRoutines({
      list: () => [...available, ...archived],
      archive: (id) => {
        const routine = available.find((item) => item.id === id)!;
        available.splice(available.indexOf(routine), 1);
        archived.push({ ...routine, archived: true });
        return archived[archived.length - 1]!;
      },
    });
    renderWithRoutes(
      "/rutinas",
      <Routes>
        <Route path="/rutinas" element={<RoutinesPage />} />
      </Routes>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Archivar Día de empuje" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Archivar «Día de empuje»/i,
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Archivar Día de empuje" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archivar Día de empuje" }));
    const confirmed = await screen.findByRole("dialog", {
      name: /Archivar «Día de empuje»/i,
    });
    await user.click(within(confirmed).getByRole("button", { name: "Archivar" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Archivar Día de empuje" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await within(
        screen.getByRole("heading", { name: "Rutinas archivadas" }).closest("section")!,
      ).findByText("Día de empuje"),
    ).toBeInTheDocument();
  });

  test("restaura una Rutina archivada y vuelve a los usos nuevos", async () => {
    const user = userEvent.setup();
    const available: RoutineItem[] = [];
    const archived: RoutineItem[] = [
      routineFixture({ id: "99999999999999999999999999999999", archived: true }),
    ];
    stubRoutines({
      list: () => [...available, ...archived],
      restore: (id) => {
        const routine = archived.find((item) => item.id === id)!;
        archived.splice(archived.indexOf(routine), 1);
        available.push({ ...routine, archived: false });
        return available[available.length - 1]!;
      },
    });
    renderWithRoutes(
      "/rutinas",
      <Routes>
        <Route path="/rutinas" element={<RoutinesPage />} />
      </Routes>,
    );

    await user.click(await screen.findByRole("button", { name: "Restaurar" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Restaurar" })).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("button", { name: "Archivar Día de empuje" }),
    ).toBeInTheDocument();
  });
});

describe("crear una Rutina", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("buscar un Ejercicio filtra el listado sin enviar el formulario de la Rutina", async () => {
    const user = userEvent.setup();
    const queries: string[] = [];
    const createCalls: unknown[] = [];
    stubRoutines({
      list: () => [],
      create: (body) => {
        createCalls.push(body);
        return routineFixture();
      },
      availableExercises: (q) => {
        queries.push(q);
        return q.toLowerCase().includes("press") ? [press] : [press, sprints];
      },
    });
    renderWithRoutes(
      "/rutinas/nueva",
      <Routes>
        <Route path="/rutinas/nueva" element={<NewRoutinePage />} />
      </Routes>,
    );

    await user.click(screen.getByRole("button", { name: "Añadir ejercicio" }));
    const picker = screen.getByRole("region", { name: "Añadir Ejercicio a la Rutina" });
    const search = within(picker).getByRole("searchbox", {
      name: "Buscar Ejercicios disponibles",
    });
    await user.type(search, "press");
    await user.click(within(picker).getByRole("button", { name: "Buscar" }));

    expect(await within(picker).findByText("Press de banca con barra")).toBeInTheDocument();
    expect(within(picker).queryByText("Sprints")).not.toBeInTheDocument();
    expect(queries).toContain("press");
    expect(screen.queryByText("Escribe un nombre para la Rutina.")).not.toBeInTheDocument();
    expect(createCalls).toHaveLength(0);
  });

  test("valida el borrador y envía el agregado con Ejercicios ordenados y Objetivos", async () => {
    const user = userEvent.setup();
    const payloads: unknown[] = [];
    stubRoutines({
      list: () => [],
      create: (body) => {
        payloads.push(body);
        return routineFixture({ name: (body as { name: string }).name });
      },
    });
    renderWithRoutes(
      "/rutinas/nueva",
      <Routes>
        <Route path="/rutinas/nueva" element={<NewRoutinePage />} />
        <Route path="/rutinas/:rutinaId" element={<div>Detalle de la Rutina</div>} />
        <Route path="/rutinas" element={<div>Listado de Rutinas</div>} />
      </Routes>,
    );

    // validación inmediata del borrador
    await user.click(screen.getByRole("button", { name: "Crear Rutina" }));
    expect(
      await screen.findByText("Escribe un nombre para la Rutina."),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nombre de la Rutina"), "Torso completo");

    // añadir el primer Ejercicio desde el selector de disponibles
    await user.click(screen.getByRole("button", { name: "Añadir ejercicio" }));
    const picker = screen.getByRole("region", { name: "Añadir Ejercicio a la Rutina" });
    await user.click(within(picker).getAllByRole("button", { name: "Añadir" })[0]!);
    const pressCard = screen.getByRole("article", { name: "Press de banca con barra" });
    expect(pressCard).toBeInTheDocument();

    // objetivos de la primera Serie y una Serie nueva
    await user.type(within(pressCard).getByLabelText("Carga (kg)"), "60");
    await user.type(within(pressCard).getByLabelText("Repeticiones"), "10");
    await user.click(within(pressCard).getByRole("button", { name: "Añadir serie" }));
    await user.type(within(pressCard).getAllByLabelText("Repeticiones")[1]!, "8");

    // añadir cardio continuo: una única Serie sin «Añadir serie»
    await user.click(screen.getByRole("button", { name: "Añadir ejercicio" }));
    const pickerTwo = screen.getByRole("region", { name: "Añadir Ejercicio a la Rutina" });
    await user.click(within(pickerTwo).getAllByRole("button", { name: "Añadir" })[1]!);
    const cardioCard = screen.getByRole("article", { name: "Sprints" });
    await user.type(within(cardioCard).getByLabelText("Duración (seg)"), "1800");
    expect(
      within(cardioCard).queryByRole("button", { name: "Añadir serie" }),
    ).not.toBeInTheDocument();

    // ordenar: subir el cardio por encima del press
    await user.click(screen.getByRole("button", { name: "Subir Sprints" }));

    await user.click(screen.getByRole("button", { name: "Crear Rutina" }));

    await waitFor(() => expect(payloads).toHaveLength(1));
    expect(payloads[0]).toEqual({
      name: "Torso completo",
      exercises: [
        {
          id: undefined,
          exerciseId: sprints.id,
          series: [{ id: undefined, carga: null, repeticiones: null, duracion: 1800 }],
        },
        {
          id: undefined,
          exerciseId: press.id,
          series: [
            { id: undefined, carga: 60, repeticiones: 10, duracion: null },
            { id: undefined, carga: null, repeticiones: 8, duracion: null },
          ],
        },
      ],
    });
  });
});

describe("editar una Rutina", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("prellena el editor y sustituye el agregado con la revisión y las identidades de los hijos", async () => {
    const user = userEvent.setup();
    const routine = routineFixture();
    const payloads: unknown[] = [];
    stubRoutines({
      list: () => [routine],
      get: () => routine,
      replace: (id, body) => {
        payloads.push({ id, body });
        return {
          status: 200,
          body: {
            routine: routineFixture({ name: (body as { name: string }).name, revision: 2 }),
          },
        };
      },
    });
    renderWithRoutes(
      `/rutinas/${routine.id}`,
      <Routes>
        <Route path="/rutinas/:rutinaId" element={<RoutineDetailPage />} />
        <Route path="/rutinas" element={<div>Listado de Rutinas</div>} />
      </Routes>,
    );

    const nameInput = (await screen.findByLabelText("Nombre de la Rutina")) as HTMLInputElement;
    expect(nameInput).toHaveValue("Día de empuje");
    const card = screen.getByRole("article", { name: "Press de banca con barra" });
    expect(within(card).getAllByLabelText("Carga (kg)")[0]).toHaveValue(60);
    expect(within(card).getAllByLabelText("Carga (kg)")[1]).toHaveValue(null);
    expect(within(card).getAllByLabelText("Repeticiones")).toHaveLength(2);
    expect(within(card).getAllByLabelText("Repeticiones")[1]).toHaveValue(8);

    await user.clear(nameInput);
    await user.type(nameInput, "Día de empuje v2");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(payloads).toHaveLength(1));
    expect(payloads[0]).toMatchObject({
      id: routine.id,
      body: {
        revision: 1,
        name: "Día de empuje v2",
        exercises: [
          {
            id: "22222222222222222222222222222222",
            exerciseId: press.id,
            series: [
              { id: "33333333333333333333333333333333", carga: 60, repeticiones: 10 },
              { id: "44444444444444444444444444444444", carga: null, repeticiones: 8 },
            ],
          },
        ],
      },
    });
    expect(await screen.findByText("Listado de Rutinas")).toBeInTheDocument();
  });

  test("una revisión obsoleta informa del conflicto y carga la versión vigente sin mezclar", async () => {
    const user = userEvent.setup();
    const routine = routineFixture();
    const replaceCalls = { count: 0 };
    const refetches = { count: 0 };
    stubRoutines({
      list: () => [routine],
      get: (id) => {
        void id;
        refetches.count += 1;
        return routine;
      },
      replace: () => {
        replaceCalls.count += 1;
        return {
          status: 409,
          body: {
            error: {
              code: "STALE_REVISION",
              message: "La Rutina fue modificada por otra sesión.",
            },
          },
        };
      },
    });
    renderWithRoutes(
      `/rutinas/${routine.id}`,
      <Routes>
        <Route path="/rutinas/:rutinaId" element={<RoutineDetailPage />} />
        <Route path="/rutinas" element={<div>Listado de Rutinas</div>} />
      </Routes>,
    );

    const nameInput = (await screen.findByLabelText("Nombre de la Rutina")) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Cambio ajeno");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(/modificada por otra sesión/i);
    expect(replaceCalls.count).toBe(1);

    // cargar la versión vigente reobtiene el documento y remonta el editor
    const fetchesBefore = refetches.count;
    await user.click(
      screen.getByRole("button", { name: "Cargar la versión actual" }),
    );
    await waitFor(() => expect(refetches.count).toBeGreaterThan(fetchesBefore));
    expect(await screen.findByLabelText("Nombre de la Rutina")).toHaveValue("Día de empuje");
  });
});
