import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { migrateDatabase } from "../src/db/migrate";
import { openDatabase, type DatabaseConnection } from "../src/db/open-database";

describe("production site", () => {
  let connection: DatabaseConnection | undefined;
  let temporaryDirectory: string | undefined;

  afterEach(async () => {
    connection?.close();

    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true });
    }
  });

  test("serves frontend routes and the API from the same app", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "phoenix-training-site-"));
    const frontendRoot = join(temporaryDirectory, "dist");
    await mkdir(frontendRoot);
    await writeFile(join(frontendRoot, "index.html"), "<main>Phoenix Training</main>");

    connection = openDatabase(join(temporaryDirectory, "test.sqlite"));
    await migrateDatabase(connection.db);
    const app = createApp({ database: connection.db, frontendRoot });

    const pageResponse = await app.request("/planes/plan-opaco");
    const apiResponse = await app.request("/api/health");

    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain("Phoenix Training");
    expect(apiResponse.headers.get("content-type")).toContain("application/json");
  });
});
