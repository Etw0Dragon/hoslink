import { z } from "zod";
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const c = z
    .object({
      NODE_ENV: z
        .enum(["development", "test", "production", "test-prod"])
        .default("development"),
      DATABASE_URL: z.string().url(),
      BASE_URL: z.string().url().default("http://localhost:8080"),
      BETTER_AUTH_SECRET: z.string().min(32),
      PORT: z.coerce.number().int().min(1).max(65535).default(8080),
      CLAMAV_HOST: z.string().min(1).default("127.0.0.1"),
      CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
      GEOCODER_URL: z.string().url().refine((url) => url.startsWith("https://"), "HTTPS requis").default("https://nominatim.openstreetmap.org/search"),
      MAP_TILE_URL: z.string().url().refine((url) => url.startsWith("https://"), "HTTPS requis").default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
      MAP_TILE_ATTRIBUTION: z.string().min(1).max(300).default("© OpenStreetMap contributors"),
      SMTP_URL: z.preprocess(
        (v) => (v === "" ? undefined : v),
        z.string().url().optional(),
      ),
      MAIL_FROM: z.string().email().default("noreply@hoslink.tmfolio.site"),
      MAIL_DIR: z.string().default("var/mail"),
      STRIPE_SECRET_KEY: z.preprocess(v => v || undefined, z.string().regex(/^sk_test_/).optional()),
      STRIPE_WEBHOOK_SECRET: z.preprocess(v => v || undefined, z.string().regex(/^whsec_/).optional()),
      STRIPE_SLOT_PRICE_ID: z.preprocess(v => v || undefined, z.string().regex(/^price_/).optional()),
      STRIPE_SUBSCRIPTION_PRICE_ID: z.preprocess(v => v || undefined, z.string().regex(/^price_/).optional()),
      STRIPE_TEST_TAX_RATE_ID: z.preprocess(v => v || undefined, z.string().regex(/^txr_/).optional()),
      STRIPE_PORTAL_CONFIGURATION_ID: z.preprocess(v => v || undefined, z.string().regex(/^bpc_/).optional()),
    })
    .parse(env);
  const stripeValues = [c.STRIPE_SECRET_KEY, c.STRIPE_WEBHOOK_SECRET, c.STRIPE_SLOT_PRICE_ID, c.STRIPE_SUBSCRIPTION_PRICE_ID, c.STRIPE_TEST_TAX_RATE_ID, c.STRIPE_PORTAL_CONFIGURATION_ID];
  if (stripeValues.some(Boolean) && !stripeValues.every(Boolean)) throw new Error("Configuration Stripe sandbox incomplète");
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
    ["production", "test-prod"].includes(c.NODE_ENV) &&
    (!c.BASE_URL.startsWith("https://") || !c.SMTP_URL)
  )
    throw new Error("HTTPS et SMTP_URL obligatoires en production");
  return c;
}
export type Config = ReturnType<typeof readConfig>;
