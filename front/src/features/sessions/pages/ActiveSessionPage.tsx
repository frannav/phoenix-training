import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import {
  listExercises,
  recordingModeLabels,
  type ExerciseItem,
} from "../../exercises/api/exercises-api";
import {
  activeSessionQueryKey,
  deleteSession,
  finalizeSession,
  getSession,
  occurrenceProgressLabel,
  saveSession,
  sessionDetailQueryKey,
  sessionProgressLabel,
  sessionSeriesSummary,
  sessionTitle,
  type SessionDocument,
  type SessionExerciseDocument,
  type SessionExerciseInput,
  type SessionSeriesDocument,
} from "../api/sessions-api";
import {
  draftFromMagnitudes,
  draftFromSeries,
  emptyDraft,
  resultFromDraft,
  rpeFromDraft,
  validateCompletion,
  type SeriesDraft,
} from "../series-draft";
import { SeriesRow } from "../components/SeriesRow";
import styles from "./ActiveSessionPage.module.css";

type SaveState = "saved" | "saving" | "error";

/** Confirmación destructiva pendiente: cada acción indica qué se perderá. */
type Confirmation =
  | { kind: "omit-completed"; occurrence: SessionExerciseDocument; series: SessionSeriesDocument }
  | { kind: "to-pending"; occurrence: SessionExerciseDocument; series: SessionSeriesDocument }
  | { kind: "delete-series"; occurrence: SessionExerciseDocument; series: SessionSeriesDocument }
  | { kind: "delete-exercise"; occurrence: SessionExerciseDocument }
  | { kind: "finalize"; pendingCount: number }
  | { kind: "delete-session" };

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

/** Borrador propuesto al añadir una Serie: los valores realmente hechos de la anterior, o sus Objetivos. */
function proposedDraftFrom(previous: SessionSeriesDocument): SeriesDraft {
  const source = previous.status === "completada" ? previous.result : previous.goal;
  return draftFromMagnitudes(source);
}

/** ¿La Serie o la aparición contienen algún Resultado confirmado? */
function seriesHasResult(series: SessionSeriesDocument): boolean {
  return (
    series.result.carga !== null ||
    series.result.repeticiones !== null ||
    series.result.duracion !== null
  );
}

/** Entrada canónica del agregado completo desde el documento confirmado. */
function toAggregateInput(session: SessionDocument): SessionExerciseInput[] {
  return session.exercises.map((occurrence) => ({
    id: occurrence.id,
    exerciseId: occurrence.exerciseId,
    series: occurrence.series.map((series) => ({
      id: series.id,
      status: series.status,
      goal: series.goal,
      result: series.result,
      rpe: series.rpe,
    })),
  }));
}

/**
 * Pantalla completa de la Sesión activa. Ocupa toda la ventana sin la
 * navegación del AppShell y mantiene su propia cabecera con el Origen de
 * sesión y el estado de guardado. Una Sesión vacía abre de inmediato el
 * selector combinado de Ejercicios; al reanudar se abre el último Ejercicio
 * confirmado y dentro de cada Ejercicio se registran las Series con sus
 * estados, validación y guardado inmediato.
 */
