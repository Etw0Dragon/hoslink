import { database } from "./db/index.js";
import { z } from "zod";
import { transaction } from "./db/index.js";
const email = z.string().email().parse(process.argv[2]);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL obligatoire");
const { pool } = database(process.env.DATABASE_URL);
try {
  await transaction(pool, async (tx) => {
    const u = (
      await tx.query(
        "SELECT id FROM auth_user WHERE email=$1 AND email_verified=true FOR UPDATE",
        [email.toLowerCase()],
      )
    ).rows[0];
    if (!u) throw new Error("Compte vérifié introuvable");
    await tx.query(
      "INSERT INTO profiles(auth_user_id,admin) VALUES($1,true) ON CONFLICT(auth_user_id) DO UPDATE SET admin=true",
      [u.id],
    );
    // Force a fresh login, including the second factor if already enrolled.
    await tx.query("DELETE FROM auth_session WHERE user_id=$1", [u.id]);
  });
  console.log("Rôle administrateur attribué ; activation 2FA requise.");
} finally {
  await pool.end();
}
