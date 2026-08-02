import { apiGet, apiPost } from "../../../shared/http/api-client";

export type AccountUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

export type SignUpResult = {
  token: string | null;
  user: AccountUser;
};

export type SignInResult = {
  user: AccountUser;
};

export type CurrentSession = {
  session: { id: string; expiresAt: string; userId: string };
  user: AccountUser;
} | null;

/**
 * Clave de consulta compartida de la sesión de Cuenta: el guard, la entrada y
 * Cuenta leen y actualizan el mismo valor en la caché de TanStack Query.
 */
export const sessionQueryKey = ["account", "session"] as const;

/**
 * El registro público solicita únicamente correo y contraseña; Better Auth
 * exige un nombre, así que se deriva de la parte local del correo sin
 * mostrarlo en la interfaz.
 */
export function registerAccount(values: {
  email: string;
  password: string;
}): Promise<SignUpResult> {
  const name = values.email.split("@")[0] || "Deportista";
  return apiPost<SignUpResult>("/api/auth/sign-up/email", { ...values, name });
}

export function requestVerificationLink(email: string): Promise<{ status: boolean }> {
  return apiPost<{ status: boolean }>("/api/auth/send-verification-email", { email });
}

export function signIn(values: { email: string; password: string }): Promise<SignInResult> {
  return apiPost<SignInResult>("/api/auth/sign-in/email", values);
}

export function signOut(): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>("/api/auth/sign-out", {});
}

export function getSession(): Promise<CurrentSession> {
  return apiGet<CurrentSession>("/api/auth/get-session");
}
