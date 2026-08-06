import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import { PageIntro } from "../../../shared/ui/PageIntro";
import {
  activeSessionQueryKey,
  getActiveSession,
  startSession,
} from "../../sessions/api/sessions-api";
import { dashboardQueryKeyFor, getDashboard } from "../api/dashboard-api";
import { ActivePlanBlock } from "../components/ActivePlanBlock";
import { RecentMaxesBlock } from "../components/RecentMaxesBlock";
import { TrainingBlock } from "../components/TrainingBlock";
import { WeeklyVolumeBlock } from "../components/WeeklyVolumeBlock";
import styles from "./HomePage.module.css";

/**
 * Inicio: el recorrido vertical de los cuatro bloques acordados (spec
 * «Inicio, navegación y presentación adaptable») consumiendo el contrato de
 * `GET /api/dashboard` (ticket 33). La página es la única dueña de la lectura
 * única y de las acciones de iniciar Sesión; los bloques presentan datos ya
 * agregados por la API sin recalcular reglas de dominio.
 */
export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dashboard = useQuery({
    queryKey: dashboardQueryKeyFor(null),
    queryFn: () => getDashboard(),
    retry: false,
    placeholderData: (previousData) => previousData,
  });

  const startMutation = useMutation({
    mutationFn: startSession,
    onSuccess: ({ session }) => {
      void queryClient.setQueryData(activeSessionQueryKey, { session });
      // La nueva Sesión activa cambia la lectura de Inicio (spec «API y
      // concurrencia»: las mutaciones invalidan ampliamente Inicio).
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/sesion/${session.id}`);
    },
    onError: async (error) => {
      if (error instanceof ApiRequestError && error.code === "ACTIVE_SESSION_EXISTS") {
        // La Cuenta ya tiene una Sesión activa: se abre la existente.
        try {
          // Lectura directa: la caché puede conservar la ausencia previa
          // dentro de su ventana de frescura.
          const current = await getActiveSession();
          void queryClient.setQueryData(activeSessionQueryKey, current);
          if (current.session) {
            navigate(`/sesion/${current.session.id}`);
          }
        } catch {
          // sin conexión: el mensaje de error de la acción queda visible
        }
      }
    },
  });

  return (
    <>
      <PageIntro
        eyebrow="Tu entrenamiento"
        title="Inicio"
        description="Todo preparado para decidir qué entrenar hoy."
      />

      <div className={styles.blocks}>
        {dashboard.isPending && <p className={styles.status}>Cargando tu Inicio…</p>}

        {dashboard.isError && (
          <p className={styles.error} role="alert">
            No se pudo cargar tu Inicio. Inténtalo de nuevo.
            <button type="button" onClick={() => void dashboard.refetch()}>
              Reintentar
            </button>
          </p>
        )}

        {dashboard.isSuccess && (
          <>
            {/* Una Sesión en curso es la acción prioritaria de Inicio y queda
                justo debajo de la cabecera. Cuando no la hay, el bloque
                ofrece iniciar el próximo Entrenamiento junto al Plan activo. */}
            {dashboard.data.training.kind === "continuar" && (
              <div className={styles.priorityBlock}>
                <TrainingBlock
                  training={dashboard.data.training}
                  activePlan={dashboard.data.activePlan}
                  isStarting={startMutation.isPending}
                  startError={startMutation.isError}
                  onStartPlan={(planId, trainingId) =>
                    startMutation.mutate({ origin: "plan", planId, trainingId })
                  }
                />
              </div>
            )}
            <div
              className={
                dashboard.data.training.kind === "continuar" ? styles.planRow : styles.topRow
              }
            >
              {dashboard.data.training.kind !== "continuar" && (
                <TrainingBlock
                  training={dashboard.data.training}
                  activePlan={dashboard.data.activePlan}
                  isStarting={startMutation.isPending}
                  startError={startMutation.isError}
                  onStartPlan={(planId, trainingId) =>
                    startMutation.mutate({ origin: "plan", planId, trainingId })
                  }
                />
              )}
              <ActivePlanBlock plan={dashboard.data.activePlan} />
            </div>
            <section className={styles.analyticsRow} aria-label="Volumen y RM recientes">
              <WeeklyVolumeBlock volume={dashboard.data.weeklyVolume} />
              <RecentMaxesBlock recordedMaxes={dashboard.data.recentRecordedMaxes} />
            </section>
          </>
        )}
      </div>
    </>
  );
}
