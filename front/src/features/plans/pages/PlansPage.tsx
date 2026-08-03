import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PageIntro } from "../../../shared/ui/PageIntro";
import {
  deletePlan,
  listPlans,
  planStatusLabels,
  type PlanItem,
} from "../api/plans-api";
import styles from "./PlansPage.module.css";

function planSummary(plan: PlanItem): string {
  const weekCount = plan.weeks.length;
  const trainingCount = plan.weeks.reduce((total, week) => total + week.trainings.length, 0);
  const weeksLabel = `${weekCount} ${weekCount === 1 ? "semana" : "semanas"}`;
  const trainingsLabel = `${trainingCount} ${trainingCount === 1 ? "Entrenamiento" : "Entrenamientos"}`;
  return `${weeksLabel} · ${trainingsLabel}`;
}

export function PlansPage() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<PlanItem | null>(null);

  const plansQuery = useQuery({
    queryKey: ["plans"],
    queryFn: listPlans,
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePlan,
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });

  const plans = plansQuery.data?.items ?? [];

  return (
    <>
      <PageIntro
        eyebrow="Organizar"
        title="Planes"
        description="Prepara Planes borrador con semanas y Entrenamientos planificados antes de llevarlos al calendario."
      />

      <section className={styles.management} aria-label="Gestionar Planes">
        <Link className={styles.newPlan} to="/planes/nuevo">
          Nuevo Plan
        </Link>

        {deleteTarget && (
          <div
            className={styles.dialogBackdrop}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmar-eliminar-plan-titulo"
            aria-describedby="confirmar-eliminar-plan-descripcion"
          >
            <div className={styles.dialog}>
              <h2 id="confirmar-eliminar-plan-titulo">Eliminar «{deleteTarget.name}»</h2>
              <p id="confirmar-eliminar-plan-descripcion">
                El borrador se eliminará por completo. Las Rutinas y Ejercicios que
                referencia no se borran.
              </p>
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
      </section>

      <section className={styles.results} aria-labelledby="planes-titulo" aria-busy={plansQuery.isPending}>
        <h2 id="planes-titulo" className={styles.sectionHeading}>
          Tus Planes
        </h2>

        {plansQuery.isPending && <p className={styles.status}>Cargando Planes…</p>}

        {plansQuery.isError && (
          <p className={styles.error} role="alert">
            No se pudieron cargar los Planes. Inténtalo de nuevo.
          </p>
        )}

        {plansQuery.isSuccess && plans.length === 0 && (
          <div className={styles.emptyState}>
            <p>Todavía no has creado ningún Plan. Crea un borrador para preparar tu próximo ciclo.</p>
            <Link className={styles.emptyAction} to="/planes/nuevo">
              Crear el primer Plan
            </Link>
          </div>
        )}

        {plans.length > 0 && (
          <ul className={styles.list}>
            {plans.map((plan) => (
              <li key={plan.id} className={styles.item}>
                <Link className={styles.itemLink} to={`/planes/${plan.id}`}>
                  <span className={styles.itemName}>{plan.name}</span>
                  <span className={styles.itemMeta}>
                    {planStatusLabels[plan.status]} · {planSummary(plan)}
                  </span>
                </Link>
                <div className={styles.itemActions}>
                  <Link className={styles.viewLink} to={`/planes/${plan.id}`}>
                    Editar
                  </Link>
                  {plan.status === "borrador" && (
                    <button
                      type="button"
                      aria-label={`Eliminar ${plan.name}`}
                      onClick={() => setDeleteTarget(plan)}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
