import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubFetch } from "../../../test/mock-fetch";
import type { ExerciseItem, RecordedMax } from "../api/exercises-api";
import { ExercisesPage } from "./ExercisesPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/ejercicios"]}>
        <Routes>
          <Route path="/ejercicios" element={<ExercisesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

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

const sprints = {
  id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  name: "Sprints",
  instructions: "Recorre una distancia corta a la máxima velocidad.",
  recordingMode: "cardio_continuo",
  category: "Cardio",
  bodyPart: "Cardio",
  equipment: "Peso corporal",
  provenance: "catalogo",
  available: true,
} as const;

function stubCatalog(handler: (url: URL) => { status: number; body: unknown }) {
  stubFetch((url) => {
    const parsed = new URL(url, "http://test");
    if (parsed.pathname === "/api/exercises/categories") {
      return { status: 200, body: { categories: ["Pecho", "Cardio"] } };
    }
    if (parsed.pathname === "/api/exercises") {
      return handler(parsed);
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
  });
}

describe("pantalla de Ejercicios del catálogo", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("muestra el catálogo con procedencia y un placeholder común sin imágenes", async () => {
    stubCatalog(() => ({
      status: 200,
      body: { items: [benchPress, sprints], nextCursor: null },
    }));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Ejercicios" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Press de banca con barra")).toBeInTheDocument();
    expect(screen.getByText("Sprints")).toBeInTheDocument();
    expect(screen.getByText("Fuerza con carga · Pecho")).toBeInTheDocument();
    expect(screen.getAllByText("Catálogo")).toHaveLength(2);
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  test("selecciona un Ejercicio y muestra sus instrucciones", async () => {
    const user = userEvent.setup();
    stubCatalog(() => ({
      status: 200,
      body: { items: [benchPress], nextCursor: null },
    }));
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Press de banca con barra/ }),
    );

    expect(screen.getByText("Cómo se registra")).toBeInTheDocument();
    expect(
      screen.getByText("Túmbate sobre un banco y baja la barra hasta el pecho."),
    ).toBeInTheDocument();
  });

  test("busca por nombre y la petición incluye el texto", async () => {
    const user = userEvent.setup();
    const requestedUrls: string[] = [];
    stubCatalog((parsed) => {
      requestedUrls.push(parsed.search);
      return {
        status: 200,
        body: parsed.searchParams.has("q") ? { items: [sprints], nextCursor: null } : { items: [benchPress, sprints], nextCursor: null },
      };
    });
    renderPage();

    await screen.findByText("Press de banca con barra");
    await user.type(screen.getByLabelText("Buscar por nombre"), "sprints");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("Sprints")).toBeInTheDocument();
    expect(requestedUrls.some((query) => query.includes("q=sprints"))).toBe(true);
  });

  test("filtra por Forma de registro y por categoría", async () => {
    const user = userEvent.setup();
    const requestedUrls: string[] = [];
    stubCatalog((parsed) => {
      requestedUrls.push(parsed.search);
      return {
        status: 200,
        body: { items: [benchPress], nextCursor: null },
      };
    });
    renderPage();

    await screen.findByText("Press de banca con barra");
    await user.selectOptions(
      screen.getByLabelText("Forma de registro"),
      "cardio_continuo",
    );
    await user.selectOptions(screen.getByLabelText("Categoría"), "Cardio");

    expect(
      requestedUrls.some((query) => query.includes("recordingMode=cardio_continuo")),
    ).toBe(true);
    expect(requestedUrls.some((query) => query.includes("category=Cardio"))).toBe(true);
  });

  test("carga más Ejercicios con el cursor opaco", async () => {
    const user = userEvent.setup();
    const secondPage = {
      id: "cccccccccccccccccccccccccccccccc",
      name: "Dominada asistida",
      instructions: "Ayúdate de la máquina para subir hasta la barra.",
      recordingMode: "repeticiones_sin_carga",
      category: "Espalda",
      bodyPart: "Espalda",
      equipment: "Máquina de dominadas",
      provenance: "catalogo",
      available: true,
    } as const;
    const requestedCursors: string[] = [];
    stubCatalog((parsed) => {
      const cursor = parsed.searchParams.get("cursor");
      if (cursor) {
        requestedCursors.push(cursor);
        return { status: 200, body: { items: [secondPage], nextCursor: null } };
      }
      return { status: 200, body: { items: [benchPress], nextCursor: "cursor-opaco-1" } };
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Cargar más" }));

    expect(await screen.findByText("Dominada asistida")).toBeInTheDocument();
    expect(requestedCursors).toEqual(["cursor-opaco-1"]);
  });

  test("muestra un estado vacío y permite limpiar los filtros", async () => {
    const user = userEvent.setup();
    stubCatalog(() => ({ status: 200, body: { items: [], nextCursor: null } }));
    renderPage();

    const empty = await screen.findByRole("heading", { name: "Sin Ejercicios que mostrar" });
    expect(empty).toBeInTheDocument();

    await user.type(screen.getByLabelText("Buscar por nombre"), "nada");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await user.click(
      await screen.findByRole("button", { name: "Limpiar búsqueda y filtros" }),
    );

    expect(screen.getByLabelText("Buscar por nombre")).toHaveValue("");
  });

  test("informa cuando el catálogo no se puede cargar", async () => {
    stubCatalog(() => ({
      status: 500,
      body: { error: { code: "SERVER_ERROR", message: "Error" } },
    }));
    renderPage();

    expect(
      await screen.findByText(/No se pudo cargar el catálogo/i),
    ).toBeInTheDocument();
  });
});

