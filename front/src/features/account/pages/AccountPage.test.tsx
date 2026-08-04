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

  test("ofrece eliminar la Cuenta tras una advertencia explícita e irreversible", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(/irreversible/i);
    expect(dialog).toHaveTextContent(/definitiva/i);
    expect(dialog).toHaveTextContent(/no existe periodo de gracia/i);
    expect(screen.getByLabelText("Contraseña para eliminar la Cuenta")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  test("exige la contraseña y la confirmación antes de permitir la eliminación", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));

    const confirmButton = screen.getByRole("button", {
      name: "Eliminar mi cuenta definitivamente",
    });
    expect(confirmButton).toBeDisabled();

    await user.type(
      screen.getByLabelText("Contraseña para eliminar la Cuenta"),
      "contraseña-segura",
    );
    expect(confirmButton).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(confirmButton).toBeEnabled();
  });

  test("al cancelar y reabrir, la eliminación exige volver a introducir la contraseña y confirmar", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
    await user.type(
      screen.getByLabelText("Contraseña para eliminar la Cuenta"),
      "contraseña-segura",
    );
    await user.click(screen.getByRole("checkbox"));
    expect(
      screen.getByRole("button", { name: "Eliminar mi cuenta definitivamente" }),
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));

    expect(
      screen.getByLabelText("Contraseña para eliminar la Cuenta"),
    ).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Eliminar mi cuenta definitivamente" }),
    ).toBeDisabled();
  });

  test("elimina la Cuenta con la contraseña y la confirmación y devuelve a la entrada", async () => {
    const user = userEvent.setup();
    let deleteBody: unknown = null;
    stubFetch((url, init) => {
      expect(url).toBe("/api/account");
      expect(init.method).toBe("DELETE");
      deleteBody = JSON.parse(String(init.body));
      return { status: 200, body: { status: true } };
    });

    renderPage();

    await user.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
    await user.type(
      screen.getByLabelText("Contraseña para eliminar la Cuenta"),
      "contraseña-segura",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Eliminar mi cuenta definitivamente" }));

    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(deleteBody).toEqual({ password: "contraseña-segura", confirmed: true });
  });

  test("una contraseña incorrecta muestra el error junto al campo y no elimina", async () => {
    const user = userEvent.setup();
    stubFetch(() => ({
      status: 400,
      body: {
        error: {
          code: "INVALID_PASSWORD",
          message: "La contraseña actual no es correcta.",
        },
      },
    }));

    renderPage();

    await user.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
    await user.type(
      screen.getByLabelText("Contraseña para eliminar la Cuenta"),
      "contraseña-equivocada",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Eliminar mi cuenta definitivamente" }));

    expect(
      await screen.findByText("La contraseña actual no es correcta."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cuenta" })).toBeInTheDocument();
  });

  test("evita dobles envíos mientras la operación está en curso", async () => {
    const user = userEvent.setup();
    let resolveDelete: (value: { status: number; body: unknown }) => void = () => {};
    stubFetch((url) => {
      expect(url).toBe("/api/account");
      return new Promise((resolve) => {
        resolveDelete = resolve;
      });
    });

    renderPage();

    await user.click(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
    await user.type(
      screen.getByLabelText("Contraseña para eliminar la Cuenta"),
      "contraseña-segura",
    );
    await user.click(screen.getByRole("checkbox"));
    const confirmButton = screen.getByRole("button", {
      name: "Eliminar mi cuenta definitivamente",
    });
    await user.click(confirmButton);

    const pendingButton = screen.getByRole("button", { name: "Eliminando…" });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();

    resolveDelete({ status: 200, body: { status: true } });
    expect(
      await screen.findByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
  });
});
