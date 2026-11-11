import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type pg from "pg";
import { database } from "./index.js";
export async function migrate(pool: pg.Pool) {
  const tx = await pool.connect();
  try {
    await tx.query("SELECT pg_advisory_lock(18001111)");
    // Never attach the new application to the previous Go database.
    const old = await tx.query(
      "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users' AND table_type='BASE TABLE') AS found",
    );
    if (old.rows[0].found)
      throw new Error(
        "Ancienne base Go détectée : créez une nouvelle base vide",
      );
    await tx.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(`migrations/${name}`, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await tx.query(
        "SELECT checksum FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum)
          throw new Error(`Migration modifiée : ${name}`);
        continue;
      }
      await tx.query("BEGIN");
      try {
        await tx.query(sql);
        await tx.query(
          "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
          [name, checksum],
        );
        await tx.query("COMMIT");
      } catch (e) {
        await tx.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await tx.query("SELECT pg_advisory_unlock(18001111)");
    tx.release();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL obligatoire");
  const { pool } = database(process.env.DATABASE_URL);
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}
