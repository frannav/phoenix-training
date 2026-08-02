type EmptyFeaturePageProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function EmptyFeaturePage({ eyebrow, title, description }: EmptyFeaturePageProps) {
  return (
    <>
      <PageIntro eyebrow={eyebrow} title={title} description={description} />
      <section className={styles.emptyState} aria-label={`${title}: destino preparado`}>
        <span className={styles.icon} aria-hidden="true">
          ✓
        </span>
        <div className={styles.copy}>
          <h2>Destino preparado</h2>
          <p>El comportamiento de esta área se incorporará en los siguientes tickets.</p>
        </div>
      </section>
    </>
  );
}
import styles from "./EmptyFeaturePage.module.css";
import { PageIntro } from "./PageIntro";

