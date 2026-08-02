import { EmptyFeaturePage } from "../../../shared/ui/EmptyFeaturePage";

export function RoutinesPage() {
  return (
    <EmptyFeaturePage
      eyebrow="Organizar"
      title="Rutinas"
      description="Crea estructuras de entrenamiento que puedas reutilizar."
    />
  );
}

export function NewRoutinePage() {
  return (
    <EmptyFeaturePage
      eyebrow="Rutinas"
      title="Nueva Rutina"
      description="Define Ejercicios y Objetivos de serie para una nueva Rutina."
    />
  );
}

export function RoutineDetailPage() {
  return (
    <EmptyFeaturePage
      eyebrow="Rutinas"
      title="Detalle de la Rutina"
      description="Consulta o modifica esta estructura reutilizable."
    />
  );
}

