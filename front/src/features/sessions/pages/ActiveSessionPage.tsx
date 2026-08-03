import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import {
  listExercises,
  recordingModeLabels,
  type ExerciseItem,
} from "../../exercises/api/exercises-api";
import {
  activeSessionQueryKey,
  getSession,
  saveSession,
  sessionDetailQueryKey,
  sessionProgressLabel,
  sessionTitle,
  type SessionDocument,
  type SessionExerciseInput,
} from "../api/sessions-api";
import styles from "./ActiveSessionPage.module.css";

type SaveState = "saved" | "saving" | "error";

function occurrenceIdFor(
  session: SessionDocument,
  exerciseId: string | null,
): string | null {
  if (!exerciseId) {
    return null;
  }
  const matches = session.exercises.filter((entry) => entry.exerciseId === exerciseId);
  return matches.length > 0 ? matches[matches.length - 1]!.id : null;
}

/**
 * Pantalla completa de la Sesión activa. Ocupa toda la ventana sin la
 * navegación del AppShell y mantiene su propia cabecera con el Origen de
 * sesión y el estado de guardado. Una Sesión vacía abre de inmediato el
 * selector combinado de Ejercicios para añadir el primero; al reanudar se
 * abre el último Ejercicio confirmado.
 */
export function ActiveSessionPage() {
  const { sesionId } = useParams<{ sesionId: string }>();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionDocument | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<SessionExerciseInput[] | null>(null);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const sessionQuery = useQuery({
    queryKey: sessionDetailQueryKey(sesionId ?? ""),
    queryFn: () => getSession(sesionId ?? ""),
    retry: false,
  });

  useEffect(() => {
    const loaded = sessionQuery.data?.session;
    if (loaded) {
      setSession(loaded);
      setExpandedId(occurrenceIdFor(loaded, loaded.lastExerciseId));
      setPickerOpen(loaded.exercises.length === 0);
    }
  }, [sessionQuery.data]);

  const exercisesQuery = useQuery({
    queryKey: ["sessions", "picker", { q }],
    queryFn: () => listExercises({ q, limit: 50 }),
    retry: false,
    enabled: pickerOpen,
  });

  const persist = async (exercises: SessionExerciseInput[]) => {
    if (!session) {
      return;
    }
    setSaveState("saving");
    setSaveError(null);
    setRetryTarget(exercises);
    try {
      const { session: next } = await saveSession(session.id, session.revision, exercises);
      setSession(next);
      setSaveState("saved");
      setPickerOpen(false);
      setExpandedId(occurrenceIdFor(next, next.lastExerciseId));
      void queryClient.setQueryData(activeSessionQueryKey, { session: next });
    } catch (error) {
      setSaveState("error");
      if (error instanceof ApiRequestError && error.code === "REVISION_CONFLICT") {
        // Conflicto recuperable: otra pestaña guardó. Se carga la versión
        // vigente sin mezclar cambios y no se reintenta la misma mutación.
        setSaveError("La Sesión cambió en otra pestaña. Se cargó la versión vigente.");
        setRetryTarget(null);
        try {
          // Lectura directa: la caché puede conservar el documento obsoleto
          // dentro de su ventana de frescura.
          const fresh = await getSession(session.id);
          void queryClient.setQueryData(sessionDetailQueryKey(session.id), fresh);
          setSession(fresh.session);
          setExpandedId(occurrenceIdFor(fresh.session, fresh.session.lastExerciseId));
        } catch {
          // la versión vigente no pudo cargarse: se conserva la mostrada
        }
      } else {
        setSaveError("No se pudo guardar. Inténtalo de nuevo.");
      }
    }
  };

  const addExercise = (exercise: ExerciseItem) => {
    if (!session) {
      return;
    }
    void persist([...session.exercises, { exerciseId: exercise.id }]);
  };

  const retrySave = () => {
    if (retryTarget) {
      void persist(retryTarget);
    }
  };

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setQ(search.trim());
  };

  const toggleExercise = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  const loading = sessionQuery.isPending && session === null;
  const failed =
    (sessionQuery.isError || (sessionQuery.isSuccess && session === null)) && !loading;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link className={styles.backLink} to="/">
            ← Volver a Inicio
          </Link>
          <div className={styles.saveStateGroup}>
            <span className={styles.saveState} role="status" data-state={saveState}>
              <span aria-hidden="true" className={styles.saveStateIcon}>
                {saveState === "saving" ? "⟳" : saveState === "error" ? "⚠" : "✓"}
              </span>
              {saveState === "saving"
                ? "Guardando…"
                : saveState === "error"
                  ? "Error al guardar"
                  : "Guardado"}
            </span>
            {saveState === "error" && retryTarget && (
              <button
                className={styles.retryButton}
                type="button"
                onClick={retrySave}
              >
                Reintentar
              </button>
            )}
          </div>
        </div>
        <h1 className={styles.title}>Sesión activa</h1>
        <p className={styles.origin}>{session ? sessionTitle(session) : "Sesión libre"}</p>
      </header>

      <main className={styles.content}>
        {loading && <p className={styles.status}>Cargando Sesión…</p>}

        {failed && (
          <section className={styles.failure} aria-live="polite">
            <h2>No se pudo cargar la Sesión</h2>
            <p>Comprueba tu conexión y vuelve a intentarlo.</p>
            <Link className={styles.backLink} to="/">
              Volver a Inicio
            </Link>
          </section>
        )}

        {!loading && !failed && session && (
          <>
            <p className={styles.progress} role="status">
              {sessionProgressLabel(session)}
            </p>

            {session.exercises.length === 0 && (
              <p className={styles.emptyHint}>
                Añade tu primer Ejercicio para empezar a registrar.
              </p>
            )}

            {pickerOpen && (
              <section
                className={styles.picker}
                aria-label="Añadir Ejercicio a la Sesión"
              >
                <h2 className={styles.pickerTitle}>Añadir Ejercicio</h2>
                <form className={styles.searchForm} onSubmit={applySearch} role="search">
                  <label className={styles.visuallyHidden} htmlFor="sesion-busqueda">
                    Buscar Ejercicio por nombre
                  </label>
                  <input
                    id="sesion-busqueda"
                    className={styles.searchInput}
                    type="search"
                    placeholder="Buscar por nombre (p. ej. «press»)"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <button className={styles.searchButton} type="submit">
                    Buscar
                  </button>
                </form>

                {exercisesQuery.isPending && (
                  <p className={styles.status}>Cargando Ejercicios…</p>
                )}
                {exercisesQuery.isError && (
                  <p className={styles.error} role="alert">
                    No se pudieron cargar los Ejercicios. Inténtalo de nuevo.
                  </p>
                )}
                {exercisesQuery.isSuccess && exercisesQuery.data.items.length === 0 && (
                  <p className={styles.error} role="alert">
                    Ningún Ejercicio coincide con la búsqueda.
                  </p>
                )}
                {exercisesQuery.isSuccess && exercisesQuery.data.items.length > 0 && (
                  <ul className={styles.pickerList}>
                    {exercisesQuery.data.items.map((item) => (
                      <li key={item.id}>
                        <button
                          className={styles.pickerItem}
                          type="button"
                          onClick={() => addExercise(item)}
                        >
                          <span className={styles.pickerName}>{item.name}</span>
                          <span className={styles.pickerMeta}>
                            <span
                              className={styles.provenance}
                              data-provenance={item.provenance}
                            >
                              {item.provenance === "personalizado"
                                ? "Personalizado"
                                : "Catálogo"}
                            </span>
                            {recordingModeLabels[item.recordingMode]}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {session.exercises.length > 0 && (
              <ul className={styles.exerciseList} aria-label="Ejercicios de la Sesión">
                {session.exercises.map((occurrence) => (
                  <li key={occurrence.id} className={styles.exerciseItem}>
                    <button
                      className={styles.exerciseButton}
                      type="button"
                      aria-expanded={expandedId === occurrence.id}
                      onClick={() => toggleExercise(occurrence.id)}
                    >
                      <span className={styles.exerciseName}>
                        {occurrence.exercise.name}
                      </span>
                      <span className={styles.exerciseMeta}>
                        {occurrence.exercise.provenance === "personalizado"
                          ? "Personalizado"
                          : "Catálogo"}{" "}
                        · {recordingModeLabels[occurrence.exercise.recordingMode]}
                      </span>
                    </button>
                    {expandedId === occurrence.id && (
                      <div className={styles.exerciseDetails}>
                        {session.lastExerciseId === occurrence.exerciseId && (
                          <p className={styles.lastUsed}>Último Ejercicio utilizado</p>
                        )}
                        <p className={styles.detailsNote}>
                          Forma de registro:{" "}
                          {recordingModeLabels[occurrence.exercise.recordingMode]}.
                          Las Series se registrarán aquí.
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!pickerOpen && session.exercises.length > 0 && (
              <button
                className={styles.addExercise}
                type="button"
                onClick={() => setPickerOpen(true)}
              >
                Añadir ejercicio
              </button>
            )}
          </>
        )}

        {saveError && (
          <p className={styles.saveError} role="alert">
            {saveError}
          </p>
        )}
      </main>
    </div>
  );
}
