import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
 * Rutina reutilizable privada de una Cuenta: plantilla compuesta por
 * Ejercicios ordenados con sus Series previstas y Objetivos de serie. La
 * revisión entera habilita la concurrencia optimista: toda sustitución
 * envía la revisión leída y recibe el documento canónico con la revisión
 * incrementada. Archivada retira la Rutina de los usos nuevos sin romper
 * las referencias existentes; no se elimina definitivamente en el MVP.
 */
export const routine = sqliteTable(
  "routine",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    revision: integer("revision").notNull().default(1),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("routine_account_idx").on(table.accountId)],
);

/**
 * Aparición de un Ejercicio dentro de una Rutina, en orden. La identidad
 * es opaca y la conserva la edición que reutiliza la misma entrada; los
 * nuevos Ejercicios reciben su identidad del servidor.
 */
export const routineExercise = sqliteTable(
  "routine_exercise",
  {
    id: text("id").primaryKey(),
    routineId: text("routine_id")
      .notNull()
      .references(() => routine.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercise.id),
    position: integer("position").notNull(),
  },
  (table) => [index("routine_exercise_routine_idx").on(table.routineId)],
);

/**
 * Objetivos de serie previstos de una aparición: carga, repeticiones y
 * duración se omiten de manera independiente y, cuando existen, cumplen
 * los límites de dominio de la Forma de registro correspondiente.
 */
export const routineSeriesGoal = sqliteTable(
  "routine_series_goal",
  {
    id: text("id").primaryKey(),
    routineExerciseId: text("routine_exercise_id")
      .notNull()
      .references(() => routineExercise.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    carga: real("carga"),
    repeticiones: integer("repeticiones"),
    duracion: integer("duracion"),
  },
  (table) => [index("routine_series_goal_exercise_idx").on(table.routineExerciseId)],
);

/**
 * Manifiesto del catálogo: fija la revisión y el checksum del snapshot de
 * origen auditado. La carga versionada verifica estos datos antes de
 * publicar cualquier Ejercicio.
 */
/**
 * RM registrado: mejor marca real de un Ejercicio declarada expresamente por
 * el Deportista, asociada a una fecha y un número de repeticiones. Pertenece
 * a la Cuenta autenticada y puede referenciar Ejercicios del catálogo o
 * personalizados, incluso si después dejan de estar disponibles para usos
 * nuevos: el Ejercicio no se elimina nunca de forma definitiva.
 *
 * El RM vigente para un Ejercicio y número de repeticiones en una fecha es
 * el registro más reciente de esa fecha o anterior. Registrar una Serie no
 * crea ni actualiza RM automáticamente: solo existen los que el Deportista
 * introduce expresamente, y la aplicación no calcula 1RM estimado.
 */
export const recordedMax = sqliteTable(
  "recorded_max",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercise.id, { onDelete: "cascade" }),
    /** Carga en kilogramos, de 0 a 9999,99 con como máximo dos decimales. */
    load: real("load").notNull(),
    /** Número de repeticiones, entero de 1 a 9999. */
    repetitions: integer("repetitions").notNull(),
    /** Fecha de dominio del RM en formato YYYY-MM-DD. */
    date: text("date").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    // Sirve a la vigencia por Ejercicio, repeticiones y fecha (WHERE cuenta,
    // ejercicio, repeticiones y fecha <= ... ORDER BY fecha DESC) y al
    // listado de la Cuenta (prefijo account_id + orden por fecha).
    index("recorded_max_account_exercise_reps_date_idx").on(
      table.accountId,
      table.exerciseId,
      table.repetitions,
      table.date,
    ),
  ],
);

/**
 * Sesión de entrenamiento del dominio. Una Sesión libre comienza sin origen;
 * más adelante podrá originarse en un Entrenamiento planificado o una Rutina.
 * Cada Cuenta puede tener como máximo una Sesión activa: el índice parcial de
 * unicidad lo garantiza en la base de datos y la transición de inicio lo
 * comprueba dentro de la misma transacción.
 */
export const trainingSession = sqliteTable(
  "training_session",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    origin: text("origin").notNull(),
    status: text("status").notNull().default("activa"),
    revision: integer("revision").notNull().default(1),
    datePerformed: text("date_performed").notNull(),
    lastExerciseId: text("last_exercise_id").references(() => exercise.id),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("training_session_single_active_idx")
      .on(table.accountId)
      .where(sql`${table.status} = 'activa'`),
  ],
);

/**
 * Aparición de un Ejercicio dentro de una Sesión. Cada aparición conserva la
 * identidad del Ejercicio añadido; las Series (tickets siguientes) colgarán
 * de la aparición. Una Sesión libre comienza sin apariciones.
 */
export const trainingSessionExercise = sqliteTable(
  "training_session_exercise",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => trainingSession.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercise.id),
    sortOrder: integer("sort_order").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("training_session_exercise_session_order_idx").on(
      table.sessionId,
      table.sortOrder,
    ),
  ],
);

export const catalogManifest = sqliteTable("catalog_manifest", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  upstreamCommit: text("upstream_commit").notNull(),
  snapshotSha256: text("snapshot_sha256").notNull(),
  reviewRevision: text("review_revision").notNull(),
  reviewedAt: text("reviewed_at").notNull(),
  importedAt: integer("imported_at", { mode: "timestamp_ms" }).notNull(),
});
