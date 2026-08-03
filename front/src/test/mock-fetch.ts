import { vi } from "vitest";

export type MockedResponse = {
  status: number;
  body: unknown;
};

export type FetchHandler = (
  url: string,
  init: RequestInit,
) => MockedResponse | Promise<MockedResponse>;

/**
 * Sustituye el contrato HTTP en el límite de la funcionalidad: el test
 * responde a rutas concretas sin replicar las reglas del dominio. El handler
 * puede devolver un valor síncrono o una promesa, lo que permite observar
 * estados intermedios de la interfaz (p. ej. «Guardando…»).
 */
export function stubFetch(handler: FetchHandler): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const { status, body } = await handler(url, init ?? {});
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}
