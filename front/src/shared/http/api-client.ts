import { z } from "zod";

const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(await response.json());
    throw new Error(
      parsedError.success ? parsedError.data.error.message : "La petición ha fallado.",
    );
  }

  return (await response.json()) as T;
}