const customExercise: ExerciseItem = {
  id: "dddddddddddddddddddddddddddddddd",
  name: "Peso muerto rumano",
  instructions:
    "Baja la barra hasta la mitad de la espinilla manteniendo la espalda recta.",
  recordingMode: "fuerza_con_carga",
  category: "Pierna",
  bodyPart: "Isquiotibiales",
  equipment: "Barra",
  provenance: "personalizado",
  available: true,
};

function stubCustomFlows(handlers: {
  list: () => ExerciseItem[];
  archived: () => ExerciseItem[];
  onCreate?: (body: unknown) => ExerciseItem;
  onUpdate?: (id: string, body: unknown) => ExerciseItem;
  onArchive?: (id: string) => ExerciseItem;
  onRestore?: (id: string) => ExerciseItem;
}) {
  stubFetch((url, init) => {
    const parsed = new URL(url, "http://test");
    const method = init.method ?? "GET";
    if (parsed.pathname === "/api/exercises/categories") {
      return { status: 200, body: { categories: ["Pecho", "Pierna"] } };
    }
    if (parsed.pathname === "/api/exercises/archived") {
      return { status: 200, body: { items: handlers.archived() } };
    }
    if (parsed.pathname === "/api/exercises" && method === "GET") {
      return { status: 200, body: { items: handlers.list(), nextCursor: null } };
    }
    if (parsed.pathname === "/api/exercises" && method === "POST") {
      const body = JSON.parse(String(init.body)) as unknown;
      return { status: 201, body: { exercise: handlers.onCreate!(body) } };
    }
    const updateMatch = parsed.pathname.match(/^\/api\/exercises\/([0-9a-f]+)$/);
    if (updateMatch && method === "PUT") {
      const body = JSON.parse(String(init.body)) as unknown;
      return { status: 200, body: { exercise: handlers.onUpdate!(updateMatch[1]!, body) } };
    }
    const archiveMatch = parsed.pathname.match(/^\/api\/exercises\/([0-9a-f]+)\/archive$/);
    if (archiveMatch) {
      return { status: 200, body: { exercise: handlers.onArchive!(archiveMatch[1]!) } };
    }
    const restoreMatch = parsed.pathname.match(/^\/api\/exercises\/([0-9a-f]+)\/restore$/);
    if (restoreMatch) {
      return { status: 200, body: { exercise: handlers.onRestore!(restoreMatch[1]!) } };
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
  });
}

describe("gestión de Ejercicios personalizados", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("el flujo combinado muestra la procedencia de cada Ejercicio", async () => {
    stubCustomFlows({
      list: () => [benchPress, customExercise],
      archived: () => [],
    });
    renderPage();

    expect(await screen.findByText("Peso muerto rumano")).toBeInTheDocument();
    expect(screen.getAllByText("Personalizado")).toHaveLength(1);
    expect(screen.getAllByText("Catálogo")).toHaveLength(1);
  });

  test("crea un Ejercicio personalizado validando el formulario", async () => {
    const user = userEvent.setup();
    let list: ExerciseItem[] = [benchPress];
    const payloads: unknown[] = [];
    stubCustomFlows({
      list: () => list,
      archived: () => [],
      onCreate: (body) => {
        payloads.push(body);
        const values = body as {
          name: string;
          instructions: string;
          recordingMode: ExerciseItem["recordingMode"];
          category: string;
        };
        const exercise: ExerciseItem = {
          ...customExercise,
          name: values.name,
          instructions: values.instructions,
          recordingMode: values.recordingMode,
          category: values.category,
        };
        list = [benchPress, exercise];
        return exercise;
      },
    });
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Nuevo ejercicio" }),
    );
    const form = within(
      await screen.findByRole("region", { name: "Nuevo Ejercicio personalizado" }),
    );

    // las validaciones aparecen junto al campo afectado
    await user.click(form.getByRole("button", { name: "Crear Ejercicio" }));
    expect(
      await form.findByText("Escribe un nombre para el Ejercicio."),
    ).toBeInTheDocument();
    expect(
      form.getByText("Escribe las instrucciones del Ejercicio."),
    ).toBeInTheDocument();

    await user.type(form.getByLabelText("Nombre"), "Peso muerto rumano");
    await user.type(
      form.getByLabelText("Instrucciones"),
      "Baja la barra hasta la mitad de la espinilla.",
    );
    await user.selectOptions(
      form.getByLabelText("Forma de registro"),
      "fuerza_con_carga",
    );
    await user.type(form.getByLabelText("Categoría"), "Pierna");
    await user.click(form.getByRole("button", { name: "Crear Ejercicio" }));

    expect(await screen.findByText("Peso muerto rumano")).toBeInTheDocument();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      name: "Peso muerto rumano",
      recordingMode: "fuerza_con_carga",
      category: "Pierna",
    });
    expect(
      screen.queryByRole("heading", { name: "Nuevo Ejercicio personalizado" }),
    ).not.toBeInTheDocument();
  });

  test("edita un Ejercicio personalizado con la respuesta canónica", async () => {
    const user = userEvent.setup();
    let list: ExerciseItem[] = [customExercise];
    const payloads: unknown[] = [];
    stubCustomFlows({
      list: () => list,
      archived: () => [],
      onUpdate: (id, body) => {
        payloads.push({ id, body });
        const values = body as { name: string; category: string };
        const exercise: ExerciseItem = {
          ...customExercise,
          name: values.name,
          category: values.category,
        };
        list = [exercise];
        return exercise;
      },
    });
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Editar Peso muerto rumano" }),
    );
    const form = within(
      await screen.findByRole("region", { name: "Editar Ejercicio" }),
    );

    const nameInput = form.getByLabelText("Nombre") as HTMLInputElement;
    expect(nameInput).toHaveValue("Peso muerto rumano");
    expect(form.getByLabelText("Forma de registro")).toBeDisabled();
    expect(form.getByText(/La Forma de registro no puede cambiar/)).toBeInTheDocument();

    await user.clear(nameInput);
    await user.type(nameInput, "Peso muerto con piernas semiflexionadas");
    await user.click(form.getByRole("button", { name: "Guardar cambios" }));

    expect(
      await screen.findByText("Peso muerto con piernas semiflexionadas"),
    ).toBeInTheDocument();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ id: customExercise.id });
  });

  test("cambiar de Ejercicio en edición reinicia el formulario al nuevo destino", async () => {
    const user = userEvent.setup();
    const otherCustom: ExerciseItem = {
      id: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      name: "Zancadas búlgaras",
      instructions:
        "Apoya el pie trasero en un banco y desciende con la pierna delantera.",
      recordingMode: "repeticiones_sin_carga",
      category: "Glúteo",
      bodyPart: "Glúteo",
      equipment: "Mancuernas",
      provenance: "personalizado",
      available: true,
    };
    let list: ExerciseItem[] = [customExercise, otherCustom];
    const payloads: unknown[] = [];
    stubCustomFlows({
      list: () => list,
      archived: () => [],
      onUpdate: (id, body) => {
        payloads.push({ id, body });
        const values = body as { name: string };
        const exercise: ExerciseItem = { ...otherCustom, name: values.name };
        list = list.map((item) => (item.id === id ? exercise : item));
        return exercise;
      },
    });
    renderPage();

    // editar A y comprobar que el formulario está prellenado con sus datos
    await user.click(
      await screen.findByRole("button", { name: "Editar Peso muerto rumano" }),
    );
    const form = within(
      await screen.findByRole("region", { name: "Editar Ejercicio" }),
    );
    expect(form.getByLabelText("Nombre")).toHaveValue("Peso muerto rumano");

    // cambiar a B sin desmontar el formulario: los campos deben reiniciarse
    await user.click(
      screen.getByRole("button", { name: "Editar Zancadas búlgaras" }),
    );
    await waitFor(() =>
      expect(form.getByLabelText("Nombre")).toHaveValue("Zancadas búlgaras"),
    );
    expect(form.getByLabelText("Instrucciones")).toHaveValue(
      "Apoya el pie trasero en un banco y desciende con la pierna delantera.",
    );
    expect(form.getByLabelText("Categoría")).toHaveValue("Glúteo");
    expect(form.getByLabelText("Forma de registro")).toBeDisabled();

    // guardar y comprobar que el payload apunta a B con sus valores
    const nameInput = form.getByLabelText("Nombre") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Zancadas búlgaras asistidas");
    await user.click(form.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(payloads).toHaveLength(1));
    expect(payloads[0]).toMatchObject({ id: otherCustom.id });
    expect(
      await screen.findByText("Zancadas búlgaras asistidas"),
    ).toBeInTheDocument();
  });

  test("archiva con confirmación accesible y cancela sin cambiar nada", async () => {
    const user = userEvent.setup();
    const archived: ExerciseItem[] = [];
    const list: ExerciseItem[] = [customExercise];
    stubCustomFlows({
      list: () => list,
      archived: () => archived,
      onArchive: () => {
        archived.push(customExercise);
        list.length = 0;
        return { ...customExercise, available: false };
      },
    });
    renderPage();
    await screen.findByRole("button", { name: "Archivar Peso muerto rumano" });

    // cancelar la confirmación conserva el Ejercicio en los usos nuevos
    await user.click(screen.getByRole("button", { name: "Archivar Peso muerto rumano" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Archivar «Peso muerto rumano»/i,
    });
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Archivar Peso muerto rumano" }),
    ).toBeInTheDocument();

    // confirmar lo archiva: deja los usos nuevos y pasa a los archivados
    await user.click(screen.getByRole("button", { name: "Archivar Peso muerto rumano" }));
    const confirmed = await screen.findByRole("dialog", {
      name: /Archivar «Peso muerto rumano»/i,
    });
    await user.click(within(confirmed).getByRole("button", { name: "Archivar" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Archivar Peso muerto rumano" }),
      ).not.toBeInTheDocument(),
    );
    const archivedHeading = await screen.findByRole("heading", {
      name: "Ejercicios archivados",
    });
    await waitFor(() =>
      expect(
        within(archivedHeading.closest("section")!).getByText("Peso muerto rumano"),
      ).toBeInTheDocument(),
    );
  });

  test("restaura un Ejercicio archivado y vuelve a ofrecerlo", async () => {
    const user = userEvent.setup();
    const archived: ExerciseItem[] = [{ ...customExercise, available: false }];
    const list: ExerciseItem[] = [benchPress];
    stubCustomFlows({
      list: () => list,
      archived: () => archived,
      onRestore: () => {
        archived.length = 0;
        list.push(customExercise);
        return customExercise;
      },
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Restaurar" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Restaurar" })).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("button", { name: "Archivar Peso muerto rumano" }),
    ).toBeInTheDocument();
  });
});

