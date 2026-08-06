import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubFetch } from "../../../test/mock-fetch";
import * as dashboardFixtures from "../../../test/dashboard-fixtures";
import type { SessionDocument } from "../../sessions/api/sessions-api";
import type {
  ActivePlanSummary,
  DashboardResponse,
} from "../api/dashboard-api";
import type { RecordedMax } from "../../exercises/api/exercises-api";
import { App } from "../../../app/App";

const verifiedSession = {
  session: { id: "sesion-opaca", expiresAt: "2026-08-09T00:00:00.000Z", userId: "cuenta-opaca" },
  user: {
    id: "cuenta-opaca",
    email: "deportista@example.com",
    name: "deportista",
    emailVerified: true,
  },
};

const emptySession: SessionDocument = {
  id: "sesion-nueva",
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

const planSession: SessionDocument = {
  ...emptySession,
  id: "plan-sesion-nueva",
  origin: "plan",
  planTrainingId: "training-1",
};

const existingSession: SessionDocument = {
  ...emptySession,
  id: "sesion-existente",
  revision: 2,
  origin: "libre",
  lastExerciseId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  exercises: [
    {
      id: "cccccccccccccccccccccccccccccccc",
      exerciseId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sortOrder: 0,
      added: false,
      exercise: {
        id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Press de banca con barra",
        recordingMode: "fuerza_con_carga",
        provenance: "catalogo",
      },
      series: [],
    },
  ],
};

/** Dashboard sin datos: todos los bloques en su estado vacío. */
const emptyDashboard: DashboardResponse = dashboardFixtures.emptyDashboard;

/** Plan activo con progreso para los tests del segundo bloque. */
const activePlanFixture: ActivePlanSummary = {
  id: "plan-1",
  name: "Ciclo base",
  startDate: "2025-03-10",
  currentWeek: 1,
  weeks: [
    {
      order: 0,
      progress: {
        realizados: 1,
        omitidos: 0,
        pendientes: 1,
        total: 2,
        avance: 50,
        cumplimiento: 50,
        avanceRedondeado: 50,
        cumplimientoRedondeado: 50,
      },
    },
    {
      order: 1,
      progress: {
        realizados: 0,
        omitidos: 1,
        pendientes: 1,
        total: 2,
        avance: 50,
        cumplimiento: 0,
        avanceRedondeado: 50,
        cumplimientoRedondeado: 0,
      },
    },
  ],
  currentWeekTrainings: [
    {
      id: "training-lunes",
      day: 0,
      name: "Día de empuje",
      plannedDate: "2025-03-10",
      status: "realizado",
    },
    {
      id: "training-jueves",
      day: 3,
      name: "Día de tirón",
      plannedDate: "2025-03-13",
      status: "pendiente",
    },
  ],
  progress: {
    realizados: 1,
    omitidos: 1,
    pendientes: 2,
    total: 4,
    avance: 50,
    cumplimiento: 25,
    avanceRedondeado: 50,
    cumplimientoRedondeado: 25,
  },
};

/** Volumen semanal con datos para los tests del tercer bloque. */
const volumeFixture: DashboardResponse["weeklyVolume"] = {
  currentWeekStart: "2025-03-10",
  currentTotal: 12400,
  previousTotal: 11400,
  changePercent: 8.8,
  weeks: [
    { weekStart: "2025-02-03", total: 1200 },
    { weekStart: "2025-02-10", total: 3400 },
    { weekStart: "2025-02-17", total: 4800 },
    { weekStart: "2025-02-24", total: 5600 },
    { weekStart: "2025-03-03", total: 11400 },
    { weekStart: "2025-03-10", total: 12400 },
  ],
};

/** Hasta tres RM recientes para los tests del cuarto bloque. */
const recentMaxesFixture: RecordedMax[] = [
  {
    id: "rm-1",
    exerciseId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    exerciseName: "Sentadilla",
    load: 120,
    repetitions: 1,
    date: "2025-03-01",
  },
  {
    id: "rm-2",
    exerciseId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    exerciseName: "Press de banca con barra",
    load: 85,
    repetitions: 3,
    date: "2025-02-20",
  },
  {
    id: "rm-3",
    exerciseId: "cccccccccccccccccccccccccccccccc",
    exerciseName: "Peso muerto",
    load: 150,
    repetitions: 1,
    date: "2025-02-10",
  },
];

/** Dashboard completo con los cuatro bloques con datos para la presentación responsive. */
const fullDashboard: DashboardResponse = {
  ...emptyDashboard,
  training: {
    kind: "continuar",
    sessionId: "sesion-existente",
    name: "Sesión libre",
    progress: { completadas: 2, total: 5 },
  },
  activePlan: activePlanFixture,
  weeklyVolume: volumeFixture,
  recentRecordedMaxes: recentMaxesFixture,
};

type StubOptions = {
  dashboard?: DashboardResponse | ((exerciseId: string | null) => DashboardResponse);
  active?: SessionDocument | null | (() => SessionDocument | null);
  start?: { status: number; body: unknown };
  onStart?: (body: unknown) => void;
};

function stubHome({ dashboard, active, start, onStart }: StubOptions) {
  const sessionsById = new Map([
    ["sesion-nueva", emptySession],
    ["sesion-existente", existingSession],
    ["plan-sesion-nueva", planSession],
  ]);
  stubFetch((url, init) => {
    if (url === "/api/auth/get-session") {
      return { status: 200, body: verifiedSession };
    }
    if (url.startsWith("/api/dashboard")) {
      const exerciseId = new URL(url, "http://test.local").searchParams.get("exerciseId");
      const fixture =
        typeof dashboard === "function" ? dashboard(exerciseId) : dashboard ?? emptyDashboard;
      return { status: 200, body: fixture };
    }
    if (url === "/api/sessions/active") {
      const current = typeof active === "function" ? active() : active ?? null;
      return { status: 200, body: { session: current } };
    }
    if (url === "/api/sessions" && (init.method ?? "GET") === "POST") {
      onStart?.(JSON.parse(String(init.body)));
      return start ?? { status: 201, body: { session: emptySession } };
    }
    const sessionMatch = url.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const session = sessionsById.get(sessionMatch[1]!);
      if (session) {
        return { status: 200, body: { session } };
      }
    }
    if (url === "/api/health") {
      return { status: 200, body: { status: "ok", database: "ready" } };
    }
    if (url.startsWith("/api/exercises")) {
      return { status: 200, body: { items: [], nextCursor: null } };
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "no" } } };
  });
}

