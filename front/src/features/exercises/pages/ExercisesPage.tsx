import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { ExercisePlaceholder } from "../../../shared/ui/ExercisePlaceholder";
import { PageIntro } from "../../../shared/ui/PageIntro";
import {
  listExerciseCategories,
  listExercises,
  recordingModeLabels,
  type ExerciseItem,
  type RecordingMode,
} from "../api/exercises-api";
import styles from "./ExercisesPage.module.css";

const provenanceLabels = {
  catalogo: "Catálogo",
  personalizado: "Personalizado",
} as const;

export function ExercisesPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [recordingMode, setRecordingMode] = useState<RecordingMode | "">("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<ExerciseItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  useEffect(() => {
    if (pageQuery.data) {
      setItems(pageQuery.data.items);
      setNextCursor(pageQuery.data.nextCursor);
      setLoadMoreError(null);
    }
  }, [pageQuery.data]);

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

  return (
    <>
      <PageIntro
        eyebrow="Entrenamiento"
        title="Ejercicios"
        description="Busca en el catálogo compartido y consulta cómo registrar cada movimiento."
      />
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
                : "El catálogo todavía no tiene Ejercicios disponibles."}
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
    </>
  );
}
