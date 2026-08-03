import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import { PageIntro } from "../../../shared/ui/PageIntro";
import {
  activeSessionQueryKey,
  getActiveSession,
  sessionProgressLabel,
  sessionTitle,
  startFreeSession,
} from "../../sessions/api/sessions-api";
import { getSystemHealth } from "../api/get-system-health";
import styles from "./HomePage.module.css";

export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const health = useQuery({
    queryKey: ["system", "health"],
    queryFn: getSystemHealth,
    retry: false,
  });

  const activeSession = useQuery({
    queryKey: activeSessionQueryKey,
    queryFn: getActiveSession,
    retry: false,
  });

  const startMutation = useMutation({
    mutationFn: startFreeSession,
    onSuccess: ({ session }) => {
      void queryClient.setQueryData(activeSessionQueryKey, { session });
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
          // sin conexión: el mensaje de error de abajo queda visible
        }
      }
    },
  });

  const session = activeSession.data?.session ?? null;

  return (
    <>
      <PageIntro
        eyebrow="Tu entrenamiento"
        title="Inicio"
        description="Todo preparado para decidir qué entrenar hoy."
      />

      <section className={styles.trainingBlock} aria-labelledby="entrenamiento-actual">
        <h2 className={styles.trainingTitle} id="entrenamiento-actual">
          Entrenamiento actual
        </h2>

        {activeSession.isPending && (
          <p className={styles.trainingStatus}>Comprobando tu entrenamiento…</p>
        )}

        {!activeSession.isPending && session && (
          <div className={styles.activeSessionCard}>
            <span className={styles.activeSessionName}>{sessionTitle(session)}</span>
            <span className={styles.activeSessionProgress}>
              {sessionProgressLabel(session)}
            </span>
            <Link className={styles.continueButton} to={`/sesion/${session.id}`}>
              Continuar
            </Link>
          </div>
        )}

        {!activeSession.isPending && !session && (
          <div className={styles.freeSessionCard}>
            <p className={styles.freeSessionTitle}>Sesión libre</p>
            <p className={styles.freeSessionText}>
              Empieza a registrar sin Rutina ni Plan previo.
            </p>
            <button
              className={styles.startButton}
              type="button"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? "Iniciando…" : "Iniciar Sesión libre"}
            </button>
            {startMutation.isError && (
              <p className={styles.startError} role="alert">
                No se pudo iniciar la Sesión. Inténtalo de nuevo.
              </p>
            )}
          </div>
        )}
      </section>

      <p className={styles.status} role="status">
        {health.isPending && "Conectando con el servidor…"}
        {health.isSuccess && "Aplicación conectada"}
        {health.isError && "No se pudo conectar con el servidor"}
      </p>
    </>
  );
}
