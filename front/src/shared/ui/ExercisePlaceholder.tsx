import styles from "./ExercisePlaceholder.module.css";

/**
 * Placeholder común para los Ejercicios: el catálogo no redistribuye los JPG
 * y GIF del origen mientras no exista una licencia propia, así que el selector
 * identifica cada Ejercicio con este marcador sin depender de medios externos.
 */
export function ExercisePlaceholder() {
  return (
    <span className={styles.placeholder} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6.5 6.5h11v11h-11z" />
        <path d="m8 8 8 8" />
        <path d="m16 8-8 8" />
      </svg>
    </span>
  );
}
