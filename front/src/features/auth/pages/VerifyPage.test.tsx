import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { VerifyPage } from "./VerifyPage";
import { stubFetch } from "../../../test/mock-fetch";

function renderPage(initialEntries = ["/verificar"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <VerifyPage />
    </MemoryRouter>,
  );
}

describe("pantalla de verificación", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("permite solicitar un enlace nuevo introduciendo el correo", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Verificar correo" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar enlace" })).toBeInTheDocument();
  });

  test("muestra un mensaje de éxito tras verificar el correo", () => {
    renderPage(["/verificar?estado=verificado"]);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/Correo verificado/);
    expect(
      screen.getByRole("link", { name: "Iniciar sesión" }),
    ).toHaveAttribute("href", "/entrar");
  });

  test("informa de un enlace no válido y ofrece solicitar otro", () => {
    renderPage(["/verificar?estado=invalido"]);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/enlace no es válido o ha vencido/i);
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar enlace" })).toBeInTheDocument();
  });

  test("solicita un enlace nuevo sin revelar si el correo existe", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      expect(url).toBe("/api/auth/send-verification-email");
      return { status: 200, body: { status: true } };
    });

    renderPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "deportista@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/recibirás un enlace nuevo/i);
  });
});
