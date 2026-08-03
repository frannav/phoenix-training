import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubFetch } from "../../../test/mock-fetch";
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
      await screen.findByRole("alert"),
    ).toHaveTextContent(/No se pudo cargar el catálogo/i);
  });
});
