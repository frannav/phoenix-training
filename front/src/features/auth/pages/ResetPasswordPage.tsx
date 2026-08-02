import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import { FormField } from "../../../shared/ui/FormField";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { resetPassword } from "../api/auth-api";
import { resetPasswordSchema, type ResetPasswordValues } from "../validation";
import styles from "./AuthPage.module.css";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [completed, setCompleted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) return;
    setServerError(null);
    try {
      await resetPassword(token, password);
      setCompleted(true);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.code === "PASSWORD_TOO_SHORT" || error.code === "PASSWORD_TOO_LONG") {
          setError("password", { message: "La contraseña no cumple los requisitos." });
        } else {
          setServerError("El enlace no es válido o ha vencido. Solicita uno nuevo.");
        }
      } else {
        setServerError("No se pudo restablecer la contraseña. Inténtalo de nuevo.");
      }
    }
  });

  return (
    <main className={styles.page}>
      <Link className={styles.brand} to="/">
        Phoenix Training
      </Link>
      <section className={styles.card}>
        <PageIntro
          eyebrow="Cuenta"
          title="Restablecer contraseña"
          description="Elige una contraseña nueva para tu Cuenta."
        />
        {!token && (
          <div className={styles.alert} role="alert">
            <span aria-hidden="true">⚠</span>
            <p>El enlace no es válido o ha vencido. Solicita uno nuevo.</p>
            <Link className={styles.textLink} to="/recuperar">
              Recuperar contraseña
            </Link>
          </div>
        )}
        {completed && (
          <div className={styles.result} role="status">
            <span className={styles.resultIcon} aria-hidden="true">
              ✓
            </span>
            <p>Contraseña restablecida. Inicia sesión de nuevo para continuar.</p>
            <Link className={styles.textLink} to="/entrar">
              Iniciar sesión
            </Link>
          </div>
        )}
        {token && !completed && (
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <FormField
              label="Contraseña nueva"
              htmlFor="restablecer-contrasena"
              error={errors.password?.message}
            >
              <input
                id="restablecer-contrasena"
                className={styles.input}
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "restablecer-contrasena-error" : undefined}
                {...register("password")}
              />
            </FormField>
            {serverError && (
              <p className={styles.formError} role="alert">
                <span aria-hidden="true">⚠</span>
                {serverError}
              </p>
            )}
            <button className={styles.submit} type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando…" : "Restablecer contraseña"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
