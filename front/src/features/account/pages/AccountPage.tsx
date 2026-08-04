import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import { FormField } from "../../../shared/ui/FormField";
import { PageIntro } from "../../../shared/ui/PageIntro";
import {
  changePassword,
  deleteAccount,
  revokeAllSessions,
  sessionQueryKey,
  signOut,
} from "../../auth/api/auth-api";
import {
  changePasswordSchema,
  type ChangePasswordValues,
} from "../../auth/validation";
import styles from "./AccountPage.module.css";

export function AccountPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordValues>({ resolver: zodResolver(changePasswordSchema) });

  const handleSignOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
      queryClient.setQueryData(sessionQueryKey, null);
      queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      navigate("/entrar?estado=sesion-cerrada", { replace: true });
    } catch {
      setError("No se pudo cerrar la sesión. Inténtalo de nuevo.");
      setSigningOut(false);
    }
  };

  const handleChangePassword = handleSubmit(async ({ currentPassword, password }) => {
    setError(null);
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, password);
      queryClient.setQueryData(sessionQueryKey, null);
      reset();
      navigate("/entrar?estado=contraseña-cambiada", { replace: true });
    } catch (requestError) {
      setChangingPassword(false);
      if (requestError instanceof ApiRequestError) {
        if (requestError.code === "INVALID_PASSWORD") {
          setFieldError("currentPassword", { message: "La contraseña actual no es correcta." });
        } else if (requestError.code === "PASSWORD_TOO_SHORT" || requestError.code === "PASSWORD_TOO_LONG") {
          setFieldError("password", { message: "La contraseña no cumple los requisitos." });
        } else {
          setError(requestError.message);
        }
      } else {
        setError("No se pudo cambiar la contraseña. Inténtalo de nuevo.");
      }
    }
  });

  const handleRevokeAllSessions = async () => {
    setError(null);
    setConfirmingRevoke(false);
    try {
      await revokeAllSessions();
      queryClient.setQueryData(sessionQueryKey, null);
      navigate("/entrar?estado=sesiones-cerradas", { replace: true });
    } catch {
      setError("No se pudieron cerrar todas las sesiones. Inténtalo de nuevo.");
    }
  };

  const handleDeleteAccount = async () => {
    setDeletePasswordError(null);
    setDeleteError(null);
    setDeletingAccount(true);
    try {
      await deleteAccount(deletePassword);
      queryClient.setQueryData(sessionQueryKey, null);
      navigate("/entrar?estado=cuenta-eliminada", { replace: true });
    } catch (requestError) {
      setDeletingAccount(false);
      if (requestError instanceof ApiRequestError) {
        if (requestError.code === "INVALID_PASSWORD") {
          setDeletePasswordError("La contraseña actual no es correcta.");
        } else {
          setDeleteError(requestError.message);
        }
      } else {
        setDeleteError("No se pudo eliminar la Cuenta. Inténtalo de nuevo.");
      }
    }
  };

  return (
    <>
      <PageIntro
        eyebrow="Preferencias"
        title="Cuenta"
        description="Gestiona tus credenciales y las sesiones de tus dispositivos."
      />
      <section className={styles.section} aria-label="Sesión actual">
        <h2 className={styles.heading}>Sesión actual</h2>
        <p className={styles.copy}>
          Cerrar la sesión revoca solo este dispositivo y no afecta a tus otras
          sesiones.
        </p>
        <button
          className={styles.signOut}
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
        </button>
        {error && (
          <p className={styles.error} role="alert">
            <span aria-hidden="true">⚠</span>
            {error}
          </p>
        )}
      </section>
      <section className={styles.section} aria-labelledby="contrasena-heading">
        <h2 id="contrasena-heading" className={styles.heading}>
          Cambiar contraseña
        </h2>
        <form className={styles.form} onSubmit={handleChangePassword} noValidate>
          <FormField
            label="Contraseña actual"
            htmlFor="cuenta-contrasena-actual"
            error={errors.currentPassword?.message}
          >
            <input
              id="cuenta-contrasena-actual"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.currentPassword ? true : undefined}
              {...register("currentPassword")}
            />
          </FormField>
          <FormField
            label="Contraseña nueva"
            htmlFor="cuenta-contrasena-nueva"
            error={errors.password?.message}
          >
            <input
              id="cuenta-contrasena-nueva"
              className={styles.input}
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              {...register("password")}
            />
          </FormField>
          <p className={styles.copy}>
            Al cambiarla se cerrarán todas las sesiones y tendrás que iniciar sesión de nuevo.
          </p>
          <button className={styles.signOut} type="submit" disabled={changingPassword}>
            {changingPassword ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </form>
      </section>
      <section className={styles.section} aria-labelledby="sesiones-heading">
        <h2 id="sesiones-heading" className={styles.heading}>
          Todos los dispositivos
        </h2>
        <p className={styles.copy}>
          Cierra todas las sesiones abiertas, incluida la de este dispositivo.
        </p>
        <button
          className={styles.dangerButton}
          type="button"
          onClick={() => setConfirmingRevoke(true)}
        >
          Cerrar todas las sesiones
        </button>
        {confirmingRevoke && (
          <div className={styles.confirmation} role="alertdialog" aria-labelledby="confirmar-sesiones">
            <p id="confirmar-sesiones">¿Quieres cerrar las sesiones de todos tus dispositivos?</p>
            <div className={styles.confirmationActions}>
              <button className={styles.signOut} type="button" onClick={() => setConfirmingRevoke(false)}>
                Cancelar
              </button>
              <button className={styles.dangerButton} type="button" onClick={handleRevokeAllSessions}>
                Confirmar cierre de todas las sesiones
              </button>
            </div>
          </div>
        )}
      </section>
      <section className={styles.section} aria-labelledby="eliminar-heading">
        <h2 id="eliminar-heading" className={styles.heading}>
          Eliminar cuenta
        </h2>
        <p className={styles.copy}>
          Eliminar la Cuenta borra definitivamente tus credenciales, sesiones,
          Rutinas, Planes, Sesiones, Ejercicios personalizados y RM registrados.
          Los Ejercicios del catálogo compartido se conservan. No existe periodo
          de gracia ni restauración.
        </p>
        <button
          className={styles.dangerButton}
          type="button"
          onClick={() => {
            setError(null);
            setDeletePasswordError(null);
            setDeleteError(null);
            setDeletePassword("");
            setDeleteConfirmed(false);
            setConfirmingDelete(true);
          }}
        >
          Eliminar mi cuenta
        </button>
        {confirmingDelete && (
          <div
            className={styles.confirmation}
            role="alertdialog"
            aria-labelledby="confirmar-eliminar"
          >
            <p id="confirmar-eliminar" className={styles.copy}>
              <strong>Esta acción es definitiva e irreversible.</strong> Se
              eliminarán para siempre tu Cuenta, sus credenciales, sus sesiones,
              tus Rutinas, Planes, Sesiones, Ejercicios personalizados y RM
              registrados. No existe periodo de gracia, restauración ni borrado
              diferido.
            </p>
            <FormField
              label="Contraseña para eliminar la Cuenta"
              htmlFor="cuenta-eliminar-contrasena"
              error={deletePasswordError ?? undefined}
            >
              <input
                id="cuenta-eliminar-contrasena"
                className={styles.input}
                type="password"
                autoComplete="current-password"
                aria-invalid={deletePasswordError ? true : undefined}
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </FormField>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(event) => setDeleteConfirmed(event.target.checked)}
              />
              Entiendo que esta acción es definitiva e irreversible y que no
              podré recuperar mi Cuenta ni mis datos.
            </label>
            {deleteError && (
              <p className={styles.error} role="alert">
                <span aria-hidden="true">⚠</span>
                {deleteError}
              </p>
            )}
            <div className={styles.confirmationActions}>
              <button
                className={styles.signOut}
                type="button"
                disabled={deletingAccount}
                onClick={() => {
                  setDeletePassword("");
                  setDeleteConfirmed(false);
                  setDeletePasswordError(null);
                  setDeleteError(null);
                  setConfirmingDelete(false);
                }}
              >
                Cancelar
              </button>
              <button
                className={styles.dangerButton}
                type="button"
                disabled={
                  deletingAccount || deletePassword.length === 0 || !deleteConfirmed
                }
                onClick={handleDeleteAccount}
              >
                {deletingAccount
                  ? "Eliminando…"
                  : "Eliminar mi cuenta definitivamente"}
              </button>
            </div>
          </div>
        )}
      </section>
      </>
  );
}
