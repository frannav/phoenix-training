import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { migrateDatabase } from "../src/db/migrate";
import { openDatabase, type DatabaseConnection } from "../src/db/open-database";

describe("GET /api/health", () => {
  let connection: DatabaseConnection | undefined;
  let temporaryDirectory: string | undefined;

  afterEach(async () => {
    connection?.close();

    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true });
    }
  });

  test("responds through an API backed by a database created with production migrations", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "phoenix-training-"));
    connection = openDatabase(join(temporaryDirectory, "test.sqlite"));
    await migrateDatabase(connection.db);

    const response = await createApp({ database: connection.db }).request("/api/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      status: "ok",
      database: "ready",
    });
  });

  test("uses the common error format for an invalid request", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "phoenix-training-"));
    connection = openDatabase(join(temporaryDirectory, "test.sqlite"));
    await migrateDatabase(connection.db);

    const response = await createApp({ database: connection.db }).request(
      "/api/health?unexpected=true",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "La petición no es válida.",
      },
    });
  });

  test("uses the common error format for an unknown API route", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "phoenix-training-"));
    connection = openDatabase(join(temporaryDirectory, "test.sqlite"));
    await migrateDatabase(connection.db);

    const response = await createApp({ database: connection.db }).request(
      "/api/does-not-exist",
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "El recurso solicitado no existe.",
      },
    });
  });
});
