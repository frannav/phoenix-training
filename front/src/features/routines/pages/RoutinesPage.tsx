import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PageIntro } from "../../../shared/ui/PageIntro";
import {
  archiveRoutine,
  listRoutines,
  restoreRoutine,
  type RoutineItem,
} from "../api/routines-api";
import styles from "./RoutinesPage.module.css";

function routineSummary(routine: RoutineItem): string {
  const exerciseCount = routine.exercises.length;
  const seriesCount = routine.exercises.reduce(
    (total, entry) => total + entry.series.length,
    0,
  );
  if (exerciseCount === 0) {
    return "Sin Ejercicios";
  }
  return `${exerciseCount} ${exerciseCount === 1 ? "Ejercicio" : "Ejercicios"} · ${seriesCount} ${seriesCount === 1 ? "Serie" : "Series"}`;
}

export function RoutinesPage() {
  const queryClient = useQueryClient();
  const [archiveTarget, setArchiveTarget] = useState<RoutineItem | null>(null);

  const routinesQuery = useQuery({
    queryKey: ["routines"],
    queryFn: listRoutines,
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["routines"] });
  };

  const archiveMutation = useMutation({
    mutationFn: archiveRoutine,
    onSuccess: () => {
      setArchiveTarget(null);
      refresh();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restoreRoutine,
    onSuccess: () => {
      refresh();
    },
  });

  const available = (routinesQuery.data?.items ?? []).filter((routine) => !routine.archived);
  const archived = (routinesQuery.data?.items ?? []).filter((routine) => routine.archived);

  return (
    <>
      <PageIntro
        eyebrow="Organizar"
        title="Rutinas"
        description="Crea estructuras de entrenamiento reutilizables y gestiona cuáles se ofrecen para nuevos entrenamientos."
      />

      <section className={styles.management} aria-label="Gestionar Rutinas">
        <Link className={styles.newRoutine} to="/rutinas/nueva">
          Nueva Rutina
        </Link>

        {archiveTarget && (
          <div
            className={styles.dialogBackdrop}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmar-archivo-rutina-titulo"
            aria-describedby="confirmar-archivo-rutina-descripcion"
          >
            <div className={styles.dialog}>
              <h2 id="confirmar-archivo-rutina-titulo">Archivar «{archiveTarget.name}»</h2>
              <p id="confirmar-archivo-rutina-descripcion">
                La Rutina dejará de ofrecerse para nuevos entrenamientos, pero conservará
                su identidad y contenido y podrás restaurarla cuando quieras.
              </p>
              <div className={styles.dialogActions}>
                <button
                  className={styles.dialogDanger}
                  type="button"
                  onClick={() => archiveMutation.mutate(archiveTarget.id)}
                  disabled={archiveMutation.isPending}
                >
                  {archiveMutation.isPending ? "Archivando…" : "Archivar"}
                </button>
                <button
                  className={styles.dialogCancel}
                  type="button"
                  onClick={() => setArchiveTarget(null)}
                  disabled={archiveMutation.isPending}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className={styles.results} aria-labelledby="rutinas-disponibles-titulo" aria-busy={routinesQuery.isPending}>
        <h2 id="rutinas-disponibles-titulo" className={styles.sectionHeading}>
          Tus Rutinas
        </h2>

        {routinesQuery.isPending && <p className={styles.status}>Cargando Rutinas…</p>}

        {routinesQuery.isError && (
          <p className={styles.error} role="alert">
            No se pudieron cargar las Rutinas. Inténtalo de nuevo.
          </p>
        )}

        {routinesQuery.isSuccess && available.length === 0 && (
          <div className={styles.emptyState}>
            <p>
              {archived.length > 0
                ? "No tienes Rutinas disponibles para nuevos entrenamientos."
                : "Todavía no has creado ninguna Rutina. Crea una para reutilizar tu estructura de entrenamiento."}
            </p>
            {archived.length === 0 && (
              <Link className={styles.emptyAction} to="/rutinas/nueva">
                Crear la primera Rutina
              </Link>
            )}
          </div>
        )}

        {available.length > 0 && (
          <ul className={styles.list}>
            {available.map((routine) => (
              <li key={routine.id} className={styles.item}>
                <Link className={styles.itemLink} to={`/rutinas/${routine.id}`}>
                  <span className={styles.itemName}>{routine.name}</span>
                  <span className={styles.itemMeta}>{routineSummary(routine)}</span>
                </Link>
                <div className={styles.itemActions}>
                  <Link className={styles.viewLink} to={`/rutinas/${routine.id}`}>
                    Ver
                  </Link>
                  <button
                    type="button"
                    aria-label={`Archivar ${routine.name}`}
                    onClick={() => setArchiveTarget(routine)}
                  >
                    Archivar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.archivedSection} aria-labelledby="rutinas-archivadas-titulo">
        <h2 id="rutinas-archivadas-titulo" className={styles.sectionHeading}>
          Rutinas archivadas
        </h2>
        {routinesQuery.isSuccess && archived.length === 0 && (
          <p className={styles.archivedEmpty}>
            No tienes Rutinas archivadas.
          </p>
        )}
        {archived.length > 0 && (
          <ul className={styles.archivedList}>
            {archived.map((routine) => (
              <li key={routine.id} className={styles.archivedItem}>
                <span className={styles.archivedName}>{routine.name}</span>
                <span className={styles.archivedMeta}>{routineSummary(routine)}</span>
                <button
                  className={styles.restoreButton}
                  type="button"
                  onClick={() => restoreMutation.mutate(routine.id)}
                  disabled={restoreMutation.isPending}
                >
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
