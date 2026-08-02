import { Database as SQLiteDatabase } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

export type AppDatabase = BunSQLiteDatabase<typeof schema>;

export type DatabaseConnection = {
  db: AppDatabase;
  close: () => void;
};

export function openDatabase(path: string): DatabaseConnection {
  if (path !== ":memory:") {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }

  const sqlite = new SQLiteDatabase(path, { create: true, strict: true });

  sqlite.exec("PRAGMA busy_timeout = 5000");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec("PRAGMA journal_mode = WAL");

  return {
    db: drizzle(sqlite, { schema }),
    close: () => sqlite.close(),
  };
}
