import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiRequestError } from "../../../shared/http/api-client";
import {
  activeSessionQueryKey,
  getActiveSession,
  startSession,
  type SessionStartInput,
} from "./sessions-api";

/**
 * Inicia una Sesión desde su Origen de sesión —una Rutina o un Entrenamiento
 * planificado pendiente— o libre y la abre directamente en su pantalla. Si la
 * Cuenta ya tiene una Sesión activa, el servidor responde un conflicto
 * recuperable con su identificador y este hook conduce a esa Sesión en lugar
 * de crear otra, tal como exige la unicidad de la Sesión activa por Cuenta.
 */
export function useStartSession() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SessionStartInput) => startSession(input),
    onSuccess: ({ session }) => {
      void queryClient.setQueryData(activeSessionQueryKey, { session });
      navigate(`/sesion/${session.id}`);
    },
    onError: async (error) => {
      if (error instanceof ApiRequestError && error.code === "ACTIVE_SESSION_EXISTS") {
        try {
          // Lectura directa: la caché puede conservar la ausencia previa
          // dentro de su ventana de frescura.
          const current = await getActiveSession();
          void queryClient.setQueryData(activeSessionQueryKey, current);
          if (current.session) {
            navigate(`/sesion/${current.session.id}`);
          }
        } catch {
          // Sin conexión: la página conserva su estado y muestra el error.
        }
      }
    },
  });
}
