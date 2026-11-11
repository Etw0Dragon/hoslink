import type pg from "pg";
import { transaction, type Queryable } from "./db/index.js";
import { HTTPException } from "hono/http-exception";
export const reject = (
  status: 400 | 403 | 404 | 409,
  message: string,
): never => {
  throw new HTTPException(status, { message });
};
export const pair = (a: number, b: number) => (a < b ? [a, b] : [b, a]);
export async function lockPair(tx: Queryable, a: number, b: number) {
  await tx.query(
    "SELECT id FROM establishments WHERE id IN ($1,$2) ORDER BY id FOR UPDATE",
    pair(a, b),
  );
}
export async function reconcile(pool: pg.Pool) {
  return transaction(pool, async (tx) => {
    const lock = await tx.query(
      "SELECT pg_try_advisory_xact_lock(18001112) AS acquired",
    );
    if (!lock.rows[0].acquired) return;
    const { rows } = await tx.query(
      "SELECT id,2+purchased_slots AS capacity,COALESCE(subscription_until>now(),false) AS unlimited FROM establishments ORDER BY id FOR UPDATE",
    );
    for (const e of rows) {
      if (e.unlimited) continue;
      await tx.query(
        `UPDATE partnerships SET status='suspended',accepted_a=false,accepted_b=false WHERE id IN (
 SELECT p.id FROM partnerships p LEFT JOIN retained_partnerships r ON r.partnership_id=p.id AND r.establishment_id=$1
 WHERE p.status='active' AND (p.a=$1 OR p.b=$1) ORDER BY (r.partnership_id IS NOT NULL) DESC,p.activated_at,p.id OFFSET $2)`,
        [e.id, e.capacity],
      );
    }
  });
}
export async function propose(
  pool: pg.Pool,
  uid: number,
  eid: number,
  other: number,
  terms: string,
) {
  if (other === eid) reject(400, "Choisissez un autre établissement.");
  return transaction(pool, async (tx) => {
    const [a, b] = pair(eid, other);
    await lockPair(tx, a, b);
    if (
      !(
        await tx.query(
          "SELECT id FROM establishments WHERE id=$1 AND status='approved'",
          [other],
        )
      ).rowCount
    )
      reject(404, "Partenaire inaccessible.");
    const p = await tx.query(
      "INSERT INTO partnerships(a,b,accepted_a,accepted_b) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
      [a, b, eid === a, eid === b],
    );
    if (!p.rowCount) reject(409, "Une relation existe déjà.");
    await tx.query(
      "INSERT INTO partnership_versions(partnership_id,version,terms,author_id) VALUES($1,1,$2,$3)",
      [p.rows[0].id, terms, uid],
    );
    return p.rows[0].id;
  });
}
export async function partnershipAction(
  pool: pg.Pool,
  uid: number,
  eid: number,
  id: number,
  action: string,
  version: number,
  terms: string,
) {
  await reconcile(pool);
  return transaction(pool, async (tx) => {
    const row = (
      await tx.query(
        "SELECT a,b FROM partnerships WHERE id=$1 AND (a=$2 OR b=$2)",
        [id, eid],
      )
    ).rows[0];
    if (!row) reject(404, "Accord introuvable.");
    await lockPair(tx, row.a, row.b);
    const p = (
      await tx.query("SELECT * FROM partnerships WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (p.version !== version)
      reject(409, "L’accord a changé. Rechargez la page.");
    if (action === "accepter") {
      if (p.status !== "pending")
        reject(409, "Cet accord n’est pas en attente.");
      const aa = p.accepted_a || Number(p.a) === eid,
        ab = p.accepted_b || Number(p.b) === eid;
      let state = "pending";
      if (aa && ab) {
        const available = await tx.query(
          `SELECT id FROM establishments e WHERE id IN ($1,$2) AND status='approved' AND (COALESCE(subscription_until>now(),false) OR (SELECT count(*) FROM partnerships WHERE status='active' AND (a=e.id OR b=e.id))<2+purchased_slots)`,
          [p.a, p.b],
        );
        if (available.rowCount !== 2)
          reject(
            409,
            "Les deux établissements doivent disposer d’une place libre.",
          );
        state = "active";
      }
      await tx.query(
        "UPDATE partnerships SET accepted_a=$1,accepted_b=$2,status=$3,activated_at=CASE WHEN $3='active' THEN now() ELSE activated_at END WHERE id=$4",
        [aa, ab, state, id],
      );
    } else if (action === "modifier" || action === "reactiver") {
      if (action === "reactiver") {
        if (!["suspended", "ended"].includes(p.status))
          reject(409, "Réactivation impossible.");
        terms = (
          await tx.query(
            "SELECT terms FROM partnership_versions WHERE partnership_id=$1 AND version=$2",
            [id, version],
          )
        ).rows[0].terms;
      }
      if (!terms) reject(400, "Conditions obligatoires.");
      await tx.query(
        "INSERT INTO partnership_versions(partnership_id,version,terms,author_id) VALUES($1,$2,$3,$4)",
        [id, version + 1, terms, uid],
      );
      await tx.query(
        "UPDATE partnerships SET version=$1,status='pending',accepted_a=$2,accepted_b=$3 WHERE id=$4",
        [version + 1, Number(p.a) === eid, Number(p.b) === eid, id],
      );
    } else if (action === "terminer") {
      await tx.query(
        "UPDATE partnerships SET status='ended',accepted_a=false,accepted_b=false WHERE id=$1",
        [id],
      );
    } else if (action === "conserver") {
      if (p.status !== "active")
        reject(409, "Seul un accord actif peut être conservé.");
      await tx.query(
        "INSERT INTO retained_partnerships VALUES($1,$2) ON CONFLICT DO NOTHING",
        [eid, id],
      );
    } else if (action === "deprioriser") {
      await tx.query(
        "DELETE FROM retained_partnerships WHERE establishment_id=$1 AND partnership_id=$2",
        [eid, id],
      );
    } else reject(404, "Action inconnue.");
    await tx.query(
      "INSERT INTO audit(user_id,action,entity_id) VALUES($1,$2,$3)",
      [uid, `partnership:${action}`, id],
    );
  });
}
