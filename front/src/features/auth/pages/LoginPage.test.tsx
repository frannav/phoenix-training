import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HomePage } from "../../dashboard/pages/HomePage";
import { LoginPage } from "./LoginPage";
import { stubFetch } from "../../../test/mock-fetch";

function renderPage(initialEntries = ["/entrar"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("pantalla de entrada", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("solicita correo y contraseña", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  test("muestra confirmación al volver después de cambiar la contraseña", () => {
    renderPage(["/entrar?estado=contraseña-cambiada"]);

    expect(screen.getByRole("status")).toHaveTextContent(/Contraseña cambiada/i);
  });

  test("muestra confirmación al cerrar la sesión", () => {
    renderPage(["/entrar?estado=sesion-cerrada"]);

    expect(screen.getByRole("status")).toHaveTextContent(/Sesión cerrada/i);
  });

  test("muestra errores junto a los campos sin enviar la petición", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "no-es-un-correo");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText("Escribe un correo electrónico válido."),
    ).toBeInTheDocument();
    expect(screen.getByText("Escribe tu contraseña.")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("ofrece verificar el correo cuando la Cuenta sigue pendiente", async () => {
    const user = userEvent.setup();
    stubFetch(() => ({
      status: 403,
      body: {
        error: {
          code: "EMAIL_NOT_VERIFIED",
          message: "El correo aún no está verificado.",
        },
      },
    }));

    renderPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "deportista@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "contraseña-segura");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/aún no está verificado/i);
    expect(
      screen.getByRole("link", { name: "Verificar correo" }),
    ).toHaveAttribute("href", "/verificar");
  });

  test("informa de credenciales incorrectas sin revelar detalles", async () => {
    const user = userEvent.setup();
    stubFetch(() => ({
      status: 401,
      body: {
        error: {
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "El correo o la contraseña no son correctos.",
        },
      },
    }));

    renderPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "deportista@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "contraseña-incorrecta");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no son correctos/i);
  });

  test("inicia sesión y entra en la aplicación", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url === "/api/auth/sign-in/email") {
        return {
          status: 200,
          body: {
            user: {
              id: "cuenta-opaca",
              email: "deportista@example.com",
              emailVerified: true,
            },
          },
        };
      }
      return { status: 200, body: { status: "ok", database: "ready" } };
    });

    renderPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "deportista@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "contraseña-segura");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByRole("heading", { name: "Inicio" }),
    ).toBeInTheDocument();
  });
});
