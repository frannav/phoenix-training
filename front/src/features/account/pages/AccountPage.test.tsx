import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthPage } from "../../auth/pages/AuthPage";
import { AccountPage } from "./AccountPage";
import { stubFetch } from "../../../test/mock-fetch";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/cuenta"]}>
      <Routes>
        <Route path="/cuenta" element={<AccountPage />} />
        <Route path="/entrar" element={<AuthPage eyebrow="Cuenta" title="Iniciar sesión" description="" />} />
      </Routes>
    </MemoryRouter>,
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
});
