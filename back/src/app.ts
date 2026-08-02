import { Hono } from "hono";
import { extname, join, resolve, sep } from "node:path";
import { z } from "zod";
import { appMetadata } from "./db/schema";
import type { AppDatabase } from "./db/open-database";
import { apiError } from "./http/api-error";

type AppDependencies = {
  database: AppDatabase;
  frontendRoot?: string;
};

export function createApp({ database, frontendRoot }: AppDependencies): Hono {
  const app = new Hono();
  const healthQuery = z.object({}).strict();

  app.get("/api/health", async (context) => {
    if (!healthQuery.safeParse(context.req.query()).success) {
      return context.json(apiError("INVALID_REQUEST", "La petición no es válida."), 400);
    }

    await database.select({ key: appMetadata.key }).from(appMetadata).limit(1);

    return context.json({
      status: "ok",
      database: "ready",
    });
  });

  if (frontendRoot) {
    const resolvedFrontendRoot = resolve(frontendRoot);

    app.get("*", async (context) => {
      if (context.req.path === "/api" || context.req.path.startsWith("/api/")) {
        return context.notFound();
      }

      const requestedPath = resolve(
        resolvedFrontendRoot,
        `.${decodeURIComponent(context.req.path)}`,
      );
      const staysInsideFrontendRoot =
        requestedPath === resolvedFrontendRoot ||
        requestedPath.startsWith(`${resolvedFrontendRoot}${sep}`);

      if (staysInsideFrontendRoot) {
        const asset = Bun.file(requestedPath);

        if (await asset.exists()) {
          return new Response(asset);
        }
      }

      if (extname(context.req.path)) {
        return context.notFound();
      }

      const index = Bun.file(join(resolvedFrontendRoot, "index.html"));
      return (await index.exists()) ? new Response(index) : context.notFound();
    });
  }

  app.notFound((context) => {
    if (context.req.path === "/api" || context.req.path.startsWith("/api/")) {
      return context.json(
        apiError("NOT_FOUND", "El recurso solicitado no existe."),
        404,
      );
    }

    return context.text("Not Found", 404);
  });

  return app;
}
