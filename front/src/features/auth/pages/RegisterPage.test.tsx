import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RegisterPage } from "./RegisterPage";
import { stubFetch } from "../../../test/mock-fetch";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/registro"]}>
      <RegisterPage />
    </MemoryRouter>,
  );
}

describe("pantalla de registro", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("solicita únicamente correo y contraseña", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Crear cuenta" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Crear cuenta" }),
    ).toBeInTheDocument();
  });

  test("muestra errores junto a los campos sin enviar la petición", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "no-es-un-correo");
    await user.type(screen.getByLabelText("Contraseña"), "corta");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(
      await screen.findByText("Escribe un correo electrónico válido."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("La contraseña debe tener al menos 8 caracteres."),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("registra la Cuenta y muestra un mensaje genérico de verificación", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_input)).toBe("/api/auth/sign-up/email");
      const body = JSON.parse(String(init?.body)) as {
        email: string;
        password: string;
        name: string;
      };
      expect(body).toEqual({
        email: "deportista@example.com",
        password: "contraseña-segura",
        name: "deportista",
      });
      return new Response(
        JSON.stringify({
          token: null,
          user: {
            id: "cuenta-opaca",
            email: "deportista@example.com",
            emailVerified: false,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "deportista@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "contraseña-segura");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/Revisa tu correo electrónico/);
    expect(
      screen.getByRole("link", { name: "Solicitar otro enlace" }),
    ).toHaveAttribute("href", "/verificar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("muestra junto al campo el error de contraseña devuelto por el servidor", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      expect(url).toBe("/api/auth/sign-up/email");
      return {
        status: 400,
        body: {
          error: {
            code: "PASSWORD_TOO_SHORT",
            message: "La contraseña debe tener al menos 8 caracteres.",
          },
        },
      };
    });

    renderPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "deportista@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "contraseña-segura");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    const errorMessage = await screen.findByText(
      "La contraseña debe tener al menos 8 caracteres.",
    );
    expect(errorMessage).toBeInTheDocument();
    const passwordInput = screen.getByLabelText("Contraseña");
    expect(passwordInput).toHaveAttribute("aria-invalid", "true");
  });
});
