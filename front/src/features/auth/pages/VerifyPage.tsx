import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import { FormField } from "../../../shared/ui/FormField";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { requestVerificationLink } from "../api/auth-api";
import { requestLinkSchema, type RequestLinkValues } from "../validation";
import styles from "./AuthPage.module.css";

export function VerifyPage() {
  const [searchParams] = useSearchParams();
  const estado = searchParams.get("estado");
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RequestLinkValues>({ resolver: zodResolver(requestLinkSchema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    setSent(false);
    try {
      await requestVerificationLink(email);
      setSent(true);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.code === "VALIDATION_ERROR") {
          setError("email", { message: "Escribe un correo electrónico válido." });
        } else {
          setServerError(error.message);
        }
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
          eyebrow="Cuenta pendiente de verificación"
          title="Verificar correo"
          description="Confirma tu dirección para acceder a tus datos de entrenamiento."
        />
        {estado === "verificado" && (
          <div className={styles.result} role="status">
            <span className={styles.resultIcon} aria-hidden="true">
              ✓
            </span>
            <p>
              <strong>Correo verificado.</strong> Ya puedes iniciar sesión con tu
              correo y contraseña.
            </p>
            <Link className={styles.textLink} to="/entrar">
              Iniciar sesión
            </Link>
          </div>
        )}
        {estado === "invalido" && (
          <div className={styles.alert} role="alert">
            <span aria-hidden="true">⚠</span>
            <p>
              <strong>El enlace no es válido o ha vencido.</strong> Solicita uno
              nuevo con tu correo.
            </p>
          </div>
        )}
        {sent || estado === "verificado" ? null : (
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <FormField
              label="Correo electrónico"
              htmlFor="verificar-correo"
              error={errors.email?.message}
            >
              <input
                id="verificar-correo"
                className={styles.input}
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "verificar-correo-error" : undefined}
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
        {sent && (
          <div className={styles.result} role="status">
            <span className={styles.resultIcon} aria-hidden="true">
              ✉
            </span>
            <p>
              Si el correo está registrado y pendiente de verificación, recibirás
              un enlace nuevo.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
