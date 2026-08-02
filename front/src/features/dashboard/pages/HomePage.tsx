import { useQuery } from "@tanstack/react-query";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { getSystemHealth } from "../api/get-system-health";
import styles from "./HomePage.module.css";

export function HomePage() {
  const health = useQuery({
    queryKey: ["system", "health"],
    queryFn: getSystemHealth,
    retry: false,
  });

  return (
    <>
      <PageIntro
        eyebrow="Tu entrenamiento"
        title="Inicio"
        description="Todo preparado para decidir qué entrenar hoy."
      />
      <p className={styles.status} role="status">
        {health.isPending && "Conectando con el servidor…"}
        {health.isSuccess && "Aplicación conectada"}
        {health.isError && "No se pudo conectar con el servidor"}
      </p>
    </>
  );
}
