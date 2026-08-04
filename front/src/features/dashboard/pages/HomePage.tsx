import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { EvolutionBlock } from "../components/EvolutionBlock";
import { RecentMaxesBlock } from "../components/RecentMaxesBlock";
import { TrainingBlock } from "../components/TrainingBlock";
import { WeeklyVolumeBlock } from "../components/WeeklyVolumeBlock";
import styles from "./HomePage.module.css";

/**
 * Inicio: el recorrido vertical de los cinco bloques acordados (spec
 * «Inicio, navegación y presentación adaptable») consumiendo el contrato de
 * `GET /api/dashboard` (ticket 33). La página es la única dueña de la lectura
 * única y de las acciones de iniciar Sesión; los bloques presentan datos ya
 * agregados por la API sin recalcular reglas de dominio.
 */
export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  const dashboard = useQuery({
    // El Ejercicio elegido del bloque «Evolución» viaja en la consulta de la
    // lectura única; mientras se refresca se conserva la lectura anterior.
    queryKey: dashboardQueryKeyFor(selectedExerciseId),
    queryFn: () => getDashboard(selectedExerciseId ?? undefined),
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
            {/* En escritorio entrenamiento y Plan comparten la primera fila;
                volumen y RM recientes la segunda; la evolución ocupa el
                ancho inferior (ticket 07). En móvil todas son filas de una
                sola columna en el mismo orden. */}
            <section className={styles.topRow} aria-label="Entrenamiento y Plan">
              <TrainingBlock
                training={dashboard.data.training}
                isStarting={startMutation.isPending}
                startError={startMutation.isError}
                onStartFree={() => startMutation.mutate({ origin: "libre" })}
                onStartPlan={(planId, trainingId) =>
                  startMutation.mutate({ origin: "plan", planId, trainingId })
                }
              />
              <ActivePlanBlock plan={dashboard.data.activePlan} />
            </section>
            <section className={styles.analyticsRow} aria-label="Volumen y RM recientes">
              <WeeklyVolumeBlock volume={dashboard.data.weeklyVolume} />
              <RecentMaxesBlock recordedMaxes={dashboard.data.recentRecordedMaxes} />
            </section>
            <EvolutionBlock
              options={dashboard.data.evolution.options}
              current={dashboard.data.evolution.current}
              onSelectExercise={setSelectedExerciseId}
            />
          </>
        )}
      </div>
    </>
  );
}
