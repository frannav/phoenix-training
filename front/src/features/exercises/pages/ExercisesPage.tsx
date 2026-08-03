import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { ExercisePlaceholder } from "../../../shared/ui/ExercisePlaceholder";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { ExerciseForm } from "../components/ExerciseForm";
import { RecordedMaxSection } from "../components/RecordedMaxSection";
import {
  archiveExercise,
  createExercise,
  listArchivedExercises,
  listExerciseCategories,
  listExercises,
  recordingModeLabels,
  restoreExercise,
  updateExercise,
  type ExerciseFormValues,
  type ExerciseItem,
  type RecordingMode,
} from "../api/exercises-api";
import styles from "./ExercisesPage.module.css";

const provenanceLabels = {
  catalogo: "Catálogo",
  personalizado: "Personalizado",
} as const;

type FormState = { mode: "create" } | { mode: "edit"; exercise: ExerciseItem } | null;

function sortByName(items: ExerciseItem[]): ExerciseItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function ExercisesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [recordingMode, setRecordingMode] = useState<RecordingMode | "">("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<ExerciseItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(null);
  const [archiveTarget, setArchiveTarget] = useState<ExerciseItem | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["exercises", "categories"],
    queryFn: listExerciseCategories,
    retry: false,
  });

  const pageQuery = useQuery({
    queryKey: ["exercises", { q, recordingMode, category }],
    queryFn: () => listExercises({ q, recordingMode, category }),
    retry: false,
  });

  const archivedQuery = useQuery({
    queryKey: ["exercises", "archived"],
    queryFn: listArchivedExercises,
    retry: false,
  });

  useEffect(() => {
    if (pageQuery.data) {
      setItems(pageQuery.data.items);
      setNextCursor(pageQuery.data.nextCursor);
      setLoadMoreError(null);
    }
  }, [pageQuery.data]);

  const refreshListings = () => {
    void pageQuery.refetch();
    void archivedQuery.refetch();
  };

  const createMutation = useMutation({
    mutationFn: (values: ExerciseFormValues) => createExercise(values),
    onSuccess: ({ exercise }) => {
      setFormState(null);
      setItems((previous) => sortByName([...previous, exercise]));
      setSelectedId(exercise.id);
      refreshListings();
      void queryClient.invalidateQueries({ queryKey: ["exercises", "categories"] });
      void queryClient.invalidateQueries({ queryKey: ["rms"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ExerciseFormValues }) =>
      updateExercise(id, values),
    onSuccess: ({ exercise }) => {
      setFormState(null);
      setItems((previous) => sortByName(previous.map((item) => (item.id === exercise.id ? exercise : item))));
      refreshListings();
      void queryClient.invalidateQueries({ queryKey: ["rms"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveExercise(id),
    onSuccess: ({ exercise }) => {
      setArchiveTarget(null);
      setItems((previous) => previous.filter((item) => item.id !== exercise.id));
      if (selectedId === exercise.id) {
        setSelectedId(null);
      }
      refreshListings();
      void queryClient.invalidateQueries({ queryKey: ["rms"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreExercise(id),
    onSuccess: ({ exercise }) => {
      setItems((previous) => sortByName([...previous, exercise]));
      refreshListings();
      void queryClient.invalidateQueries({ queryKey: ["rms"] });
    },
  });

  const handleFormSubmit = async (values: ExerciseFormValues) => {
    if (formState?.mode === "edit") {
      await updateMutation.mutateAsync({ id: formState.exercise.id, values });
      return;
    }
    await createMutation.mutateAsync(values);
  };

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setQ(search.trim());
  };

  const clearFilters = () => {
    setSearch("");
    setQ("");
    setRecordingMode("");
    setCategory("");
  };

  const hasActiveFilters = q.length > 0 || recordingMode !== "" || category !== "";

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = await listExercises({ q, recordingMode, category, cursor: nextCursor });
      setItems((previous) => [...previous, ...next.items]);
      setNextCursor(next.nextCursor);
    } catch {
      setLoadMoreError("No se pudieron cargar más Ejercicios. Inténtalo de nuevo.");
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleDetails = (id: string) => {
    setSelectedId((current) => (current === id ? null : id));
  };

  const closeForm = () => setFormState(null);

  return (
    <>
      <PageIntro
        eyebrow="Entrenamiento"
        title="Ejercicios"
        description="Explora el catálogo compartido y mantén tus Ejercicios personalizados en un solo flujo."
      />

      <section className={styles.management} aria-label="Gestionar Ejercicios personalizados">
        <button
          className={styles.newExercise}
          type="button"
          onClick={() => setFormState({ mode: "create" })}
        >
          Nuevo ejercicio
        </button>

        {formState && (
          <section
            className={styles.formPanel}
            aria-label={formState.mode === "edit" ? "Editar Ejercicio" : "Nuevo Ejercicio personalizado"}
          >
            <h2 className={styles.formHeading}>
              {formState.mode === "edit" ? "Editar Ejercicio" : "Nuevo Ejercicio personalizado"}
            </h2>
            <ExerciseForm
              key={formState.mode === "edit" ? formState.exercise.id : "nueva"}
              exercise={formState.mode === "edit" ? formState.exercise : null}
              categories={categoriesQuery.data?.categories ?? []}
              submitLabel={formState.mode === "edit" ? "Guardar cambios" : "Crear Ejercicio"}
              onCancel={closeForm}
              onSubmit={handleFormSubmit}
            />
          </section>
        )}

        {archiveTarget && (
          <div
            className={styles.dialogBackdrop}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmar-archivo-titulo"
            aria-describedby="confirmar-archivo-descripcion"
          >
            <div className={styles.dialog}>
              <h2 id="confirmar-archivo-titulo">Archivar «{archiveTarget.name}»</h2>
              <p id="confirmar-archivo-descripcion">
                El Ejercicio dejará de ofrecerse en los usos nuevos, pero conservará su
                identidad y podrás restaurarlo cuando quieras.
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

      <section className={styles.toolbar} aria-label="Buscar y filtrar Ejercicios">
        <form className={styles.searchForm} onSubmit={applySearch} role="search">
          <label className={styles.visuallyHidden} htmlFor="ejercicios-busqueda">
            Buscar por nombre
          </label>
          <input
            id="ejercicios-busqueda"
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
        <div className={styles.filters}>
          <label className={styles.filter}>
            <span className={styles.filterLabel}>Forma de registro</span>
            <select
              value={recordingMode}
              onChange={(event) => setRecordingMode(event.target.value as RecordingMode | "")}
            >
              <option value="">Todas</option>
              {(Object.keys(recordingModeLabels) as RecordingMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {recordingModeLabels[mode]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filter}>
            <span className={styles.filterLabel}>Categoría</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">Todas</option>
              {(categoriesQuery.data?.categories ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className={styles.results} aria-live="polite" aria-busy={pageQuery.isPending}>
        {pageQuery.isPending && <p className={styles.status}>Cargando Ejercicios…</p>}

        {pageQuery.isError && (
          <p className={styles.error} role="alert">
            No se pudo cargar el catálogo. Inténtalo de nuevo.
          </p>
        )}

        {pageQuery.isSuccess && items.length === 0 && (
          <div className={styles.emptyState}>
            <h2>Sin Ejercicios que mostrar</h2>
            <p>
              {hasActiveFilters
                ? "Ningún Ejercicio coincide con la búsqueda o los filtros."
                : "El catálogo todavía no tiene Ejercicios disponibles. Crea uno personalizado o revisa el catálogo más adelante."}
            </p>
            {hasActiveFilters && (
              <button className={styles.clearFilters} type="button" onClick={clearFilters}>
                Limpiar búsqueda y filtros
              </button>
            )}
          </div>
        )}

        {pageQuery.isSuccess && items.length > 0 && (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id} className={styles.item}>
                <button
                  className={styles.itemButton}
                  type="button"
                  aria-expanded={selectedId === item.id}
                  onClick={() => toggleDetails(item.id)}
                >
                  <ExercisePlaceholder />
                  <span className={styles.itemSummary}>
                    <span className={styles.itemName}>{item.name}</span>
                    <span className={styles.itemMeta}>
                      {recordingModeLabels[item.recordingMode]} · {item.category}
                    </span>
                  </span>
                  <span className={styles.provenance} data-provenance={item.provenance}>
                    {provenanceLabels[item.provenance]}
                  </span>
                </button>
                {item.provenance === "personalizado" && (
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      aria-label={`Editar ${item.name}`}
                      onClick={() => setFormState({ mode: "edit", exercise: item })}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      aria-label={`Archivar ${item.name}`}
                      onClick={() => setArchiveTarget(item)}
                    >
                      Archivar
                    </button>
                  </div>
                )}
                {selectedId === item.id && (
                  <div className={styles.details}>
                    <h3 className={styles.detailsHeading}>Cómo se registra</h3>
                    <p className={styles.detailsText}>{item.instructions}</p>
                    <p className={styles.detailsMeta}>
                      Forma de registro: {recordingModeLabels[item.recordingMode]}
                      {item.equipment ? ` · Equipamiento: ${item.equipment}` : ""}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {nextCursor && pageQuery.isSuccess && (
          <button
            className={styles.loadMore}
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Cargando más…" : "Cargar más"}
          </button>
        )}
        {loadMoreError && (
          <p className={styles.error} role="alert">
            {loadMoreError}
          </p>
        )}
      </section>

      <section className={styles.archivedSection} aria-labelledby="archivados-titulo">
        <h2 id="archivados-titulo">Ejercicios archivados</h2>
        {archivedQuery.isPending && <p className={styles.status}>Cargando archivados…</p>}
        {archivedQuery.isError && (
          <p className={styles.error} role="alert">
            No se pudieron cargar los Ejercicios archivados.
          </p>
        )}
        {archivedQuery.isSuccess && archivedQuery.data.items.length === 0 && (
          <p className={styles.archivedEmpty}>
            No tienes Ejercicios personalizados archivados.
          </p>
        )}
        {archivedQuery.isSuccess && archivedQuery.data.items.length > 0 && (
          <ul className={styles.archivedList}>
            {archivedQuery.data.items.map((item) => (
              <li key={item.id} className={styles.archivedItem}>
                <span className={styles.archivedName}>{item.name}</span>
                <span className={styles.archivedMeta}>
                  {recordingModeLabels[item.recordingMode]} · {item.category}
                </span>
                <button
                  className={styles.restoreButton}
                  type="button"
                  onClick={() => restoreMutation.mutate(item.id)}
                  disabled={restoreMutation.isPending}
                >
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecordedMaxSection />
    </>
  );
}
