import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { getPlan, planStatusLabels } from "../api/plans-api";
import { PlanEditor } from "../components/PlanEditor";
import styles from "./PlansPage.module.css";

export function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [revision, setRevision] = useState(0);

  const planQuery = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => getPlan(planId ?? ""),
    retry: false,
  });

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

  return (
    <>
      <PageIntro
        eyebrow="Planes"
        title={plan.name}
        description={`${planStatusLabels[plan.status]} · la edición sustituye el agregado completo del Plan.`}
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
    </>
  );
}
