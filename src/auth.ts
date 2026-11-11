import { and, eq, like } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import type { database } from "./db/index.js";
import type { Config } from "./config.js";
import { mailer } from "./mail.js";
import * as schema from "./db/schema.js";
export const TRUST_DEVICE_DAYS = 30;
export async function forgetTrustedDevices(
  db: ReturnType<typeof database>["db"],
  userId: string,
) {
  await db
    .delete(schema.verification)
    .where(
      and(
        eq(schema.verification.value, userId),
        like(schema.verification.identifier, "trust-device-%"),
      ),
    );
}
export function createAuth(c: Config, db: ReturnType<typeof database>["db"]) {
  const send = mailer(c);
  return betterAuth({
    appName: "Hoslink",
    baseURL: c.BASE_URL,
    basePath: "/api/auth",
    secret: c.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    trustedOrigins: [c.BASE_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 72,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => forgetTrustedDevices(db, user.id),
      sendResetPassword: async ({ user, url }) =>
        send(user.email, "Réinitialiser votre mot de passe", url),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) =>
        send(user.email, "Confirmez votre adresse", url),
    },
    session: { expiresIn: 7 * 86400, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: c.NODE_ENV === "production" },
    rateLimit: { enabled: c.NODE_ENV !== "test", window: 60, max: 100 },
    plugins: [
      twoFactor({
        issuer: "Hoslink",
        skipVerificationOnEnable: false,
        trustDeviceMaxAge: TRUST_DEVICE_DAYS * 86400,
      }),
    ],
  });
}
export type Auth = ReturnType<typeof createAuth>;
