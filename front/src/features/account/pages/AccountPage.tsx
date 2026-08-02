import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageIntro } from "../../../shared/ui/PageIntro";
import { sessionQueryKey, signOut } from "../../auth/api/auth-api";
import styles from "./AccountPage.module.css";

export function AccountPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
      queryClient.setQueryData(sessionQueryKey, null);
      queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      navigate("/entrar", { replace: true });
    } catch {
      setError("No se pudo cerrar la sesión. Inténtalo de nuevo.");
      setSigningOut(false);
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
    </>
  );
}
