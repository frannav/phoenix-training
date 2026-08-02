import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubFetch } from "../../../test/mock-fetch";
import { RecoverPage } from "./RecoverPage";

describe("pantalla de recuperación", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("permite solicitar un enlace con una respuesta genérica", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      expect(url).toBe("/api/auth/request-password-reset");
      return { status: 200, body: { status: true } };
    });

    render(
      <MemoryRouter initialEntries={["/recuperar"]}>
        <RecoverPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Correo electrónico"), "deportista@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/Si el correo existe/i);
    expect(screen.getByRole("link", { name: "Volver a iniciar sesión" })).toHaveAttribute(
      "href",
      "/entrar",
    );
  });
});
