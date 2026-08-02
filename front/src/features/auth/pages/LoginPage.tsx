import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import { FormField } from "../../../shared/ui/FormField";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { getSession, sessionQueryKey, signIn } from "../api/auth-api";
import { loginSchema, type LoginValues } from "../validation";
import styles from "./AuthPage.module.css";

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingVerification, setPendingVerification] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setPendingVerification(false);
    try {
      await signIn(values);
      try {
        const currentSession = await getSession();
        queryClient.setQueryData(sessionQueryKey, currentSession);
      } catch {
        // Sin datos frescos: se descarta la caché para que el guard vuelva a
        // comprobar la sesión con el servidor al entrar, sin rebote.
        queryClient.removeQueries({ queryKey: sessionQueryKey });
      }
      navigate("/", { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.code === "EMAIL_NOT_VERIFIED") {
          setPendingVerification(true);
        } else if (error.code === "INVALID_EMAIL_OR_PASSWORD") {
          setServerError("El correo o la contraseña no son correctos.");
        } else if (error.code === "VALIDATION_ERROR") {
          setError("email", { message: "Escribe un correo electrónico válido." });
        } else {
          setServerError(error.message);
        }
      } else {
        setServerError("No se pudo iniciar sesión. Inténtalo de nuevo.");
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
          title="Iniciar sesión"
          description="Accede a tu entrenamiento desde este dispositivo."
        />
        {pendingVerification && (
          <div className={styles.alert} role="alert">
            <span aria-hidden="true">✉</span>
            <p>
              <strong>Tu correo aún no está verificado.</strong> Revisa tu buzón o
              solicita un enlace nuevo.
            </p>
          </div>
        )}
        {serverError && (
          <div className={styles.alert} role="alert">
            <span aria-hidden="true">⚠</span>
            <p>{serverError}</p>
          </div>
        )}
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <FormField
            label="Correo electrónico"
            htmlFor="entrar-correo"
            error={errors.email?.message}
          >
            <input
              id="entrar-correo"
              className={styles.input}
              type="email"
              autoComplete="email"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "entrar-correo-error" : undefined}
              {...register("email")}
            />
          </FormField>
          <FormField
            label="Contraseña"
            htmlFor="entrar-contrasena"
            error={errors.password?.message}
          >
            <input
              id="entrar-contrasena"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "entrar-contrasena-error" : undefined}
              {...register("password")}
            />
          </FormField>
          <button className={styles.submit} type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className={styles.switchLink}>
          ¿Todavía sin Cuenta?{" "}
          <Link className={styles.textLink} to="/registro">
            Crear cuenta
          </Link>
        </p>
        {pendingVerification && (
          <p className={styles.switchLink}>
            <Link className={styles.textLink} to="/verificar">
              Verificar correo
            </Link>
          </p>
        )}
      </section>
    </main>
  );
}
