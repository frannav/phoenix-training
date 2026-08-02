import { Link } from "react-router-dom";
import { PageIntro } from "../../../shared/ui/PageIntro";
import styles from "./AuthPage.module.css";

type AuthPageProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function AuthPage({ eyebrow, title, description }: AuthPageProps) {
  return (
    <main className={styles.page}>
      <Link className={styles.brand} to="/">
        Phoenix Training
      </Link>
      <section className={styles.card}>
        <PageIntro eyebrow={eyebrow} title={title} description={description} />
        <p className={styles.comingSoon}>El flujo estará disponible en un próximo paso.</p>
      </section>
    </main>
  );
}
