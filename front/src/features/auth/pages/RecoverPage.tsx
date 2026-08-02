import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import { FormField } from "../../../shared/ui/FormField";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { requestPasswordReset } from "../api/auth-api";
import { requestLinkSchema, type RequestLinkValues } from "../validation";
import styles from "./AuthPage.module.css";

export function RecoverPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RequestLinkValues>({ resolver: zodResolver(requestLinkSchema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "VALIDATION_ERROR") {
        setError("email", { message: "Escribe un correo electrónico válido." });
      } else {
        setServerError("No se pudo solicitar el enlace. Inténtalo de nuevo.");
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
          title="Recuperar contraseña"
          description="Solicita un enlace seguro para volver a entrar."
        />
        {sent ? (
          <div className={styles.result} role="status">
            <span className={styles.resultIcon} aria-hidden="true">
              ✉
            </span>
            <p>Si el correo existe, recibirás instrucciones para recuperar el acceso.</p>
            <Link className={styles.textLink} to="/entrar">
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <FormField
              label="Correo electrónico"
              htmlFor="recuperar-correo"
              error={errors.email?.message}
            >
              <input
                id="recuperar-correo"
                className={styles.input}
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "recuperar-correo-error" : undefined}
                {...register("email")}
              />
            </FormField>
            {serverError && (
              <p className={styles.formError} role="alert">
                <span aria-hidden="true">⚠</span>
                {serverError}
              </p>
            )}
            <button className={styles.submit} type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Enviando…" : "Enviar enlace"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
