import { resolve } from "node:path";
import { createApp } from "./app";
import { getDatabasePath } from "./config";
import { openDatabase } from "./db/open-database";

const databasePath = getDatabasePath();
const port = Number(process.env.PORT ?? 3000);
const frontendRoot =
  process.env.NODE_ENV === "production"
    ? resolve(process.env.FRONTEND_ROOT ?? "../front/dist")
    : undefined;
const connection = openDatabase(databasePath);

const baseUrl = process.env.APP_BASE_URL ?? `http://127.0.0.1:${port}`;
const trustedOrigins = [baseUrl];
if (process.env.NODE_ENV !== "production") {
  const frontendPort = process.env.FRONTEND_PORT ?? 5173;
  trustedOrigins.push(
    `http://127.0.0.1:${frontendPort}`,
    `http://localhost:${frontendPort}`,
  );
}

const app = createApp({
  database: connection.db,
  frontendRoot,
  auth: {
    baseUrl,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins,
  },
});

export default {
  port,
  fetch: app.fetch,
};
