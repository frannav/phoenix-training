import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import { ConfirmDialog } from "../../../shared/ui/ConfirmDialog";
import { PageIntro } from "../../../shared/ui/PageIntro";
import {
  activatePlan,
  completePlan,
  dayLabels,
  duplicatePlan,
  formatDomainDate,
  getPlan,
  omitTraining,
  planCalendarRange,
  planStatusLabels,
  restoreTraining,
  type PlanItem,
} from "../api/plans-api";
import { ActivatePlanPanel } from "../components/ActivatePlanPanel";
import { PlanEditor } from "../components/PlanEditor";
import { useStartSession } from "../../sessions/api/use-start-session";
import styles from "./PlansPage.module.css";

type ConfirmTarget =
  | { type: "omit"; training: { id: string; day: number; plannedDate: string | null } }
  | { type: "complete" };

/**
 * Calendario cerrado de un Plan completado: presenta las Fechas previstas
 * como «Prevista» y los días como omitidos, sin transiciones posibles.
 */
function PlanCompletedView({ plan }: { plan: PlanItem }) {
  return (
    <section className={styles.completedCalendar} aria-labelledby="plan-completado-calendario">
      <h2 id="plan-completado-calendario" className={styles.sectionHeading}>
        Calendario cerrado
      </h2>
      <p className={styles.completedHint}>
        El Plan quedó completado: su estructura y sus Fechas previstas se conservan
        como histórico y ningún día puede volver a pendiente.
      </p>
      {plan.weeks.map((week, weekIndex) => (
        <article key={week.id} className={styles.completedWeek} aria-label={`Semana ${weekIndex + 1}`}>
          <h3 className={styles.completedWeekTitle}>Semana {weekIndex + 1}</h3>
          <ul className={styles.completedList}>
            {week.trainings.map((training) => (
              <li key={training.id} className={styles.completedDay}>
                <span className={styles.completedDayLabel}>{dayLabels[training.day]}</span>
                {training.plannedDate !== null && (
                  <span className={styles.completedDate}>
                    Prevista · {formatDomainDate(training.plannedDate)}
                  </span>
                )}
                <span className={styles.completedStatus}>
                  <span className={styles.statusDot} aria-hidden="true" />
                  {training.status === "realizado" ? "Realizado" : "Omitido"}
                </span>
                <span className={styles.completedContent}>
                  {training.source === "rutina"
                    ? (training.routine?.name ?? "Rutina")
                    : training.content.map((entry) => entry.exercise.name).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}

export function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [revision, setRevision] = useState(0);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);

  const planQuery = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => getPlan(planId ?? ""),
    retry: false,
  });

  const startMutation = useStartSession();

  if (planQuery.isPending) {
    return <p className={styles.status}>Cargando el Plan…</p>;
  }

  if (planQuery.isError) {
    return (
      <p className={styles.error} role="alert">
        El Plan solicitado no existe o no se pudo cargar.
      </p>
    );
  }

  const plan = planQuery.data.plan;

  const reloadCurrent = () => {
    // remonta el editor con el documento vigente para no mezclar cambios
    setRevision((previous) => previous + 1);
    void planQuery.refetch();
  };

  /**
   * Acciones explícitas del ciclo de vida: activar, omitir, devolver a
   * pendiente, completar y duplicar. Cada acción incorpora el documento
   * canónico devuelto, invalida el listado y no mezcla cambios parciales.
   */
  const runAction = async (
    action: () => Promise<{ plan: PlanItem }>,
    onSuccess?: (plan: PlanItem) => void,
  ) => {
    setIsActing(true);
    setActionError(null);
    try {
      const result = await action();
      void queryClient.setQueryData(["plan", planId], result);
      void queryClient.invalidateQueries({ queryKey: ["plans"] });
      setConfirmTarget(null);
      onSuccess?.(result.plan);
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError
          ? error.message
          : "No se pudo completar la acción. Inténtalo de nuevo.",
      );
    } finally {
      setIsActing(false);
    }
  };

  const handleDuplicate = () => {
    // duplicar crea un recurso nuevo: no se reescribe la caché del Plan
    // actual (el servidor devuelve el borrador copia bajo otra identidad).
    setIsActing(true);
    setActionError(null);
    duplicatePlan(plan.id, plan.revision)
      .then((result) => {
        void queryClient.invalidateQueries({ queryKey: ["plans"] });
        navigate(`/planes/${result.plan.id}`);
      })
      .catch((error: unknown) => {
        setActionError(
          error instanceof ApiRequestError
            ? error.message
            : "No se pudo completar la acción. Inténtalo de nuevo.",
        );
      })
      .finally(() => {
        setIsActing(false);
      });
  };

  const calendarRange = planCalendarRange(plan);

  return (
    <>
      <PageIntro
        eyebrow="Planes"
        title={plan.name}
        description={`${planStatusLabels[plan.status]}${calendarRange !== null ? ` · ${calendarRange}` : ""} · la edición sustituye el agregado completo del Plan.`}
      />

      {actionError && (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      )}

      {startMutation.isError && (
        <p className={styles.error} role="alert">
          {startMutation.error instanceof ApiRequestError
            ? startMutation.error.message
            : "No se pudo iniciar la Sesión. Inténtalo de nuevo."}
        </p>
      )}

      {plan.status === "borrador" && (
        <>
          <ActivatePlanPanel
            pending={isActing}
            onActivate={(startDate) => {
              void runAction(() => activatePlan(plan.id, plan.revision, startDate));
            }}
          />
          <PlanEditor
            key={`${plan.id}-${plan.revision}-${revision}`}
            plan={plan}
            submitLabel="Guardar cambios"
            onSaved={() => {
              void queryClient.invalidateQueries({ queryKey: ["plans"] });
              navigate("/planes");
            }}
            onCancel={() => navigate("/planes")}
            onConflict={reloadCurrent}
          />
          <div className={styles.planActions}>
            <button
              className={styles.duplicateButton}
              type="button"
              disabled={isActing}
              onClick={handleDuplicate}
            >
              Duplicar Plan
            </button>
          </div>
        </>
      )}

      {plan.status === "activo" && (
        <>
          <PlanEditor
            key={`${plan.id}-${plan.revision}-${revision}`}
            plan={plan}
            submitLabel="Guardar cambios"
            onSaved={() => {
              void queryClient.invalidateQueries({ queryKey: ["plans"] });
              navigate("/planes");
            }}
            onCancel={() => navigate("/planes")}
            onConflict={reloadCurrent}
            onRequestOmit={(training) => setConfirmTarget({ type: "omit", training })}
            onRequestRestore={(training) => {
              void runAction(() => restoreTraining(plan.id, training.id, plan.revision));
            }}
            onRequestStart={(training) => {
              startMutation.mutate({
                origin: "plan",
                planId: plan.id,
                trainingId: training.id,
              });
            }}
            startPending={startMutation.isPending}
          />
          <div className={styles.planActions}>
            <button
              className={styles.completeButton}
              type="button"
              disabled={isActing}
              onClick={() => setConfirmTarget({ type: "complete" })}
            >
              Completar Plan
            </button>
            <button
              className={styles.duplicateButton}
              type="button"
              disabled={isActing}
              onClick={handleDuplicate}
            >
              Duplicar Plan
            </button>
          </div>
        </>
      )}

      {plan.status === "completado" && (
        <>
          <PlanCompletedView plan={plan} />
          <div className={styles.planActions}>
            <button
              className={styles.duplicateButton}
              type="button"
              disabled={isActing}
              onClick={handleDuplicate}
            >
              Duplicar Plan
            </button>
          </div>
        </>
      )}

      {confirmTarget && (
        <ConfirmDialog
          title={
            confirmTarget.type === "complete"
              ? `Completar «${plan.name}»`
              : "Omitir este Entrenamiento"
          }
          description={
            confirmTarget.type === "complete"
              ? "Los días pendientes pasarán a omitidos y el Plan cerrará su calendario. Esta acción no se puede deshacer."
              : `El ${dayLabels[confirmTarget.training.day]}${
                  confirmTarget.training.plannedDate !== null
                    ? ` del ${formatDomainDate(confirmTarget.training.plannedDate)}`
                    : ""
                } quedará omitido y no podrá iniciar una Sesión hasta devolverlo a pendiente.`
          }
          confirmLabel={confirmTarget.type === "complete" ? "Completar" : "Omitir"}
          pending={isActing}
          onConfirm={() => {
            if (confirmTarget.type === "complete") {
              void runAction(() => completePlan(plan.id, plan.revision));
            } else {
              void runAction(() => omitTraining(plan.id, confirmTarget.training.id, plan.revision));
            }
          }}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </>
  );
}
