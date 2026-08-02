import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";
import { getSession } from "../features/auth/api/auth-api";
import styles from "./RequireAccount.module.css";

/**
 * Guard de las rutas privadas: una persona anónima o una Cuenta pendiente de
 * verificación se devuelven a la entrada; solo una Cuenta verificada accede.
 */
export function RequireAccount() {
  const session = useQuery({
    queryKey: ["account", "session"],
    queryFn: getSession,
    retry: false,
  });

  if (session.isPending) {
    return (
      <main className={styles.loading} role="status">
        Comprobando sesión…
      </main>
    );
  }

  if (!session.data?.user?.emailVerified) {
    return <Navigate to="/entrar" replace />;
  }

  return <Outlet />;
}
