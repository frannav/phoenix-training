import type { DashboardResponse } from "../features/dashboard/api/dashboard-api";

/**
 * Dashboard de Inicio sin datos: todos los bloques en su estado vacío. Lo
 * comparten los tests que montan la aplicación en `/` (App, AppShell y
 * HomePage) para no duplicar el contrato vacío en cada archivo.
 */
export const emptyDashboard: DashboardResponse = {
  training: { kind: "iniciar-libre" },
  activePlan: null,
  weeklyVolume: {
    currentWeekStart: "2025-03-10",
    currentTotal: 0,
    previousTotal: 0,
    changePercent: null,
    weeks: [
      { weekStart: "2025-02-03", total: 0 },
      { weekStart: "2025-02-10", total: 0 },
      { weekStart: "2025-02-17", total: 0 },
      { weekStart: "2025-02-24", total: 0 },
      { weekStart: "2025-03-03", total: 0 },
      { weekStart: "2025-03-10", total: 0 },
    ],
  },
  recentRecordedMaxes: [],
  evolution: { options: [], current: null },
};
