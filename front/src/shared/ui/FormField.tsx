import type { ReactNode } from "react";
import styles from "./FormField.module.css";

type FormFieldProps = {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
};

export function FormField({ label, htmlFor, error, children }: FormFieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className={styles.error}>
          <span className={styles.errorIcon} aria-hidden="true">
            ⚠
          </span>
          {error}
        </p>
      )}
    </div>
  );
}
