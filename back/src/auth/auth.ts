import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { account, session, user, verification } from "../db/schema";
import type { AppDatabase } from "../db/open-database";
import type { MailAdapter } from "../mail/mail-adapter";
import { issueVerificationToken } from "./verification-tokens";

export type AuthDependencies = {
  database: AppDatabase;
  baseUrl: string;
  appBaseUrl?: string;
  secret?: string;
  trustedOrigins?: string[];
  mailAdapter: MailAdapter;
  verificationTokenLifetimeMs: number;
  now: () => Date;
};

export function createAuth({
  database,
  baseUrl,
  appBaseUrl = baseUrl,
  secret,
  trustedOrigins,
  mailAdapter,
  verificationTokenLifetimeMs,
  now,
}: AuthDependencies) {
  return betterAuth({
    appName: "Phoenix Training",
    baseURL: baseUrl,
    secret,
    trustedOrigins,
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    emailVerification: {
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user: pendingUser }) => {
        const token = await issueVerificationToken(database, {
          userId: pendingUser.id,
          email: pendingUser.email,
          now: now(),
          lifetimeMs: verificationTokenLifetimeMs,
        });
        await mailAdapter.sendVerificationEmail({
          to: pendingUser.email,
          url: `${appBaseUrl}/api/auth/verify-email?token=${token}`,
        });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
    },
  });
}