const recordedMax: RecordedMax = {
  id: "11111111111111111111111111111111",
  exerciseId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  exerciseName: "Press de banca con barra",
  load: 140,
  repetitions: 5,
  date: "2025-06-10",
};

const customExerciseForRm: ExerciseItem = {
  id: "22222222222222222222222222222222",
  name: "Peso muerto rumano",
  instructions:
    "Baja la barra hasta la mitad de la espinilla manteniendo la espalda recta.",
  recordingMode: "fuerza_con_carga",
  category: "Pierna",
  bodyPart: "Isquiotibiales",
  equipment: "Barra",
  provenance: "personalizado",
  available: true,
};

function stubRmFlows(handlers: {
  exercises: () => ExerciseItem[];
  rms: () => RecordedMax[];
  onCreate?: (body: unknown) => RecordedMax;
  onUpdate?: (id: string, body: unknown) => RecordedMax;
  onDelete?: (id: string) => RecordedMax;
}) {
  stubFetch((url, init) => {
    const parsed = new URL(url, "http://test");
    const method = init.method ?? "GET";
    if (parsed.pathname === "/api/exercises/categories") {
      return { status: 200, body: { categories: ["Pecho", "Pierna"] } };
    }
    if (parsed.pathname === "/api/exercises/archived") {
      return { status: 200, body: { items: [] } };
    }
    if (parsed.pathname === "/api/exercises" && method === "GET") {
      return { status: 200, body: { items: handlers.exercises(), nextCursor: null } };
    }
    if (parsed.pathname === "/api/rms" && method === "GET") {
      return { status: 200, body: { items: handlers.rms() } };
    }
    if (parsed.pathname === "/api/rms" && method === "POST") {
      const body = JSON.parse(String(init.body)) as unknown;
      return { status: 201, body: { rm: handlers.onCreate!(body) } };
    }
    const rmMatch = parsed.pathname.match(/^\/api\/rms\/([0-9a-f]+)$/);
    if (rmMatch && method === "PUT") {
      const body = JSON.parse(String(init.body)) as unknown;
      return { status: 200, body: { rm: handlers.onUpdate!(rmMatch[1]!, body) } };
    }
    if (rmMatch && method === "DELETE") {
      return { status: 200, body: { rm: handlers.onDelete!(rmMatch[1]!) } };
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
  });
}

describe("gestión de RM registrados", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("lista los RM con Ejercicio, carga, repeticiones y fecha", async () => {
    stubRmFlows({
      exercises: () => [benchPress, customExerciseForRm],
      rms: () => [recordedMax],
    });
    renderPage();

    const item = await screen.findByText("Press de banca con barra");
    expect(item).toBeInTheDocument();
    const row = within(item.closest("li")!);
    expect(row.getByText("140 kg × 5 rep · 10/06/2025")).toBeInTheDocument();
    expect(
      row.getByRole("button", { name: "Editar RM de Press de banca con barra" }),
    ).toBeInTheDocument();
    expect(
      row.getByRole("button", { name: "Eliminar RM de Press de banca con barra" }),
    ).toBeInTheDocument();
  });

  test("muestra un estado vacío cuando no hay marcas registradas", async () => {
    stubRmFlows({ exercises: () => [benchPress], rms: () => [] });
    renderPage();

    expect(
      await screen.findByText(/Aún no has registrado ninguna marca real/i),
    ).toBeInTheDocument();
  });

  test("crea un RM con validación explícita de Ejercicio, carga, repeticiones y fecha", async () => {
    const user = userEvent.setup();
    let rms: RecordedMax[] = [];
    const payloads: unknown[] = [];
    stubRmFlows({
      exercises: () => [benchPress, customExerciseForRm],
      rms: () => rms,
      onCreate: (body) => {
        payloads.push(body);
        const values = body as { exerciseId: string; load: number; repetitions: number; date: string };
        const rm: RecordedMax = {
          id: "33333333333333333333333333333333",
          exerciseId: values.exerciseId,
          exerciseName:
            values.exerciseId === benchPress.id
              ? benchPress.name
              : customExerciseForRm.name,
          load: values.load,
          repetitions: values.repetitions,
          date: values.date,
        };
        rms = [rm];
        return rm;
      },
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Nuevo RM" }));
    const form = within(await screen.findByRole("region", { name: "Nuevo RM" }));

    // enviar vacío muestra las validaciones junto a cada campo
    await user.click(form.getByRole("button", { name: "Registrar RM" }));
    expect(await form.findByText("Elige un Ejercicio.")).toBeInTheDocument();
    expect(form.getByText("Indica la carga en kilogramos.")).toBeInTheDocument();
    expect(form.getByText("Indica el número de repeticiones.")).toBeInTheDocument();
    expect(form.getByText("Indica la fecha del RM.")).toBeInTheDocument();

    // el selector ofrece los Ejercicios disponibles
    const exerciseSelect = form.getByLabelText("Ejercicio") as HTMLSelectElement;
    const optionNames = [...exerciseSelect.options].map((option) => option.text);
    expect(optionNames).toContain("Press de banca con barra");
    expect(optionNames).toContain("Peso muerto rumano");

    await user.selectOptions(exerciseSelect, benchPress.id);
    await user.type(form.getByLabelText("Carga (kg)"), "140");
    await user.type(form.getByLabelText("Repeticiones"), "5");
    fireEvent.change(form.getByLabelText("Fecha"), {
      target: { value: "2025-06-10" },
    });
    await user.click(form.getByRole("button", { name: "Registrar RM" }));

    await waitFor(() => expect(payloads).toHaveLength(1));
    expect(payloads[0]).toEqual({
      exerciseId: benchPress.id,
      load: 140,
      repetitions: 5,
      date: "2025-06-10",
    });
    expect(
      await screen.findByRole("button", { name: "Eliminar RM de Press de banca con barra" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Nuevo RM" }),
    ).not.toBeInTheDocument();
  });

  test("edita un RM con prellenado sin permitir cambiar de Ejercicio", async () => {
    const user = userEvent.setup();
    let rms: RecordedMax[] = [recordedMax];
    const payloads: unknown[] = [];
    stubRmFlows({
      exercises: () => [benchPress, customExerciseForRm],
      rms: () => rms,
      onUpdate: (id, body) => {
        payloads.push({ id, body });
        const values = body as { load: number; repetitions: number; date: string };
        const rm: RecordedMax = { ...recordedMax, ...values };
        rms = [rm];
        return rm;
      },
    });
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Editar RM de Press de banca con barra" }),
    );
    const form = within(await screen.findByRole("region", { name: "Editar RM" }));

    // prellenado desde el documento canónico
    expect(form.getByLabelText("Ejercicio")).toHaveValue(benchPress.id);
    expect(form.getByLabelText("Ejercicio")).toBeDisabled();
    expect(form.getByLabelText("Carga (kg)")).toHaveValue(140);
    expect(form.getByLabelText("Repeticiones")).toHaveValue(5);
    expect(form.getByLabelText("Fecha")).toHaveValue("2025-06-10");
    expect(form.getByText(/El Ejercicio de un RM no puede cambiar/)).toBeInTheDocument();

    await user.clear(form.getByLabelText("Carga (kg)"));
    await user.type(form.getByLabelText("Carga (kg)"), "142.5");
    await user.clear(form.getByLabelText("Repeticiones"));
    await user.type(form.getByLabelText("Repeticiones"), "4");
    fireEvent.change(form.getByLabelText("Fecha"), {
      target: { value: "2025-06-12" },
    });
    await user.click(form.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(payloads).toHaveLength(1));
    expect(payloads[0]).toMatchObject({ id: recordedMax.id });
    expect(payloads[0]).toMatchObject({ body: { load: 142.5, repetitions: 4, date: "2025-06-12" } });
    expect(
      await screen.findByText("142,5 kg × 4 rep · 12/06/2025"),
    ).toBeInTheDocument();
  });

  test("elimina un RM con confirmación y cancela sin cambiar nada", async () => {
    const user = userEvent.setup();
    let rms: RecordedMax[] = [recordedMax];
    const deleted: string[] = [];
    stubRmFlows({
      exercises: () => [benchPress],
      rms: () => rms,
      onDelete: (id) => {
        deleted.push(id);
        rms = [];
        return recordedMax;
      },
    });
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Eliminar RM de Press de banca con barra" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Eliminar RM de «Press de banca con barra»/i,
    });

    // cancelar conserva el RM
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Eliminar RM de Press de banca con barra" }),
    ).toBeInTheDocument();
    expect(deleted).toHaveLength(0);

    // confirmar lo elimina definitivamente
    await user.click(
      screen.getByRole("button", { name: "Eliminar RM de Press de banca con barra" }),
    );
    const confirmed = await screen.findByRole("dialog", {
      name: /Eliminar RM de «Press de banca con barra»/i,
    });
    await user.click(within(confirmed).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(deleted).toEqual([recordedMax.id]));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Eliminar RM de Press de banca con barra" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText(/Aún no has registrado ninguna marca real/i),
    ).toBeInTheDocument();
  });
});
