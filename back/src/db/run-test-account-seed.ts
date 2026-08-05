import { getDatabasePath } from "../config";
import { openDatabase } from "./open-database";
import { seedTestAccount, testAccount } from "./seed-test-account";

const databasePath = getDatabasePath();
const connection = openDatabase(databasePath);

try {
  const result = await seedTestAccount(connection.db);
  console.info(
    `Cuenta de prueba ${result === "created" ? "creada" : "ya existente"} en ${databasePath}: ${testAccount.email}`,
  );
} catch (error) {
  console.error("No se pudo crear la cuenta de prueba.", error);
  process.exitCode = 1;
} finally {
  connection.close();
}
