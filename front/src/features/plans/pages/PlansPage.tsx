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

type IconName = "add" | "calendar" | "calendarEdit" | "edit" | "copy" | "delete" | "weeks";

const iconPaths: Record<IconName, string> = {
  add: "M12 5v14M5 12h14",
  calendar: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  calendarEdit:
    "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v7M5 5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h8M15 16l4-4 2 2-4 4-3 .5.5-3Z",
  edit: "M4 17.5V20h2.5L18.8 7.7l-2.5-2.5L4 17.5ZM14.9 6.1l2.5 2.5M13 20h7",
  copy: "M8 8V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3M5 8h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z",
  delete: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  weeks: "M4 5h16v14H4zM10 5v14M16 5v14",
};

function InlineIcon({ name }: { name: IconName }) {
  return (
    <svg
      className={styles.iconSvg}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

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
      <div className={styles.intro}>
        <PageIntro
          eyebrow="Organizar"
          title="Planes"
          description="Prepara Planes borrador con semanas y Entrenamientos planificados antes de llevarlos al calendario."
        />
      </div>

      {mutationError && (
        <p className={styles.error} role="alert">
          {mutationError instanceof ApiRequestError
            ? mutationError.message
            : "No se pudo completar la acción. Inténtalo de nuevo."}
        </p>
      )}

      <section className={styles.results} aria-labelledby="planes-titulo" aria-busy={plansQuery.isPending}>
        <div className={styles.sectionHeader}>
          <h2 id="planes-titulo" className={styles.sectionHeading}>
            Tus Planes
          </h2>
          <Link className={styles.newPlan} to="/planes/nuevo">
            <span className={styles.actionIcon} aria-hidden="true">
              <InlineIcon name="add" />
            </span>
            Nuevo Plan
          </Link>
        </div>

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
                <li key={plan.id} className={styles.item} data-status={plan.status}>
                  <Link className={styles.itemLink} to={`/planes/${plan.id}`}>
                    <span className={styles.itemTitle}>
                      <span className={styles.itemName}>{plan.name}</span>
                      <span
                        className={styles.statusBadge}
                        data-status={plan.status}
                        aria-label={`Plan ${planStatusLabels[plan.status]}`}
                      >
                        <span className={styles.statusDot} aria-hidden="true" />
                        {planStatusLabels[plan.status]}
                      </span>
                    </span>
                    <span className={styles.itemMeta}>
                      <span className={styles.metaGroup}>
                        <span className={styles.metaIcon} aria-hidden="true">
                          <InlineIcon name={calendarRange === null ? "calendarEdit" : "calendar"} />
                        </span>
                        <span className={styles.itemRange}>
                          {calendarRange === null ? "Sin asignar" : `Rango: ${calendarRange}`}
                        </span>
                      </span>
                      <span className={styles.metaDivider} aria-hidden="true">
                        |
                      </span>
                      <span className={styles.metaGroup}>
                        <span className={styles.metaIcon} aria-hidden="true">
                          <InlineIcon name="weeks" />
                        </span>
                        <span className={styles.itemSummary}>{planSummary(plan)}</span>
                      </span>
                    </span>
                  </Link>
                  <div className={styles.itemActions}>
                    <Link className={styles.viewLink} to={`/planes/${plan.id}`}>
                      <span className={styles.actionIcon} aria-hidden="true">
                        <InlineIcon name="edit" />
                      </span>
                      {editLabel}
                    </Link>
                    <button
                      className={styles.duplicateButton}
                      type="button"
                      aria-label={`Duplicar ${plan.name}`}
                      disabled={duplicateMutation.isPending}
                      onClick={() => duplicateMutation.mutate({ id: plan.id, revision: plan.revision })}
                    >
                      <span className={styles.actionIcon} aria-hidden="true">
                        <InlineIcon name="copy" />
                      </span>
                      Duplicar
                    </button>
                    {plan.status === "borrador" && (
                      <button
                        className={styles.deleteButton}
                        type="button"
                        aria-label={`Eliminar ${plan.name}`}
                        title={`Eliminar ${plan.name}`}
                        onClick={() => setDeleteTarget(plan)}
                      >
                        <span className={styles.actionIcon} aria-hidden="true">
                          <InlineIcon name="delete" />
                        </span>
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
