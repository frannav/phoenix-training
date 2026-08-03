import { getDatabasePath } from "../config";
import { openDatabase } from "../db/open-database";
import { loadCatalog, readCatalogAssets } from "./load-catalog";

/**
 * Carga versionada del catálogo sobre la base de datos de producción.
 * Se ejecuta expresamente tras aplicar las migraciones (`db:migrate`), nunca
 * desde réplicas concurrentes. La carga es idempotente y verifica checksum e
 * invariantes antes de publicar ningún Ejercicio.
 */
const databasePath = getDatabasePath();
const connection = openDatabase(databasePath);

try {
  const assets = await readCatalogAssets();
  const result = await loadCatalog(connection.db, assets);
  console.info(
    `Catálogo cargado en ${databasePath}: ${result.added} altas, ${result.changed} cambios, ${result.retired} retiradas.`,
  );
} catch (error) {
  console.error("No se pudo cargar el catálogo.", error);
  process.exitCode = 1;
} finally {
  connection.close();
}
