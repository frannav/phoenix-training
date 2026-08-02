import { Link } from "react-router-dom";
import { PageIntro } from "../../../shared/ui/PageIntro";
import styles from "./ActiveSessionPage.module.css";

export function ActiveSessionPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link to="/">← Volver a Inicio</Link>
      </header>
      <section className={styles.content}>
        <PageIntro
          eyebrow="Entrenamiento en curso"
          title="Sesión activa"
          description="Esta pantalla completa alojará el registro rápido de Ejercicios y Series."
        />
      </section>
    </main>
  );
}