describe("primer bloque de Inicio: entrenamiento actual", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("muestra la mini vista semanal en lugar de iniciar una Sesión libre", async () => {
    stubHome({ dashboard: { ...emptyDashboard, activePlan: activePlanFixture } });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Semana actual" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Semana 1" })).toBeInTheDocument();
    expect(screen.getByText("Día de empuje")).toBeInTheDocument();
    expect(screen.getByText("Día de tirón")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar Sesión libre" })).not.toBeInTheDocument();
  });

  test("prioriza Continuar cuando existe una Sesión activa", async () => {
    stubHome({
      dashboard: {
        ...emptyDashboard,
        training: {
          kind: "continuar",
          sessionId: existingSession.id,
          name: "Sesión libre",
          progress: { completadas: 2, total: 5 },
        },
      },
      active: existingSession,
      start: { status: 409, body: { error: { code: "ACTIVE_SESSION_EXISTS", message: "no" } } },
    });
    render(<App />);

    const continuar = (await screen.findAllByRole("link", { name: "Continuar" })).at(-1)!;
    expect(continuar).toHaveAttribute("href", `/sesion/${existingSession.id}`);
    expect(screen.getByText("2 de 5 series completadas")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Iniciar Sesión libre" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar" })).not.toBeInTheDocument();
  });

  test("ofrece Iniciar para el próximo Entrenamiento planificado pendiente y lo inicia", async () => {
    const postBodies: unknown[] = [];
    stubHome({
      dashboard: {
        ...emptyDashboard,
        training: {
          kind: "iniciar-plan",
          planId: "plan-1",
          trainingId: "training-1",
          planName: "Ciclo base",
          name: "Día de empuje",
          plannedDate: "2025-03-10",
          day: 0,
        },
      },
      start: { status: 201, body: { session: planSession } },
      onStart: (body) => postBodies.push(body),
    });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("Día de empuje")).toBeInTheDocument();
    expect(screen.getByText("Ciclo base")).toBeInTheDocument();
    const iniciar = screen.getByRole("button", { name: "Iniciar" });
    await user.click(iniciar);

    await waitFor(() =>
      expect(window.location.pathname).toBe("/sesion/plan-sesion-nueva"),
    );
    expect(postBodies).toEqual([
      { origin: "plan", planId: "plan-1", trainingId: "training-1" },
    ]);
    expect(await screen.findByRole("heading", { name: "Sesión activa" })).toBeInTheDocument();
  });
});

