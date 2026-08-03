import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import { ConfirmDialog } from "../../../shared/ui/ConfirmDialog";
import { PageIntro } from "../../../shared/ui/PageIntro";
import {
  deletePlan,
  duplicatePlan,
  listPlans,
  planCalendarRange,
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
    mutationFn: ({ id, revision }: { id: string; revision: number }) => deletePlan(id, revision),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }) =>
      duplicatePlan(id, revision),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });

  const plans = plansQuery.data?.items ?? [];
  const mutationError = deleteMutation.error ?? duplicateMutation.error;

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
          <ConfirmDialog
            title={`Eliminar «${deleteTarget.name}»`}
            description="El borrador se eliminará por completo. Las Rutinas y Ejercicios que referencia no se borran."
            confirmLabel="Eliminar"
            pendingLabel="Eliminando…"
            pending={deleteMutation.isPending}
            onConfirm={() =>
              deleteMutation.mutate({ id: deleteTarget.id, revision: deleteTarget.revision })
            }
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </section>

      {mutationError && (
        <p className={styles.error} role="alert">
          {mutationError instanceof ApiRequestError
            ? mutationError.message
            : "No se pudo completar la acción. Inténtalo de nuevo."}
        </p>
      )}

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
            {plans.map((plan) => {
              const calendarRange = planCalendarRange(plan);
              const editLabel = plan.status === "completado" ? "Ver" : "Editar";
              return (
                <li key={plan.id} className={styles.item}>
                  <Link className={styles.itemLink} to={`/planes/${plan.id}`}>
                    <span className={styles.itemName}>{plan.name}</span>
                    <span className={styles.itemMeta}>
                      <span
                        className={styles.statusBadge}
                        data-status={plan.status}
                        aria-label={`Plan ${planStatusLabels[plan.status]}`}
                      >
                        <span className={styles.statusDot} aria-hidden="true" />
                        {planStatusLabels[plan.status]}
                      </span>
                      <span className={styles.itemSummary}>
                        {planSummary(plan)}
                        {calendarRange !== null && (
                          <span className={styles.itemRange}> · {calendarRange}</span>
                        )}
                      </span>
                    </span>
                  </Link>
                  <div className={styles.itemActions}>
                    <Link className={styles.viewLink} to={`/planes/${plan.id}`}>
                      {editLabel}
                    </Link>
                    <button
                      type="button"
                      aria-label={`Duplicar ${plan.name}`}
                      disabled={duplicateMutation.isPending}
                      onClick={() => duplicateMutation.mutate({ id: plan.id, revision: plan.revision })}
                    >
                      Duplicar
                    </button>
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
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
