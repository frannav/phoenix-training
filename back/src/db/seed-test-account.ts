import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "./open-database";
import { account, user } from "./schema";

/**
 * Cuenta fija para trabajar contra la SQLite local sin tener que registrarla
 * manualmente. No se usa desde la aplicación: se ejecuta expresamente con
 * `bun run db:seed`.
 */
export const testAccount = {
  userId: "test-user-phoenix-training",
  accountId: "test-account-phoenix-training",
  name: "Deportista",
  email: "deportista@example.com",
  password: "contraseña-segura",
} as const;

export type SeedTestAccountResult = "created" | "already-existed";

/**
 * Crea la cuenta de desarrollo una sola vez y conserva cualquier cambio
 * posterior que se haga sobre ella. La contraseña nunca se persiste en claro:
 * Better Auth recibe el mismo formato de hash que usa el registro normal.
 */
export async function seedTestAccount(
  database: AppDatabase,
  now = new Date(),
): Promise<SeedTestAccountResult> {
  return database.transaction(async (transaction) => {
    const existingUserById = await transaction
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, testAccount.userId))
      .get();
    const existingUserByEmail = await transaction
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testAccount.email))
      .get();

    if (existingUserByEmail && existingUserByEmail.id !== testAccount.userId) {
      throw new Error(
        `No se puede sembrar ${testAccount.email}: ya pertenece a otra Cuenta.`,
      );
    }

    if (existingUserById && existingUserById.email !== testAccount.email) {
      throw new Error(
        `No se puede sembrar ${testAccount.userId}: ya pertenece a otra dirección de correo.`,
      );
    }

    if (!existingUserById) {
      await transaction.insert(user).values({
        id: testAccount.userId,
        name: testAccount.name,
        email: testAccount.email,
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingCredential = await transaction
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, testAccount.userId), eq(account.providerId, "credential")))
      .get();

    if (existingCredential) {
      return "already-existed";
    }

    await transaction.insert(account).values({
      id: testAccount.accountId,
      accountId: testAccount.userId,
      providerId: "credential",
      userId: testAccount.userId,
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
      password: await hashPassword(testAccount.password),
      createdAt: now,
      updatedAt: now,
    });

    return "created";
  });
}
