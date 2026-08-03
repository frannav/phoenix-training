import { useNavigate } from "react-router-dom";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { PlanEditor } from "../components/PlanEditor";

export function NewPlanPage() {
  const navigate = useNavigate();

  return (
    <>
      <PageIntro
        eyebrow="Planes"
        title="Nuevo Plan"
        description="Prepara un Plan borrador con semanas y Entrenamientos planificados antes de asignarle fechas."
      />
      <PlanEditor
        submitLabel="Crear Plan"
        onSaved={(plan) => navigate(`/planes/${plan.id}`)}
        onCancel={() => navigate("/planes")}
      />
    </>
  );
}
