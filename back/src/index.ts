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
const app = createApp({ database: connection.db, frontendRoot });

export default {
  port,
  fetch: app.fetch,
};
