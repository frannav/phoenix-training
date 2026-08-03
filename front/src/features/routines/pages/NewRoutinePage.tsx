import { useNavigate } from "react-router-dom";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { RoutineEditor } from "../components/RoutineEditor";

export function NewRoutinePage() {
  const navigate = useNavigate();

  return (
    <>
      <PageIntro
        eyebrow="Rutinas"
        title="Nueva Rutina"
        description="Define los Ejercicios ordenados y los Objetivos de serie que reutilizarás."
      />
      <RoutineEditor
        submitLabel="Crear Rutina"
        onSaved={(routine) => navigate(`/rutinas/${routine.id}`)}
        onCancel={() => navigate("/rutinas")}
      />
    </>
  );
}
