import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AccountPage } from "../features/account/pages/AccountPage";
import { AuthPage } from "../features/auth/pages/AuthPage";
import { LoginPage } from "../features/auth/pages/LoginPage";
import { RegisterPage } from "../features/auth/pages/RegisterPage";
import { VerifyPage } from "../features/auth/pages/VerifyPage";
import { HomePage } from "../features/dashboard/pages/HomePage";
import { ExercisesPage } from "../features/exercises/pages/ExercisesPage";
import { HistoryDetailPage, HistoryPage } from "../features/history/pages/HistoryPage";
import { NewPlanPage, PlanDetailPage, PlansPage } from "../features/plans/pages/PlansPage";
import {
  NewRoutinePage,
  RoutineDetailPage,
  RoutinesPage,
} from "../features/routines/pages/RoutinesPage";
import { ActiveSessionPage } from "../features/sessions/pages/ActiveSessionPage";
import { AppShell } from "./AppShell";
import "../shared/styles/global.css";

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="entrar" element={<LoginPage />} />
          <Route path="registro" element={<RegisterPage />} />
          <Route path="verificar" element={<VerifyPage />} />
          <Route
            path="recuperar"
            element={
              <AuthPage
                eyebrow="Cuenta"
                title="Recuperar contraseña"
                description="Solicita un enlace seguro para volver a entrar."
              />
            }
          />
          <Route
            path="restablecer"
            element={
              <AuthPage
                eyebrow="Cuenta"
                title="Restablecer contraseña"
                description="Elige una contraseña nueva para tu Cuenta."
              />
            }
          />
          <Route path="sesion/:sesionId" element={<ActiveSessionPage />} />
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="planes" element={<PlansPage />} />
            <Route path="planes/nuevo" element={<NewPlanPage />} />
            <Route path="planes/:planId" element={<PlanDetailPage />} />
            <Route path="rutinas" element={<RoutinesPage />} />
            <Route path="rutinas/nueva" element={<NewRoutinePage />} />
            <Route path="rutinas/:rutinaId" element={<RoutineDetailPage />} />
            <Route path="historial" element={<HistoryPage />} />
            <Route path="historial/:sesionId" element={<HistoryDetailPage />} />
            <Route path="ejercicios" element={<ExercisesPage />} />
            <Route path="cuenta" element={<AccountPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
