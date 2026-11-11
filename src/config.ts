import { z } from "zod";
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const c = z
    .object({
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
      DATABASE_URL: z.string().url(),
      BASE_URL: z.string().url().default("http://localhost:8080"),
      BETTER_AUTH_SECRET: z.string().min(32),
      PORT: z.coerce.number().int().min(1).max(65535).default(8080),
      SMTP_URL: z.preprocess(
        (v) => (v === "" ? undefined : v),
        z.string().url().optional(),
      ),
      MAIL_FROM: z.string().email().default("noreply@hoslink.tmfolio.site"),
      MAIL_DIR: z.string().default("var/mail"),
    })
    .parse(env);
  const base = new URL(c.BASE_URL);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw new Error("BASE_URL doit être une origine HTTP(S) sans chemin");
  c.BASE_URL = base.origin;
  if (!["postgres:", "postgresql:"].includes(new URL(c.DATABASE_URL).protocol))
    throw new Error("DATABASE_URL doit être une URL PostgreSQL");
  if (c.SMTP_URL && !["smtp:", "smtps:"].includes(new URL(c.SMTP_URL).protocol))
    throw new Error("SMTP_URL doit être une URL SMTP(S)");
  if (
    c.NODE_ENV === "production" &&
    (!c.BASE_URL.startsWith("https://") || !c.SMTP_URL)
  )
    throw new Error("HTTPS et SMTP_URL obligatoires en production");
  return c;
}
export type Config = ReturnType<typeof readConfig>;
