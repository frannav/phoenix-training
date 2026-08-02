import { EmptyFeaturePage } from "../../../shared/ui/EmptyFeaturePage";

export function PlansPage() {
  return (
    <EmptyFeaturePage
      eyebrow="Organizar"
      title="Planes"
      description="Prepara y sigue tus Planes de entrenamiento."
    />
  );
}

export function NewPlanPage() {
  return (
    <EmptyFeaturePage
      eyebrow="Planes"
      title="Nuevo Plan"
      description="Prepara un Plan borrador antes de llevarlo al calendario."
    />
  );
}

export function PlanDetailPage() {
  return (
    <EmptyFeaturePage
      eyebrow="Planes"
      title="Detalle del Plan"
      description="Consulta y adapta el estado vigente de este Plan."
    />
  );
}

