import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { AppDatabase } from "./open-database";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function migrateDatabase(database: AppDatabase): Promise<void> {
  await migrate(database, { migrationsFolder });
}

