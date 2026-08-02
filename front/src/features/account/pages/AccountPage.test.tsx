import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthPage } from "../../auth/pages/AuthPage";
import { AccountPage } from "./AccountPage";
import { stubFetch } from "../../../test/mock-fetch";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/cuenta"]}>
        <Routes>
          <Route path="/cuenta" element={<AccountPage />} />
          <Route path="/entrar" element={<AuthPage eyebrow="Cuenta" title="Iniciar sesión" description="" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("pantalla de Cuenta", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("ofrece cerrar la sesión actual", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Cuenta" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    ).toBeInTheDocument();
  });

  test("cierra la sesión y devuelve al Deportista a la entrada", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      expect(url).toBe("/api/auth/sign-out");
      return { status: 200, body: { success: true } };
    });

    renderPage();

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(
      await screen.findByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
  });

  test("permite cambiar la contraseña y obliga a iniciar sesión de nuevo", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      expect(url).toBe("/api/auth/change-password");
      return { status: 200, body: { status: true } };
    });

    renderPage();

    await user.type(screen.getByLabelText("Contraseña actual"), "contraseña-segura");
    await user.type(screen.getByLabelText("Contraseña nueva"), "nueva-contraseña");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  test("confirma y cierra todas las sesiones", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      expect(url).toBe("/api/auth/revoke-sessions");
      return { status: 200, body: { status: true } };
    });

    renderPage();

    await user.click(screen.getByRole("button", { name: "Cerrar todas las sesiones" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/todos tus dispositivos/i);
    await user.click(screen.getByRole("button", { name: "Confirmar cierre de todas las sesiones" }));

    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });
});
