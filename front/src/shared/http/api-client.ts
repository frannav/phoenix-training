import { z } from "zod";

const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export class ApiRequestError extends Error {
  readonly code: string;
  readonly fields?: Record<string, string[]>;

  constructor({ code, message, fields }: { code: string; message: string; fields?: Record<string, string[]> }) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.fields = fields;
  }
}

async function apiFetch<T>(path: string, { headers, ...init }: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...headers,
    },
  });

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(await response.json());
    if (parsedError.success) {
      throw new ApiRequestError(parsedError.data.error);
    }
    throw new ApiRequestError({
      code: "REQUEST_FAILED",
      message: "La petición ha fallado.",
    });
  }

  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, {});
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}