export function ActiveSessionPage() {
  const { sesionId } = useParams<{ sesionId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionDocument | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<SessionExerciseInput[] | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, SeriesDraft>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, Record<string, string>>>({});

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

  // Un borrador por Serie pendiente del documento confirmado, inicializado
  // desde sus Objetivos. Las entradas parciales solo viven aquí y se pierden
  // al recargar o al recuperar una versión vigente tras un conflicto.
  useEffect(() => {
    if (!session) {
      return;
    }
    setDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const occurrence of session.exercises) {
        for (const series of occurrence.series) {
          if (series.status !== "pendiente" || next[series.id] !== undefined) {
            continue;
          }
          next[series.id] = draftFromSeries(series);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [session]);

  const exercisesQuery = useQuery({
    queryKey: ["sessions", "picker", { q }],
    queryFn: () => listExercises({ q, limit: 50 }),
    retry: false,
    enabled: pickerOpen,
  });

  const persist = async (
    exercises: SessionExerciseInput[],
  ): Promise<SessionDocument | null> => {
    if (!session) {
      return null;
    }
    setSaveState("saving");
    setSaveError(null);
    setRetryTarget(exercises);
    try {
      const { session: next } = await saveSession(session.id, session.revision, exercises);
      setSession(next);
      setSaveState("saved");
      // La Sesión vacía vuelve a abrir el selector para añadir un Ejercicio;
      // con contenido, el selector se cierra tras cada acción confirmada.
      setPickerOpen(next.exercises.length === 0);
      // Se conserva el Ejercicio desplegado mientras siga en la Sesión: la
      // confirmación no interrumpe el registro en curso.
      setExpandedId((current) =>
        current !== null && next.exercises.some((entry) => entry.id === current)
          ? current
          : occurrenceIdFor(next, next.lastExerciseId),
      );
      void queryClient.setQueryData(activeSessionQueryKey, { session: next });
      return next;
    } catch (error) {
      setSaveState("error");
      if (error instanceof ApiRequestError && error.code === "REVISION_CONFLICT") {
        // Conflicto recuperable: otra pestaña guardó. Se carga la versión
        // vigente sin mezclar cambios, sin reintentar la misma mutación y
        // descartando los borradores parciales.
        setSaveError("La Sesión cambió en otra pestaña. Se cargó la versión vigente.");
        setRetryTarget(null);
        setFieldErrors({});
        setDrafts({});
        await reloadCurrentSession();
      } else {
        setSaveError("No se pudo guardar. Inténtalo de nuevo.");
      }
      return null;
    }
  };

  const completeSeries = (
    occurrence: SessionExerciseDocument,
    series: SessionSeriesDocument,
  ) => {
    if (!session) {
      return;
    }
    const mode = occurrence.exercise.recordingMode;
    const draft = drafts[series.id] ?? draftFromSeries(series);
    const errors = validateCompletion(mode, draft);
    if (Object.keys(errors).length > 0) {
      setFieldErrors((previous) => ({ ...previous, [series.id]: errors }));
      return;
    }
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[series.id];
      return next;
    });

    const exercises = toAggregateInput(session).map((entry) =>
      entry.id === occurrence.id
        ? {
            ...entry,
            series: entry.series.map((input) =>
              input.id === series.id
                ? {
                    id: series.id,
                    status: "completada" as const,
                    goal: input.goal,
                    result: resultFromDraft(mode, draft),
                    rpe: rpeFromDraft(draft),
                  }
                : input,
            ),
          }
        : entry,
    );
    void persist(exercises);
  };

  const omitSeries = (
    occurrence: SessionExerciseDocument,
    series: SessionSeriesDocument,
  ) => {
    if (!session) {
      return;
    }
    const exercises = toAggregateInput(session).map((entry) =>
      entry.id === occurrence.id
        ? {
            ...entry,
            series: entry.series.map((input) =>
              input.id === series.id
                ? { id: series.id, status: "omitida" as const, goal: input.goal, result: null, rpe: null }
                : input,
            ),
          }
        : entry,
    );
    void persist(exercises);
  };

  const restoreSeries = (
    occurrence: SessionExerciseDocument,
    series: SessionSeriesDocument,
  ) => {
    if (!session) {
      return;
    }
    const exercises = toAggregateInput(session).map((entry) =>
      entry.id === occurrence.id
        ? {
            ...entry,
            series: entry.series.map((input) =>
              input.id === series.id
                ? { id: series.id, status: "pendiente" as const, goal: input.goal, result: null, rpe: null }
                : input,
            ),
          }
        : entry,
    );
    void persist(exercises);
  };

  const removeSeries = (
    occurrence: SessionExerciseDocument,
    series: SessionSeriesDocument,
  ) => {
    if (!session) {
      return;
    }
    const exercises = toAggregateInput(session).map((entry) =>
      entry.id === occurrence.id
        ? { ...entry, series: entry.series.filter((input) => input.id !== series.id) }
        : entry,
    );
    void persist(exercises);
  };

  const removeExercise = (occurrence: SessionExerciseDocument) => {
    if (!session) {
      return;
    }
    const exercises = toAggregateInput(session).filter(
      (entry) => entry.id !== occurrence.id,
    );
    void persist(exercises);
  };

  const addSeries = async (occurrence: SessionExerciseDocument) => {
    if (!session) {
      return;
    }
    // «Añadir una Serie propone como borrador los valores de la Serie
    // anterior»: la Serie nueva nace pendiente sin perseguir esos valores y
    // el borrador se siembra en el navegador (se pierde al recargar). De una
    // Serie completada se proponen los valores realmente realizados
    // (Resultado); de una pendiente u omitida, sus Objetivos.
    const previous = occurrence.series[occurrence.series.length - 1];
    const proposed = previous === undefined ? emptyDraft() : proposedDraftFrom(previous);
    const exercises = toAggregateInput(session).map((entry) =>
      entry.id === occurrence.id
        ? {
            ...entry,
            series: [
              ...entry.series,
              { status: "pendiente" as const, goal: null, result: null },
            ],
          }
        : entry,
    );
    const next = await persist(exercises);
    if (next) {
      // El identificador de la Serie nueva lo asigna el servidor: tras la
      // respuesta se siembra su borrador con los valores propuestos.
      const updated = next.exercises.find((entry) => entry.id === occurrence.id);
      const created = updated?.series[updated.series.length - 1];
      if (created) {
        setDrafts((current) => ({ ...current, [created.id]: proposed }));
      }
    }
  };

  const addExercise = (exercise: ExerciseItem) => {
    if (!session) {
      return;
    }
    // Cardio continuo admite exactamente una Serie por aparición: añadir el
    // Ejercicio crea esa única Serie pendiente.
    const series =
      exercise.recordingMode === "cardio_continuo"
        ? [{ status: "pendiente" as const, goal: null, result: null }]
        : [];
    void persist([...toAggregateInput(session), { exerciseId: exercise.id, series }]);
  };

  const retrySave = () => {
    if (retryTarget) {
      void persist(retryTarget);
    }
  };

  /** Carga la versión vigente de la Sesión tras un conflicto o una transición ajena. */
  const reloadCurrentSession = async (): Promise<SessionDocument | null> => {
    if (!session) {
      return null;
    }
    try {
      // Lectura directa: la caché puede conservar el documento obsoleto
      // dentro de su ventana de frescura.
      const fresh = await getSession(session.id);
      void queryClient.setQueryData(sessionDetailQueryKey(session.id), fresh);
      setSession(fresh.session);
      setExpandedId(occurrenceIdFor(fresh.session, fresh.session.lastExerciseId));
      return fresh.session;
    } catch {
      return null;
    }
  };

  const requestFinalize = () => {
    if (!session) {
      return;
    }
    const allSeries = session.exercises.flatMap((occurrence) => occurrence.series);
    const pendingCount = allSeries.filter((series) => series.status === "pendiente").length;
    if (pendingCount > 0) {
      setConfirmation({ kind: "finalize", pendingCount });
      return;
    }
    void doFinalize();
  };

  const doFinalize = async () => {
    if (!session) {
      return;
    }
    setSaveState("saving");
    setSaveError(null);
    setRetryTarget(null);
    setConfirmation(null);
    try {
      const { session: next } = await finalizeSession(session.id, session.revision);
      setSession(next);
      setSaveState("saved");
      setDrafts({});
      setFieldErrors({});
      // La Sesión deja de aparecer como activa en Inicio y en el acceso persistente.
      void queryClient.invalidateQueries({ queryKey: activeSessionQueryKey });
    } catch (error) {
      setSaveState("error");
      if (error instanceof ApiRequestError && error.code === "REVISION_CONFLICT") {
        setSaveError("La Sesión cambió en otra pestaña. Se cargó la versión vigente.");
        setFieldErrors({});
        setDrafts({});
        await reloadCurrentSession();
      } else if (error instanceof ApiRequestError && error.code === "SESSION_NOT_ACTIVE") {
        // Otra pestaña ya la finalizó: se carga la versión vigente y se muestra el resumen.
        setSaveError("La Sesión ya fue finalizada en otra pestaña.");
        setFieldErrors({});
        setDrafts({});
        await reloadCurrentSession();
      } else {
        setSaveError("No se pudo finalizar la Sesión. Inténtalo de nuevo.");
      }
    }
  };

  const requestDeleteSession = () => {
    setConfirmation({ kind: "delete-session" });
  };

  const doDeleteSession = async () => {
    if (!session) {
      return;
    }
    setSaveState("saving");
    setSaveError(null);
    setConfirmation(null);
    try {
      await deleteSession(session.id, session.revision);
      void queryClient.invalidateQueries({ queryKey: activeSessionQueryKey });
      void queryClient.removeQueries({ queryKey: sessionDetailQueryKey(session.id) });
      navigate("/");
    } catch (error) {
      setSaveState("error");
      if (
        error instanceof ApiRequestError &&
        (error.code === "REVISION_CONFLICT" || error.code === "SESSION_NOT_ACTIVE")
      ) {
        // Otra pestaña cambió o eliminó la Sesión: se carga la vigente o se
        // vuelve a Inicio si ya no existe.
        setSaveError("La Sesión cambió en otra pestaña. Se cargó la versión vigente.");
        const fresh = await reloadCurrentSession();
        if (!fresh) {
          void queryClient.invalidateQueries({ queryKey: activeSessionQueryKey });
          navigate("/");
        }
      } else {
        setSaveError("No se pudo eliminar la Sesión. Inténtalo de nuevo.");
      }
    }
  };

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setQ(search.trim());
  };

  const toggleExercise = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  /** Diálogo de confirmación destructiva: cada acción explica qué se perderá. */
  const renderConfirmation = () => {
    if (!confirmation) {
      return null;
    }
    let title = "";
    let text = "";
    let confirmLabel = "Confirmar";
    let onConfirm: () => void = () => {};

    switch (confirmation.kind) {
      case "omit-completed": {
        title = "Omitir la Serie";
        text = "Omitir la Serie eliminará su Resultado y su RPE.";
        confirmLabel = "Omitir";
        onConfirm = () => omitSeries(confirmation.occurrence, confirmation.series);
        break;
      }
      case "to-pending": {
        title = "Volver la Serie a pendiente";
        text = "Volver la Serie a pendiente eliminará su Resultado y su RPE.";
        confirmLabel = "Volver a pendiente";
        onConfirm = () => restoreSeries(confirmation.occurrence, confirmation.series);
        break;
      }
      case "delete-series": {
        title = "Eliminar la Serie añadida";
        text = "Eliminar la Serie añadida eliminará su Resultado y su RPE.";
        confirmLabel = "Eliminar";
        onConfirm = () => removeSeries(confirmation.occurrence, confirmation.series);
        break;
      }
      case "delete-exercise": {
        title = `Eliminar «${confirmation.occurrence.exercise.name}»`;
        text =
          "Eliminar el Ejercicio eliminará esta aparición y sus Series con sus resultados.";
        confirmLabel = "Eliminar";
        onConfirm = () => removeExercise(confirmation.occurrence);
        break;
      }
      case "finalize": {
        title = "Finalizar la Sesión";
        text =
          confirmation.pendingCount === 1
            ? "1 Serie pendiente pasará a omitida al finalizar."
            : `${confirmation.pendingCount} Series pendientes pasarán a omitidas al finalizar.`;
        confirmLabel = "Finalizar";
        onConfirm = () => void doFinalize();
        break;
      }
      case "delete-session": {
        title = "Eliminar la Sesión activa";
        text = "Se eliminará la Sesión y todo su registro. Esta acción no se puede deshacer.";
        confirmLabel = "Eliminar sesión";
        onConfirm = () => void doDeleteSession();
        break;
      }
    }

    return (
      <div
        className={styles.dialogOverlay}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmacion-sesion-titulo"
        aria-describedby="confirmacion-sesion-texto"
      >
        <div className={styles.dialog}>
          <h2 id="confirmacion-sesion-titulo">{title}</h2>
          <p id="confirmacion-sesion-texto">{text}</p>
          <div className={styles.dialogActions}>
            <button
              className={styles.dialogDanger}
              type="button"
              onClick={onConfirm}
              disabled={saveState === "saving"}
            >
              {confirmLabel}
            </button>
            <button
              className={styles.dialogCancel}
              type="button"
              onClick={() => setConfirmation(null)}
              disabled={saveState === "saving"}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
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
        <h1 className={styles.title}>
          {session?.status === "finalizada" ? "Sesión finalizada" : "Sesión activa"}
        </h1>
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

        {!loading && !failed && session && session.status === "finalizada" && (
          <section className={styles.finalized} aria-labelledby="resumen-finalizado-titulo">
            <h2 id="resumen-finalizado-titulo">Resumen de la Sesión</h2>
            <p className={styles.finalizedDate}>{session.datePerformed}</p>
            <p className={styles.summary} role="status">
              {sessionSeriesSummary(session)}
            </p>
            <ul className={styles.finalizedList} aria-label="Ejercicios finalizados">
              {session.exercises.map((occurrence) => (
                <li key={occurrence.id} className={styles.finalizedExercise}>
                  <span className={styles.exerciseName}>
                    {occurrence.exercise.name}
                  </span>
                  <span className={styles.exerciseMeta}>
                    {occurrenceProgressLabel(occurrence)}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.finalizedNote}>
              La Sesión quedó sin Series pendientes y ya no aparece como activa.
            </p>
            <Link className={styles.homeLink} to="/">
              Volver a Inicio
            </Link>
          </section>
        )}

        {!loading && !failed && session && session.status === "activa" && (
          <>
            <p className={styles.progress} role="status">
              {sessionProgressLabel(session)}
            </p>

            {session.exercises.length > 0 && (
              <p className={styles.summary} role="status">
                {sessionSeriesSummary(session)}
              </p>
            )}

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
                        <div className={styles.exerciseDetailsHeader}>
                          <span className={styles.exerciseProgress}>
                            {occurrenceProgressLabel(occurrence)}
                          </span>
                          <span className={styles.exerciseDetailsActions}>
                            {session.lastExerciseId === occurrence.exerciseId && (
                              <span className={styles.lastUsed}>
                                Último Ejercicio utilizado
                              </span>
                            )}
                            <button
                              className={styles.deleteExerciseButton}
                              type="button"
                              onClick={() => {
                                const hasResult = occurrence.series.some(seriesHasResult);
                                if (hasResult) {
                                  setConfirmation({ kind: "delete-exercise", occurrence });
                                } else {
                                  removeExercise(occurrence);
                                }
                              }}
                              disabled={saveState === "saving"}
                            >
                              Eliminar ejercicio
                            </button>
                          </span>
                        </div>

                        {occurrence.series.length === 0 ? (
                          <p className={styles.detailsNote}>
                            Aún no hay Series. Añade la primera para empezar a registrar.
                          </p>
                        ) : (
                          <ul
                            className={styles.seriesList}
                            aria-label={`Series de ${occurrence.exercise.name}`}
                          >
                            {occurrence.series.map((series) => (
                              <li key={series.id} className={styles.seriesItem}>
                                <SeriesRow
                                  series={series}
                                  mode={occurrence.exercise.recordingMode}
                                  draft={drafts[series.id] ?? draftFromSeries(series)}
                                  errors={fieldErrors[series.id] ?? {}}
                                  saving={saveState === "saving"}
                                  onDraftChange={(field, value) =>
                                    setDrafts((previous) => ({
                                      ...previous,
                                      [series.id]: {
                                        ...(previous[series.id] ?? draftFromSeries(series)),
                                        [field]: value,
                                      },
                                    }))
                                  }
                                  onComplete={() => completeSeries(occurrence, series)}
                                  onOmit={() => omitSeries(occurrence, series)}
                                  onOmitCompleted={() =>
                                    setConfirmation({
                                      kind: "omit-completed",
                                      occurrence,
                                      series,
                                    })
                                  }
                                  onReturnToPending={() =>
                                    setConfirmation({
                                      kind: "to-pending",
                                      occurrence,
                                      series,
                                    })
                                  }
                                  onRestore={() => restoreSeries(occurrence, series)}
                                  onDelete={() => {
                                    if (seriesHasResult(series)) {
                                      setConfirmation({
                                        kind: "delete-series",
                                        occurrence,
                                        series,
                                      });
                                    } else {
                                      removeSeries(occurrence, series);
                                    }
                                  }}
                                />
                              </li>
                            ))}
                          </ul>
                        )}

                        {occurrence.exercise.recordingMode !== "cardio_continuo" && (
                          <button
                            className={styles.addSeriesButton}
                            type="button"
                            onClick={() => addSeries(occurrence)}
                            disabled={saveState === "saving"}
                          >
                            Añadir serie
                          </button>
                        )}
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

      {session && session.status === "activa" && (
        <div className={styles.footer}>
          <button
            className={styles.deleteSessionButton}
            type="button"
            onClick={requestDeleteSession}
            disabled={saveState === "saving"}
          >
            Eliminar sesión
          </button>
          <button
            className={styles.finalizeButton}
            type="button"
            onClick={requestFinalize}
            disabled={saveState === "saving" || !sessionHasCompletedSeries(session)}
          >
            Finalizar
          </button>
        </div>
      )}

      {confirmation && renderConfirmation()}
    </div>
  );
}

/** ¿La Sesión contiene al menos una Serie completada? (invariante para finalizar). */
function sessionHasCompletedSeries(session: SessionDocument): boolean {
  return session.exercises.some((occurrence) =>
    occurrence.series.some((series) => series.status === "completada"),
  );
}
