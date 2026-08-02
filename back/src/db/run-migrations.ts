import { getDatabasePath } from "../config";
import { migrateDatabase } from "./migrate";
import { openDatabase } from "./open-database";

const databasePath = getDatabasePath();
const connection = openDatabase(databasePath);

try {
  await migrateDatabase(connection.db);
  console.info(`Migraciones aplicadas en ${databasePath}`);
} finally {
  connection.close();
}
