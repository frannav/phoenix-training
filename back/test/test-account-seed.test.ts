import { verifyPassword } from "better-auth/crypto";
import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { migrateDatabase } from "../src/db/migrate";
import { openDatabase, type DatabaseConnection } from "../src/db/open-database";
import { seedTestAccount, testAccount } from "../src/db/seed-test-account";
import { account, user } from "../src/db/schema";

describe("Cuenta de prueba local", () => {
  let connection: DatabaseConnection | undefined;

  afterEach(() => {
    connection?.close();
    connection = undefined;
  });

  test("crea una Cuenta verificada con credenciales compatibles con Better Auth", async () => {
    connection = openDatabase(":memory:");
    await migrateDatabase(connection.db);

    expect(await seedTestAccount(connection.db, new Date("2026-01-01T00:00:00.000Z"))).toBe(
      "created",
    );

    const seededUser = await connection.db
      .select()
      .from(user)
      .where(eq(user.id, testAccount.userId))
      .get();
    const seededAccount = await connection.db
      .select({ password: account.password })
      .from(account)
      .where(eq(account.id, testAccount.accountId))
      .get();

    expect(seededUser).toMatchObject({
      name: testAccount.name,
      email: testAccount.email,
      emailVerified: true,
    });
    expect(seededAccount?.password).toBeDefined();
    expect(seededAccount?.password).not.toBe(testAccount.password);
    expect(
      await verifyPassword({ hash: seededAccount!.password!, password: testAccount.password }),
    ).toBe(true);
    expect(await seedTestAccount(connection.db)).toBe("already-existed");
  });
});
