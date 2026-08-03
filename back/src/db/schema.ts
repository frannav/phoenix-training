import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Formas de registro del dominio: determinan qué magnitudes se prescriben y
 * registran para un Ejercicio. Una vez publicado o utilizado, la Forma de
 * registro de un Ejercicio no cambia.
 */
export const recordingModes = [
  "fuerza_con_carga",
  "repeticiones_sin_carga",
  "tiempo_por_serie",
  "cardio_continuo",
] as const;

export type RecordingMode = (typeof recordingModes)[number];

export function isRecordingMode(value: string): value is RecordingMode {
  return (recordingModes as readonly string[]).includes(value);
}

export const appMetadata = sqliteTable("app_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * Tablas de Better Auth: la Cuenta (usuario), sus sesiones, las cuentas de
 * credenciales (correo y contraseña) y los tokens de verificación internos
 * del sistema de autenticación.
 */
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Enlace de verificación de correo de un solo uso emitido por el dominio.
 * El token original nunca se persiste: solo su resumen SHA-256, de modo que
 * un enlace vencido, usado o sustituido no puede verificar la Cuenta.
 */
export const verificationToken = sqliteTable("verification_token", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
});

export const passwordResetToken = sqliteTable("password_reset_token", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
});

/**
 * Ejercicio del catálogo o personalizado. Un Ejercicio del catálogo no
 * pertenece a ninguna Cuenta (`account_id` nulo) y conserva su procedencia:
 * fuente, identificador upstream y revisión de origen. Un Ejercicio
 * personalizado pertenece a una Cuenta y no tiene identidad externa.
 *
 * La combinación (source, upstream_id) es única, pero ninguna entidad del
 * dominio la utiliza como referencia: Rutinas, Planes y Sesiones guardan el
 * identificador interno opaco `id`.
 */
export const exercise = sqliteTable(
  "exercise",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").references(() => user.id, { onDelete: "cascade" }),
    source: text("source"),
    upstreamId: text("upstream_id"),
    sourceRevision: text("source_revision"),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    instructions: text("instructions").notNull(),
    recordingMode: text("recording_mode").notNull(),
    category: text("category").notNull(),
    bodyPart: text("body_part"),
    equipment: text("equipment"),
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    // A lo sumo un Ejercicio publicable por fuente e identificador upstream:
    // una corrección incompatible retira el anterior (available = 0) antes de
    // publicar la nueva identidad, y las filas retiradas conservan su fila.
    uniqueIndex("exercise_source_upstream_unique")
      .on(table.source, table.upstreamId)
      .where(sql`${table.available} = 1`),
    index("exercise_available_name_idx").on(table.available, table.name),
  ],
);

/**
 * Manifiesto del catálogo: fija la revisión y el checksum del snapshot de
 * origen auditado. La carga versionada verifica estos datos antes de
 * publicar cualquier Ejercicio.
 */
export const catalogManifest = sqliteTable("catalog_manifest", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  upstreamCommit: text("upstream_commit").notNull(),
  snapshotSha256: text("snapshot_sha256").notNull(),
  reviewRevision: text("review_revision").notNull(),
  reviewedAt: text("reviewed_at").notNull(),
  importedAt: integer("imported_at", { mode: "timestamp_ms" }).notNull(),
});
