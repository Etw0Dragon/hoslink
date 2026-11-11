import {
  pgTable,
  text,
  boolean,
  timestamp,
  index,
  integer,
  bigserial,
  bigint,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";
export const user = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
});
export const session = pgTable("auth_session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
export const account = pgTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const verification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const twoFactor = pgTable("auth_two_factor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  verified: boolean("verified").default(true),
  failedVerificationCount: integer("failed_verification_count").default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const companies = pgTable("companies", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  siren: text("siren").notNull().unique(),
  name: text("name").notNull(),
});
export const establishments = pgTable("establishments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  companyId: bigint("company_id", { mode: "number" })
    .notNull()
    .references(() => companies.id),
  siret: text("siret").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  station: text("station").notNull(),
  city: text("city").notNull(),
  address: text("address").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("pending"),
  purchasedSlots: integer("purchased_slots").notNull().default(0),
  subscriptionUntil: timestamp("subscription_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const profiles = pgTable("profiles", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  authUserId: text("auth_user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  admin: boolean("admin").notNull().default(false),
  currentEstablishmentId: bigint("current_establishment_id", {
    mode: "number",
  }).references(() => establishments.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const memberships = pgTable(
  "memberships",
  {
    userId: bigint("user_id", { mode: "number" }).references(() => profiles.id),
    establishmentId: bigint("establishment_id", { mode: "number" }).references(
      () => establishments.id,
    ),
    role: text("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.establishmentId] })],
);
export const conversations = pgTable("conversations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  a: bigint("a", { mode: "number" })
    .notNull()
    .references(() => establishments.id),
  b: bigint("b", { mode: "number" })
    .notNull()
    .references(() => establishments.id),
  subject: text("subject").notNull(),
  quote: boolean("quote").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const messages = pgTable("messages", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  conversationId: bigint("conversation_id", { mode: "number" })
    .notNull()
    .references(() => conversations.id),
  senderId: bigint("sender_id", { mode: "number" })
    .notNull()
    .references(() => profiles.id),
  establishmentId: bigint("establishment_id", { mode: "number" })
    .notNull()
    .references(() => establishments.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
export const attachments = pgTable("attachments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  messageId: bigint("message_id", { mode: "number" })
    .notNull()
    .references(() => messages.id),
  name: text("name").notNull(),
  data: bytea("data").notNull(),
});
export const partnerships = pgTable("partnerships", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  a: bigint("a", { mode: "number" })
    .notNull()
    .references(() => establishments.id),
  b: bigint("b", { mode: "number" })
    .notNull()
    .references(() => establishments.id),
  status: text("status").notNull().default("pending"),
  version: integer("version").notNull().default(1),
  acceptedA: boolean("accepted_a").notNull().default(false),
  acceptedB: boolean("accepted_b").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
});
export const partnershipVersions = pgTable(
  "partnership_versions",
  {
    partnershipId: bigint("partnership_id", { mode: "number" }).references(
      () => partnerships.id,
    ),
    version: integer("version").notNull(),
    terms: text("terms").notNull(),
    authorId: bigint("author_id", { mode: "number" })
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.partnershipId, t.version] })],
);
export const retainedPartnerships = pgTable(
  "retained_partnerships",
  {
    establishmentId: bigint("establishment_id", { mode: "number" }).references(
      () => establishments.id,
    ),
    partnershipId: bigint("partnership_id", { mode: "number" }).references(
      () => partnerships.id,
    ),
  },
  (t) => [primaryKey({ columns: [t.establishmentId, t.partnershipId] })],
);
export const tokens = pgTable("tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).references(() => profiles.id, {
    onDelete: "cascade",
  }),
  kind: text("kind").notNull(),
  establishmentId: bigint("establishment_id", { mode: "number" }).references(
    () => establishments.id,
  ),
  email: text("email"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const audit = pgTable("audit", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).references(() => profiles.id),
  action: text("action").notNull(),
  entityId: bigint("entity_id", { mode: "number" }).notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
