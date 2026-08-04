import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { getRoutine, restoreRoutine } from "../api/routines-api";
import { useStartSession } from "../../sessions/api/use-start-session";
import { RoutineEditor } from "../components/RoutineEditor";
import styles from "./RoutinesPage.module.css";

export function RoutineDetailPage() {
  const { rutinaId } = useParams<{ rutinaId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [revision, setRevision] = useState(0);

  const routineQuery = useQuery({
    queryKey: ["routine", rutinaId],
    queryFn: () => getRoutine(rutinaId ?? ""),
    retry: false,
  });

  const restoreMutation = useMutation({
    mutationFn: restoreRoutine,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["routines"] });
      void routineQuery.refetch();
    },
  });

  const startMutation = useStartSession();

  if (routineQuery.isPending) {
    return <p className={styles.status}>Cargando la Rutina…</p>;
  }

  if (routineQuery.isError) {
    return (
      <p className={styles.error} role="alert">
        La Rutina solicitada no existe o no se pudo cargar.
      </p>
    );
  }

  const routine = routineQuery.data.routine;

  const reloadCurrent = () => {
    // remonta el editor con el documento vigente para no mezclar cambios
    setRevision((previous) => previous + 1);
    void routineQuery.refetch();
  };

  return (
    <>
      <PageIntro
        eyebrow="Rutinas"
        title={routine.name}
        description="Consulta o modifica esta estructura reutilizable. La edición sustituye el agregado completo."
      />

      {routine.archived && (
        <p className={styles.archivedBanner} role="status">
          Esta Rutina está archivada: no se ofrece para nuevos entrenamientos.
          <button
            className={styles.restoreButton}
            type="button"
            onClick={() => restoreMutation.mutate(routine.id)}
            disabled={restoreMutation.isPending}
          >
            Restaurar
          </button>
        </p>
      )}

      {!routine.archived && (
        <section className={styles.startCard} aria-labelledby="iniciar-sesion-titulo">
          <div className={styles.startCopy}>
            <h2 id="iniciar-sesion-titulo" className={styles.startTitle}>
              Iniciar una Sesión
            </h2>
            <p className={styles.startText}>
              Empieza ahora con los Ejercicios y Objetivos vigentes de esta Rutina.
              La Sesión copia el contenido y no vuelve a sincronizarse con la Rutina.
            </p>
          </div>
          <button
            className={styles.startButton}
            type="button"
            onClick={() => startMutation.mutate({ origin: "rutina", routineId: routine.id })}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? "Iniciando…" : "Iniciar"}
          </button>
          {startMutation.isError && (
            <p className={styles.startError} role="alert">
              {startMutation.error instanceof ApiRequestError
                ? startMutation.error.message
                : "No se pudo iniciar la Sesión. Inténtalo de nuevo."}
            </p>
          )}
        </section>
      )}

      <RoutineEditor
        key={`${routine.id}-${routine.revision}-${revision}`}
        routine={routine}
        submitLabel="Guardar cambios"
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["routines"] });
          navigate("/rutinas");
        }}
        onCancel={() => navigate("/rutinas")}
        onConflict={reloadCurrent}
      />
    </>
  );
}
