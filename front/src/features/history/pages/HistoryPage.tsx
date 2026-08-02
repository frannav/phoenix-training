import { EmptyFeaturePage } from "../../../shared/ui/EmptyFeaturePage";

export function HistoryPage() {
  return (
    <EmptyFeaturePage
      eyebrow="Entrenamiento"
      title="Historial"
      description="Revisa las Sesiones finalizadas y sus resultados."
    />
  );
}

export function HistoryDetailPage() {
  return (
    <EmptyFeaturePage
      eyebrow="Historial"
      title="Detalle de la Sesión"
      description="Consulta y corrige lo que quedó registrado en esta Sesión."
    />
  );
}

