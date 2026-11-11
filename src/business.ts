import type pg from "pg";
import type { Hono } from "hono";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Env } from "./types.js";
import type { Config } from "./config.js";
import { transaction } from "./db/index.js";
import {
  establishmentInput,
  positiveId,
  text,
  validPDF,
} from "./validation.js";
import { pair, propose, partnershipAction, reject } from "./partnerships.js";
import { mailer } from "./mail.js";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function validSIRET(s: string) {
  return (
    /^\d{14}$/.test(s) &&
    [...s].reduce((sum, c, i) => {
      let n = Number(c) * (i % 2 === 0 ? 2 : 1);
      return sum + (n > 9 ? n - 9 : n);
    }, 0) %
      10 ===
      0
  );
}
export function business(app: Hono<Env>, pool: pg.Pool, cfg: Config) {
  const send = mailer(cfg);
  app.post("/etablissement", async (c) => {
    const u = c.get("user")!,
      form = await c.req.parseBody();
    const f = establishmentInput.parse({
      ...form,
      siret: String(form.siret || "").replaceAll(" ", ""),
    });
    if (cfg.NODE_ENV !== "test-prod" && !validSIRET(f.siret)) reject(400, "SIRET invalide.");
    await transaction(pool, async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        f.siret.slice(0, 9),
      ]);
      let company = (
        await tx.query("SELECT id FROM companies WHERE siren=$1", [
          f.siret.slice(0, 9),
        ])
      ).rows[0];
      if (company) {
        if (
          !(
            await tx.query(
              "SELECT 1 FROM memberships m JOIN establishments e ON e.id=m.establishment_id WHERE e.company_id=$1 AND m.user_id=$2 AND m.role='owner'",
              [company.id, u.ID],
            )
          ).rowCount
        )
          reject(
            409,
            "Cette entreprise est déjà enregistrée : les 9 premiers chiffres du SIRET (SIREN) sont identiques. Demandez une invitation ou un rattachement administratif. Pour une autre entreprise, utilisez un SIRET avec un SIREN différent.",
          );
      } else
        company = (
          await tx.query(
            "INSERT INTO companies(siren,name) VALUES($1,$2) RETURNING id",
            [f.siret.slice(0, 9), f.company],
          )
        ).rows[0];
      const est = (
        await tx.query(
          "INSERT INTO establishments(company_id,siret,name,category,station,city,address,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
          [
            company.id,
            f.siret,
            f.name,
            f.category,
            f.station,
            f.city,
            f.address,
            text(3000, 0).parse(form.description || ""),
          ],
        )
      ).rows[0];
      if (cfg.NODE_ENV === "test-prod") {
        await tx.query("UPDATE establishments SET status='approved' WHERE id=$1", [est.id]);
        await tx.query("INSERT INTO audit(user_id,action,entity_id,note) VALUES($1,'approved:test-prod',$2,'Validation automatique de recette')", [u.ID, est.id]);
      }
      await tx.query("INSERT INTO memberships VALUES($1,$2,'owner')", [
        u.ID,
        est.id,
      ]);
      await tx.query(
        "UPDATE profiles SET current_establishment_id=$1 WHERE id=$2",
        [est.id, u.ID],
      );
    });
    return c.redirect("/compte", 303);
  });
  app.post("/changer", async (c) => {
    const u = c.get("user")!,
      f = await c.req.parseBody(),
      id = positiveId.parse(f.establishment);
    const r = await pool.query(
      "UPDATE profiles SET current_establishment_id=$1 WHERE id=$2 AND EXISTS(SELECT 1 FROM memberships WHERE user_id=$2 AND establishment_id=$1)",
      [id, u.ID],
    );
    if (!r.rowCount) reject(403, "Établissement inaccessible.");
    return c.redirect("/compte", 303);
  });
  app.post("/fiche", async (c) => {
    const f = await c.req.parseBody();
    await pool.query("UPDATE establishments SET description=$1 WHERE id=$2", [
      text(3000, 0).parse(f.description || ""),
      c.get("user")!.EstID,
    ]);
    return c.redirect(`/etablissements/${c.get("user")!.EstID}`, 303);
  });
  app.post("/equipe/inviter", async (c) => {
    const f = await c.req.parseBody(),
      email = z.string().email().max(254).parse(f.email).toLowerCase(),
      token = randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO tokens(token_hash,kind,establishment_id,email,expires_at) VALUES($1,'invite',$2,$3,now()+interval '48 hours')",
      [hash(token), c.get("user")!.EstID, email],
    );
    await send(
      email,
      "Invitation Hoslink",
      `${cfg.BASE_URL}/invitation?token=${token}`,
    );
    return c.redirect("/equipe", 303);
  });
  app.post("/invitation", async (c) => {
    const u = c.get("user")!,
      f = await c.req.parseBody();
    await transaction(pool, async (tx) => {
      const t = (
        await tx.query(
          "DELETE FROM tokens WHERE token_hash=$1 AND kind='invite' AND email=$2 AND expires_at>now() RETURNING establishment_id",
          [hash(text(128).parse(f.token)), u.Email],
        )
      ).rows[0];
      if (!t) reject(400, "Invitation invalide ou expirée.");
      await tx.query(
        "INSERT INTO memberships VALUES($1,$2,'member') ON CONFLICT DO NOTHING",
        [u.ID, t.establishment_id],
      );
    });
    return c.redirect("/compte", 303);
  });
  app.post("/equipe/:id/retirer", async (c) => {
    const r = await pool.query(
      "DELETE FROM memberships WHERE establishment_id=$1 AND user_id=$2 AND role='member'",
      [c.get("user")!.EstID, positiveId.parse(c.req.param("id"))],
    );
    if (!r.rowCount) reject(400, "Ce membre ne peut pas être retiré.");
    return c.redirect("/equipe", 303);
  });
  app.post("/administration/:id", async (c) => {
    const u = c.get("user")!;
    if (!u.Admin) reject(403, "Accès refusé.");
    const f = await c.req.parseBody(),
      status = z.enum(["approved", "suspended"]).parse(f.status),
      note = text(1000).parse(f.note),
      id = positiveId.parse(c.req.param("id"));
    await transaction(pool, async (tx) => {
      if (
        !(
          await tx.query("UPDATE establishments SET status=$1 WHERE id=$2", [
            status,
            id,
          ])
        ).rowCount
      )
        reject(404, "Introuvable.");
      await tx.query(
        "INSERT INTO audit(user_id,action,entity_id,note) VALUES($1,$2,$3,$4)",
        [u.ID, status, id, note],
      );
    });
    return c.redirect("/administration", 303);
  });
  app.post("/signalements", async (c) => {
    const f = await c.req.parseBody();
    await pool.query(
      "INSERT INTO audit(user_id,action,entity_id,note) SELECT $1,'report',id,$3 FROM establishments WHERE id=$2 AND status='approved'",
      [c.get("user")!.ID, positiveId.parse(f.other), text(1000).parse(f.note)],
    );
    return c.redirect("/compte", 303);
  });
  app.post("/messages", async (c) => {
    const u = c.get("user")!,
      f = await c.req.parseBody(),
      other = positiveId.parse(f.other),
      subject = text(160).parse(f.subject),
      body = text(10000).parse(f.body);
    if (other === u.EstID) reject(400, "Choisissez un autre établissement.");
    const id = await transaction(pool, async (tx) => {
      if (
        !(
          await tx.query(
            "SELECT 1 FROM establishments WHERE id=$1 AND status='approved'",
            [other],
          )
        ).rowCount
      )
        reject(404, "Destinataire inaccessible.");
      const [a, b] = pair(u.EstID, other);
      const conv = (
        await tx.query(
          "INSERT INTO conversations(a,b,subject,quote) VALUES($1,$2,$3,$4) RETURNING id",
          [a, b, subject, f.quote === "1"],
        )
      ).rows[0];
      await tx.query(
        "INSERT INTO messages(conversation_id,sender_id,establishment_id,body) VALUES($1,$2,$3,$4)",
        [conv.id, u.ID, u.EstID, body],
      );
      return conv.id;
    });
    return c.redirect(`/messages/${id}`, 303);
  });
  app.post("/messages/:id", async (c) => {
    const u = c.get("user")!,
      f = await c.req.parseBody(),
      id = positiveId.parse(c.req.param("id")),
      body = text(10000, 0).parse(f.body || "");
    let bytes: Buffer | undefined,
      filename = "devis.pdf";
    if (f.document instanceof File && f.document.size) {
      bytes = Buffer.from(await f.document.arrayBuffer());
      if (!validPDF(bytes)) reject(400, "PDF invalide ou supérieur à 5 Mo.");
      filename =
        f.document.name.replace(/[\r\n/\\"\x00-\x1f]/g, "_").slice(0, 180) ||
        filename;
    }
    if (!body && !bytes) reject(400, "Ajoutez un message ou un PDF.");
    await transaction(pool, async (tx) => {
      const m = (
        await tx.query(
          "INSERT INTO messages(conversation_id,sender_id,establishment_id,body) SELECT id,$2,$3,$4 FROM conversations WHERE id=$1 AND (a=$3 OR b=$3) RETURNING id",
          [id, u.ID, u.EstID, body],
        )
      ).rows[0];
      if (!m) reject(404, "Conversation introuvable.");
      if (bytes)
        await tx.query(
          "INSERT INTO attachments(message_id,name,data) VALUES($1,$2,$3)",
          [m.id, filename, bytes],
        );
    });
    return c.redirect(`/messages/${id}`, 303);
  });
  app.get("/documents/:id", async (c) => {
    const d = (
      await pool.query(
        "SELECT d.name,d.data FROM attachments d JOIN messages m ON m.id=d.message_id JOIN conversations c ON c.id=m.conversation_id WHERE d.id=$1 AND (c.a=$2 OR c.b=$2)",
        [positiveId.parse(c.req.param("id")), c.get("user")!.EstID],
      )
    ).rows[0];
    if (!d) reject(404, "Document introuvable.");
    return new Response(new Uint8Array(d.data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(d.name)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
  app.post("/partenariats", async (c) => {
    const f = await c.req.parseBody(),
      u = c.get("user")!;
    await propose(
      pool,
      u.ID,
      u.EstID,
      positiveId.parse(f.other),
      text(10000).parse(f.terms),
    );
    return c.redirect("/partenariats", 303);
  });
  app.post("/partenariats/:id/:action", async (c) => {
    const f = await c.req.parseBody(),
      u = c.get("user")!;
    await partnershipAction(
      pool,
      u.ID,
      u.EstID,
      positiveId.parse(c.req.param("id")),
      c.req.param("action"),
      positiveId.parse(f.version),
      text(10000, 0).parse(f.terms || ""),
    );
    return c.redirect("/partenariats", 303);
  });
}
