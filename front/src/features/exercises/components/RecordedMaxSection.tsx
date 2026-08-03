import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  createRecordedMax,
  deleteRecordedMax,
  listAllAvailableExercises,
  listRecordedMaxes,
  updateRecordedMax,
  type RecordedMax,
  type RecordedMaxFormValues,
} from "../api/exercises-api";
import { RecordedMaxForm, type ExerciseOption } from "./RecordedMaxForm";
import styles from "./RecordedMaxSection.module.css";

type FormState = { mode: "create" } | { mode: "edit"; rm: RecordedMax } | null;

/** La carga se presenta en español: coma decimal y unidades en kilogramos. */
function formatLoad(load: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(load);
}

/** La fecha de dominio YYYY-MM-DD se presenta como DD/MM/AAAA. */
function formatDomainDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function sortByExerciseName(options: ExerciseOption[]): ExerciseOption[] {
  return [...options].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function RecordedMaxSection() {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<FormState>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecordedMax | null>(null);

  const rmQuery = useQuery({
    queryKey: ["rms"],
    queryFn: listRecordedMaxes,
    retry: false,
  });

  // El selector de Ejercicio carga los disponibles solo cuando se abre el
  // formulario; en edición, el Ejercicio del RM se añade aunque ya no esté
  // disponible para usos nuevos.
  const pickerQuery = useQuery({
    queryKey: ["exercises", "rm-picker"],
    queryFn: listAllAvailableExercises,
    enabled: formState !== null,
    retry: false,
  });

  const exerciseOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const exercise of pickerQuery.data ?? []) {
      byId.set(exercise.id, exercise.name);
    }
    if (formState?.mode === "edit") {
      byId.set(formState.rm.exerciseId, formState.rm.exerciseName);
    }
    return sortByExerciseName(
      [...byId.entries()].map(([id, name]) => ({ id, name })),
    );
  }, [pickerQuery.data, formState]);

  const invalidateRmList = () => {
    void queryClient.invalidateQueries({ queryKey: ["rms"] });
  };

  const createMutation = useMutation({
    mutationFn: (values: RecordedMaxFormValues) => createRecordedMax(values),
    onSuccess: () => {
      setFormState(null);
      invalidateRmList();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Omit<RecordedMaxFormValues, "exerciseId"> }) =>
      updateRecordedMax(id, values),
    onSuccess: () => {
      setFormState(null);
      invalidateRmList();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRecordedMax(id),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidateRmList();
    },
  });

  const handleFormSubmit = async (values: RecordedMaxFormValues) => {
    if (formState?.mode === "edit") {
      // El servidor valida la edición con un esquema estricto que rechaza
      // exerciseId: la marca no puede moverse a otro Ejercicio. Se envía
      // solo carga, repeticiones y fecha.
      const { load, repetitions, date } = values;
      await updateMutation.mutateAsync({
        id: formState.rm.id,
        values: { load, repetitions, date },
      });
      return;
    }
    await createMutation.mutateAsync(values);
  };

  const deleteDescription = deleteTarget
    ? `La marca de ${formatLoad(deleteTarget.load)} kg × ${deleteTarget.repetitions} rep del ${formatDomainDate(deleteTarget.date)} se eliminará definitivamente.`
    : "";

  return (
    <section className={styles.section} aria-labelledby="rm-titulo">
      <div className={styles.heading}>
        <h2 id="rm-titulo">RM registrados</h2>
        <button
          className={styles.newRm}
          type="button"
          onClick={() => setFormState({ mode: "create" })}
        >
          Nuevo RM
        </button>
      </div>
      <p className={styles.description}>
        Tus mejores marcas reales declaradas por Ejercicio, carga, repeticiones y
        fecha. La aplicación nunca las calcula ni las actualiza por ti.
      </p>

      {formState && (
        <section
          className={styles.formPanel}
          aria-label={formState.mode === "edit" ? "Editar RM" : "Nuevo RM"}
        >
          <h3 className={styles.formHeading}>
            {formState.mode === "edit" ? "Editar RM" : "Nuevo RM"}
          </h3>
          {pickerQuery.isError && formState.mode === "create" && (
            <p className={styles.pickerError} role="alert">
              No se pudieron cargar los Ejercicios para el selector.
              <button
                className={styles.retry}
                type="button"
                onClick={() => void pickerQuery.refetch()}
              >
                Reintentar
              </button>
            </p>
          )}
          <RecordedMaxForm
            key={formState.mode === "edit" ? formState.rm.id : "nueva"}
            rm={formState.mode === "edit" ? formState.rm : null}
            exerciseOptions={exerciseOptions}
            submitLabel={formState.mode === "edit" ? "Guardar cambios" : "Registrar RM"}
            onCancel={() => setFormState(null)}
            onSubmit={handleFormSubmit}
          />
        </section>
      )}

      {deleteTarget && (
        <div
          className={styles.dialogBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirmar-rm-titulo"
          aria-describedby="confirmar-rm-descripcion"
        >
          <div className={styles.dialog}>
            <h2 id="confirmar-rm-titulo">
              Eliminar RM de «{deleteTarget.exerciseName}»
            </h2>
            <p id="confirmar-rm-descripcion">{deleteDescription}</p>
            <div className={styles.dialogActions}>
              <button
                className={styles.dialogDanger}
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
              </button>
              <button
                className={styles.dialogCancel}
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {rmQuery.isPending && <p className={styles.status}>Cargando RM…</p>}

      {rmQuery.isError && (
        <p className={styles.error} role="alert">
          No se pudieron cargar tus RM registrados. Inténtalo de nuevo.
        </p>
      )}

      {rmQuery.isSuccess && rmQuery.data.items.length === 0 && (
        <p className={styles.empty}>
          Aún no has registrado ninguna marca real. Cuando lo hagas, la
          encontrarás aquí con su Ejercicio, carga, repeticiones y fecha.
        </p>
      )}

      {rmQuery.isSuccess && rmQuery.data.items.length > 0 && (
        <ul className={styles.rmList}>
          {rmQuery.data.items.map((rm) => (
            <li key={rm.id} className={styles.rmItem}>
              <div className={styles.rmSummary}>
                <span className={styles.rmExercise}>{rm.exerciseName}</span>
                <span className={styles.rmMeta}>
                  {`${formatLoad(rm.load)} kg × ${rm.repetitions} rep · ${formatDomainDate(rm.date)}`}
                </span>
              </div>
              <div className={styles.rmActions}>
                <button
                  type="button"
                  aria-label={`Editar RM de ${rm.exerciseName}`}
                  onClick={() => setFormState({ mode: "edit", rm })}
                >
                  Editar
                </button>
                <button
                  className={styles.deleteAction}
                  type="button"
                  aria-label={`Eliminar RM de ${rm.exerciseName}`}
                  onClick={() => setDeleteTarget(rm)}
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
