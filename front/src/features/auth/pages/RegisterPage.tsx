import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import { FormField } from "../../../shared/ui/FormField";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { registerAccount } from "../api/auth-api";
import { registerSchema, type RegisterValues } from "../validation";
import styles from "./AuthPage.module.css";

export function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await registerAccount(values);
      setRegistered(true);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.code === "PASSWORD_TOO_SHORT" || error.code === "PASSWORD_TOO_LONG") {
          setError("password", { message: error.message });
        } else if (error.code === "VALIDATION_ERROR") {
          setError("email", { message: "Escribe un correo electrónico válido." });
        } else {
          setServerError(error.message);
        }
      } else {
        setServerError("No se pudo completar el registro. Inténtalo de nuevo.");
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
          title="Crear cuenta"
          description="Crea una Cuenta privada para guardar tu entrenamiento."
        />
        {registered ? (
          <div className={styles.result} role="status">
            <span className={styles.resultIcon} aria-hidden="true">
              ✉
            </span>
            <p>
              <strong>Revisa tu correo electrónico</strong> para completar la
              verificación. Si no recibes el enlace, puedes solicitar otro.
            </p>
            <Link className={styles.textLink} to="/verificar">
              Solicitar otro enlace
            </Link>
          </div>
        ) : (
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <FormField
              label="Correo electrónico"
              htmlFor="registro-correo"
              error={errors.email?.message}
            >
              <input
                id="registro-correo"
                className={styles.input}
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "registro-correo-error" : undefined}
                {...register("email")}
              />
            </FormField>
            <FormField
              label="Contraseña"
              htmlFor="registro-contrasena"
              error={errors.password?.message}
            >
              <input
                id="registro-contrasena"
                className={styles.input}
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={
                  errors.password ? "registro-contrasena-error" : undefined
                }
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
              {isSubmitting ? "Creando cuenta…" : "Crear cuenta"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