describe("segundo bloque de Inicio: Plan activo", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("muestra nombre, semana actual, realizados, omitidos y barras con enlace al detalle", async () => {
    stubHome({
      dashboard: { ...emptyDashboard, activePlan: activePlanFixture },
    });
    render(<App />);

    const planRegion = await screen.findByRole("region", { name: "Plan activo" });
    expect(within(planRegion).getByText("Ciclo base")).toBeInTheDocument();
    expect(within(planRegion).getByText("Semana 1 de 2")).toBeInTheDocument();
    expect(within(planRegion).getByText("1 realizado · 1 omitido · 2 pendientes")).toBeInTheDocument();
    expect(
      within(planRegion).getByText(
        "El progreso cuenta entrenamientos realizados u omitidos. El cumplimiento solo cuenta los realizados.",
      ),
    ).toBeInTheDocument();

    const entrenamientosConResultado = within(planRegion).getByRole("progressbar", {
      name: "Entrenamientos con resultado: 50 % · Realizadas u omitidas",
    });
    expect(entrenamientosConResultado).toHaveAttribute("aria-valuenow", "50");
    const entrenamientosRealizados = within(planRegion).getByRole("progressbar", {
      name: "Entrenamientos realizados: 25 % · Completadas de las previstas",
    });
    expect(entrenamientosRealizados).toHaveAttribute("aria-valuenow", "25");

    const detail = within(planRegion).getByRole("link", { name: /Ver Plan/ });
    expect(detail).toHaveAttribute("href", "/planes/plan-1");
  });

  test("sin Plan activo ofrece estado vacío con acción", async () => {
    stubHome({ dashboard: emptyDashboard });
    render(<App />);

    const planRegion = await screen.findByRole("region", { name: "Plan activo" });
    expect(
      within(planRegion).getByText(/Aún no tienes un Plan activo/),
    ).toBeInTheDocument();
    const action = within(planRegion).getByRole("link", { name: "Ir a Planes" });
    expect(action).toHaveAttribute("href", "/planes");
  });
});

describe("tercer bloque de Inicio: volumen semanal", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("muestra total, comparación y barras de las últimas seis semanas con alternativa textual", async () => {
    stubHome({
      dashboard: { ...emptyDashboard, weeklyVolume: volumeFixture },
    });
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Volumen semanal" }),
    ).toBeInTheDocument();
    expect(screen.getByText("12.400")).toBeInTheDocument();
    expect(screen.getByText("kg·rep")).toBeInTheDocument();
    expect(
      screen.getByText("+8,8 % frente a la semana anterior"),
    ).toBeInTheDocument();

    const chart = screen.getByRole("img", {
      name: /Volumen de las últimas seis semanas.*Actual 12\.400/,
    });
    expect(chart).toHaveAccessibleName(/S-5 1200.*S-1 11\.400/);
  });

  test("sin volumen no dibuja gráfica y ofrece estado vacío con acción", async () => {
    stubHome({ dashboard: emptyDashboard });
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Volumen semanal" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Aún no hay volumen semanal/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const action = screen.getByRole("link", { name: "Ver tu Historial" });
    expect(action).toHaveAttribute("href", "/historial");
  });
});

describe("cuarto bloque de Inicio: RM recientes", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("muestra hasta tres marcas con Ejercicio, carga, repeticiones y fecha", async () => {
    stubHome({
      dashboard: { ...emptyDashboard, recentRecordedMaxes: recentMaxesFixture },
    });
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "RM recientes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sentadilla")).toBeInTheDocument();
    expect(screen.getByText("120 kg × 1 rep · 01/03/2025")).toBeInTheDocument();
    expect(screen.getByText("Press de banca con barra")).toBeInTheDocument();
    expect(screen.getByText("85 kg × 3 rep · 20/02/2025")).toBeInTheDocument();
    expect(screen.getByText("Peso muerto")).toBeInTheDocument();
    expect(screen.getByText("150 kg × 1 rep · 10/02/2025")).toBeInTheDocument();
  });

  test("sin marcas ofrece estado vacío con acción", async () => {
    stubHome({ dashboard: emptyDashboard });
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "RM recientes" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Aún no has registrado/)).toBeInTheDocument();
    const action = screen.getByRole("link", { name: "Registrar un RM" });
    expect(action).toHaveAttribute("href", "/ejercicios");
  });
});

describe("presentación responsive de Inicio", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("prioriza la Sesión en curso y conserva la jerarquía del resto de Inicio", async () => {
    stubHome({ dashboard: fullDashboard });
    render(<App />);

    const training = await screen.findByRole("region", { name: "Entrenamiento actual" });
    const plan = screen.getByRole("region", { name: "Plan activo" });
    expect(training.compareDocumentPosition(plan)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    const analyticsRow = screen.getByRole("region", {
      name: "Volumen y RM recientes",
    });
    expect(
      within(analyticsRow).getByRole("region", { name: "Volumen semanal" }),
    ).toBeInTheDocument();
    expect(
      within(analyticsRow).getByRole("region", { name: "RM recientes" }),
    ).toBeInTheDocument();

    // El recorrido vertical conserva el orden acordado: Sesión prioritaria,
    // Plan activo y analítica.
    expect(training.compareDocumentPosition(analyticsRow)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(plan.compareDocumentPosition(analyticsRow)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByRole("region", { name: "Evolución" })).not.toBeInTheDocument();
  });
});
