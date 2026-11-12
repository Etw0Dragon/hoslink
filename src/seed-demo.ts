import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { fakerFR as faker } from "@faker-js/faker";
import { hashPassword } from "better-auth/crypto";
import { database, transaction } from "./db/index.js";

const DEFAULT_PASSWORD = process.env.DEMO_SEED_PASSWORD;
const MAX_EACH_KIND = 25;
const categories = ["spa", "ski", "activite", "autre"] as const;
const destinations = [
  ["Annecy", "Annecy"],
  ["Biarritz", "Biarritz"],
  ["Lyon", "Lyon"],
  ["Nice", "Nice"],
  ["Strasbourg", "Strasbourg"],
  ["Tours", "Tours"],
] as const;

export type DemoKind = "hotel" | "provider";
export type DemoRecord = {
  kind: DemoKind;
  number: number;
  name: string;
  company: string;
  city: string;
  address: string;
  category: string;
  station: string;
  email: string;
  siren: string;
  siret: string;
};

export function parseCounts(args: string[]) {
  const values = new Map<string, number>();
  for (const arg of args) {
    const match = /^--(hotels|providers)=(\d+)$/.exec(arg);
    if (!match || values.has(match[1]!)) throw new Error(`Argument invalide : ${arg}`);
    const count = Number(match[2]);
    if (count < 0 || count > MAX_EACH_KIND) throw new Error(`Chaque quantité doit être entre 0 et ${MAX_EACH_KIND}`);
    values.set(match[1]!, count);
  }
  const hotels = values.get("hotels") ?? 0;
  const providers = values.get("providers") ?? 0;
  if (hotels + providers < 1) throw new Error("Indiquez au moins --hotels=1 ou --providers=1");
  return { hotels, providers };
}

export function makeDemoRecord(kind: DemoKind, number: number): DemoRecord {
  const [station, city] = faker.helpers.arrayElement(destinations);
  const siren = faker.string.numeric(9);
  const serial = faker.string.numeric(5);
  const suffix = String(number).padStart(2, "0");
  return {
    kind,
    number,
    name: kind === "hotel" ? `Hôtel ${faker.company.name()}` : `${faker.company.name()} ${faker.helpers.arrayElement(["Bien-être", "Loisirs", "Mobilité", "Gastronomie"])}`,
    company: faker.company.name(),
    city,
    station,
    address: faker.location.streetAddress(),
    category: kind === "hotel" ? "hotel" : faker.helpers.arrayElement(categories),
    email: `hoslink-demo-${kind}-${suffix}@example.invalid`,
    siren,
    siret: `${siren}${serial}`,
  };
}

function targetConfirmation(databaseUrl: string) {
  const target = new URL(databaseUrl);
  return `${target.hostname}/${target.pathname.replace(/^\//, "")}`;
}

export async function seedDemo(env: NodeJS.ProcessEnv, args: string[]) {
  const databaseUrl = env.DATABASE_URL;
  const password = env.DEMO_SEED_PASSWORD;
  if (!databaseUrl) throw new Error("DATABASE_URL obligatoire");
  if (!password || password.length < 12 || password.length > 72)
    throw new Error("DEMO_SEED_PASSWORD obligatoire (12 à 72 caractères)");
  const { hotels, providers } = parseCounts(args.filter((arg) => !arg.startsWith("--confirm-production=")));
  const nodeEnv = env.NODE_ENV ?? "development";
  if (nodeEnv === "production" || nodeEnv === "test-prod") {
    const expected = `--confirm-production=${targetConfirmation(databaseUrl)}`;
    if (!args.includes(expected)) throw new Error(`Cible protégée. Pour confirmer, relancer avec ${expected}`);
  }

  const { pool } = database(databaseUrl);
  try {
    const created = await transaction(pool, async (tx) => {
      const inserted: string[] = [];
      const records = [
        ...Array.from({ length: hotels }, (_, i) => makeDemoRecord("hotel", i + 1)),
        ...Array.from({ length: providers }, (_, i) => makeDemoRecord("provider", i + 1)),
      ];
      for (const record of records) {
        const email = record.email;
        const existing = await tx.query("SELECT 1 FROM auth_user WHERE email=$1", [email]);
        if (existing.rowCount) continue;
        const userId = randomUUID();
        const passwordHash = await hashPassword(password);
        await tx.query(
          "INSERT INTO auth_user(id,name,email,email_verified) VALUES($1,$2,$3,true)",
          [userId, faker.person.fullName(), email],
        );
        await tx.query(
          "INSERT INTO auth_account(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$2,$3)",
          [randomUUID(), userId, passwordHash],
        );
        const profile = await tx.query<{ id: string }>(
          "INSERT INTO profiles(auth_user_id) VALUES($1) RETURNING id",
          [userId],
        );
        const company = await tx.query<{ id: string }>(
          "INSERT INTO companies(siren,name) VALUES($1,$2) RETURNING id",
          [record.siren, record.company],
        );
        const establishment = await tx.query<{ id: string }>(
          `INSERT INTO establishments(company_id,siret,name,category,station,city,address,description,status)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,'approved') RETURNING id`,
          [company.rows[0]!.id, record.siret, record.name, record.category, record.station, record.city, record.address, faker.company.catchPhrase()],
        );
        await tx.query("INSERT INTO memberships(user_id,establishment_id,role) VALUES($1,$2,'owner')", [profile.rows[0]!.id, establishment.rows[0]!.id]);
        await tx.query("UPDATE profiles SET current_establishment_id=$1 WHERE id=$2", [establishment.rows[0]!.id, profile.rows[0]!.id]);
        inserted.push(`${email} (${record.category}, ${record.city})`);
      }
      return inserted;
    });
    return created;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const created = await seedDemo(process.env, process.argv.slice(2));
    console.log(`Comptes de démonstration créés : ${created.length}`);
    for (const row of created) console.log(row);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
