import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { user, verificationToken } from "../db/schema";
import type { AppDatabase } from "../db/open-database";

export type VerificationTokenOutcome = "success" | "invalid" | "expired";

export function createVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type IssueVerificationTokenInput = {
  userId: string;
  email: string;
  now: Date;
  lifetimeMs: number;
};

/**
 * Emite un enlace de un solo uso para una Cuenta pendiente. Emitir uno nuevo
 * invalida todos los anteriores de la misma dirección: se eliminan antes de
 * insertar, de modo que un enlace sustituido deja de poder verificar.
 */
export async function issueVerificationToken(
  database: AppDatabase,
  { userId, email, now, lifetimeMs }: IssueVerificationTokenInput,
): Promise<string> {
  const rawToken = createVerificationToken();
  const expiresAt = new Date(now.getTime() + lifetimeMs);

  await database.transaction(async (tx) => {
    await tx.delete(verificationToken).where(eq(verificationToken.email, email));
    await tx.insert(verificationToken).values({
      tokenHash: hashVerificationToken(rawToken),
      userId,
      email,
      createdAt: now,
      expiresAt,
      usedAt: null,
    });
  });

  return rawToken;
}

export type ConsumeVerificationTokenInput = {
  rawToken: string;
  now: Date;
};

/**
 * Intenta verificar la Cuenta con un enlace. Un enlace desconocido, vencido o
 * ya usado produce un resultado fallido sin exponer el motivo; solo un enlace
 * vigente y sin usar verifica la Cuenta y queda marcado como usado.
 */
export async function consumeVerificationToken(
  database: AppDatabase,
  { rawToken, now }: ConsumeVerificationTokenInput,
): Promise<VerificationTokenOutcome> {
  const tokenHash = hashVerificationToken(rawToken);
  const record = await database
    .select()
    .from(verificationToken)
    .where(eq(verificationToken.tokenHash, tokenHash))
    .get();

  if (!record) {
    return "invalid";
  }

  if (record.usedAt !== null) {
    return "invalid";
  }

  if (record.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }

  const outcome: VerificationTokenOutcome = await database.transaction(async (tx) => {
    const pending = await tx
      .select()
      .from(verificationToken)
      .where(
        and(
          eq(verificationToken.tokenHash, tokenHash),
          isNull(verificationToken.usedAt),
        ),
      )
      .get();

    if (!pending || pending.expiresAt.getTime() <= now.getTime()) {
      return "invalid";
    }

    await tx
      .update(user)
      .set({ emailVerified: true, updatedAt: now })
      .where(eq(user.id, pending.userId));
    await tx
      .update(verificationToken)
      .set({ usedAt: now })
      .where(eq(verificationToken.tokenHash, tokenHash));

    return "success";
  });

  return outcome;
}
