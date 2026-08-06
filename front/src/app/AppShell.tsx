import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { formatDomainDate } from "../shared/format";
import {
  activeSessionQueryKey,
  getActiveSession,
  sessionProgressLabel,
  sessionTitle,
} from "../features/sessions/api/sessions-api";
import type { SessionDocument } from "../features/sessions/api/sessions-api";
import styles from "./AppShell.module.css";

const mobileDestinations = [
  { to: "/", label: "Inicio", end: true },
  { to: "/planes", label: "Planes" },
  { to: "/rutinas", label: "Rutinas" },
] as const;

const desktopGroups = [
  {
    label: "General",
    destinations: [{ to: "/", label: "Inicio", end: true }],
  },
  {
    label: "Organizar",
    destinations: [
      { to: "/planes", label: "Planes" },
      { to: "/rutinas", label: "Rutinas" },
    ],
  },
  {
    label: "Entrenamiento",
    destinations: [
      { to: "/diario", label: "Diario" },
      { to: "/ejercicios", label: "Ejercicios" },
    ],
  },
] as const;

function sessionContextLabel(session: SessionDocument) {
  const originLabel =
    session.origin === "plan"
      ? "Entrenamiento planificado"
      : session.origin === "rutina"
        ? "Entrenamiento desde una Rutina"
        : "Entrenamiento libre";

  return `${originLabel} · ${formatDomainDate(session.datePerformed)}`;
}

export function AppShell() {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const location = useLocation();
  const activeSession = useQuery({
    queryKey: activeSessionQueryKey,
    queryFn: getActiveSession,
    retry: false,
  });
  const session = activeSession.data?.session ?? null;
  const showSessionAccess = session !== null && location.pathname !== "/";

  return (
    <div className={styles.appShell}>
      <header className={styles.mobileHeader}>
        <div>
          <span className={styles.mobileKicker}>FIELD LOG / 01</span>
          <strong className={styles.mobileBrand}>Phoenix Training</strong>
        </div>
        <span className={styles.mobileSignal} aria-label="Sistema operativo">
          ● LIVE
        </span>
      </header>
      <aside className={styles.desktopSidebar}>
        <div className={styles.brandBlock}>
          <span className={styles.brandKicker}>FIELD LOG / 01</span>
          <strong className={styles.brand}>Phoenix Training</strong>
          <span className={styles.brandCaption}>Control room for your training</span>
        </div>
        <nav className={styles.desktopNavigation} aria-label="Navegación de escritorio">
          {desktopGroups.map((group) => (
            <section key={group.label}>
              <p>{group.label}</p>
              {group.destinations.map(({ to, label, ...linkProps }) => (
                <NavLink key={to} to={to} {...linkProps}>
                  {label}
                </NavLink>
              ))}
            </section>
          ))}
          <NavLink className={styles.accountDestination} to="/cuenta">
            Cuenta
          </NavLink>
        </nav>
      </aside>
      <div>
        <main className={styles.pageContent}>
          {showSessionAccess && session && (
            <section className={styles.sessionAccess} aria-label="Sesión activa">
              <div className={styles.sessionAccessCopy}>
                <span className={styles.sessionAccessName}>{sessionTitle(session)}</span>
                <span className={styles.sessionAccessContext}>
                  {sessionContextLabel(session)}
                </span>
              </div>
              <span className={styles.sessionAccessProgress}>
                {sessionProgressLabel(session)}
              </span>
              <Link className={styles.sessionAccessContinue} to={`/sesion/${session.id}`}>
                Continuar
              </Link>
            </section>
          )}
          <Outlet />
        </main>
      </div>
      <nav className={styles.mobileNavigation} aria-label="Navegación móvil">
        {mobileDestinations.map(({ to, label, ...linkProps }) => (
          <NavLink key={to} to={to} {...linkProps}>
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={isMoreOpen}
          onClick={() => setIsMoreOpen((isOpen) => !isOpen)}
        >
          Más
        </button>
      </nav>
      {isMoreOpen && (
        <section
          className={styles.moreDestinations}
          role="dialog"
          aria-label="Más destinos"
          aria-modal="true"
        >
          <div className={styles.moreHeader}>
            <p className={styles.moreLabel}>Más destinos</p>
            <button
              className={styles.closeMore}
              type="button"
              aria-label="Cerrar"
              onClick={() => setIsMoreOpen(false)}
            >
              ×
            </button>
          </div>
          <Link to="/diario" onClick={() => setIsMoreOpen(false)}>
            Diario
          </Link>
          <Link to="/ejercicios" onClick={() => setIsMoreOpen(false)}>
            Ejercicios
          </Link>
          <Link to="/cuenta" onClick={() => setIsMoreOpen(false)}>
            Cuenta
          </Link>
        </section>
      )}
    </div>
  );
}
