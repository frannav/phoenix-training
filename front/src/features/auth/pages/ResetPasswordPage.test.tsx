import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stubFetch } from "../../../test/mock-fetch";
import { ResetPasswordPage } from "./ResetPasswordPage";

describe("pantalla de restablecimiento", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("establece una contraseña desde el token y confirma que debe volver a entrar", async () => {
    const user = userEvent.setup();
    stubFetch((url, init) => {
      expect(url).toBe("/api/auth/reset-password");
      expect(JSON.parse(String(init.body))).toEqual({
        token: "token-opaco",
        newPassword: "nueva-contraseña",
      });
      return { status: 200, body: { status: true } };
    });

    render(
      <MemoryRouter initialEntries={["/restablecer?token=token-opaco"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Contraseña nueva"), "nueva-contraseña");
    await user.click(screen.getByRole("button", { name: "Restablecer contraseña" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/Inicia sesión de nuevo/i);
  });

  test("sin token no ofrece enviar una contraseña", () => {
    render(
      <MemoryRouter initialEntries={["/restablecer"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/enlace no es válido/i);
    expect(screen.queryByRole("button", { name: "Restablecer contraseña" })).not.toBeInTheDocument();
  });
});
