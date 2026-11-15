import type { Hono } from "hono";
import type pg from "pg";
import { randomInt, createHmac, timingSafeEqual } from "node:crypto";
import type { AppContext, Env, Identity } from "./types.js";
import type { Config } from "./config.js";
import { transaction, type Queryable } from "./db/index.js";
import { reject, pair, lockPair } from "./partnerships.js";
import {
  documentInput,
  digest,
  makePDF,
  finalPDF,
  signatureDrawing,
  totals,
} from "./document-data.js";
import { validPDF, positiveId } from "./validation.js";
import { scanWithClamAV } from "./clamav.js";
import { notify } from "./notifications.js";
import { mailer } from "./mail.js";
import { DocumentsView } from "./views/documents.js";
const consent =
  "Je confirme mon pouvoir de représentation et consens à signer cette version par signature interne avec preuve d’acceptation.";
export async function accessible(
  q: Queryable,
  u: Identity,
  id: number,
  edit = false,
) {
  const d = (
    await q.query(
      `SELECT * FROM business_documents d WHERE id=$1 AND (
 (author_id=$2 AND establishment_id=$3) OR ($4=false AND current_version>0 AND (establishment_id=$3 OR recipient_id=$3)))${edit ? " FOR UPDATE" : ""}`,
      [id, u.ID, u.EstID, edit],
    )
  ).rows[0];
  if (!d) return reject(404, "Document introuvable.");
  return d;
}
async function event(
  q: Queryable,
  u: Identity,
  d: number,
  v: number | null,
  name: string,
) {
  await q.query(
    "INSERT INTO document_events(document_id,version_id,user_id,establishment_id,event) VALUES($1,$2,$3,$4,$5)",
    [d, v, u.ID, u.EstID, name],
  );
}
export async function activateContract(q: Queryable, versionId: number) {
  const r = (
    await q.query(
      "SELECT r.*,p.a,p.b,p.version,p.status AS partnership_status FROM document_requests r JOIN partnerships p ON p.id=r.partnership_id WHERE r.version_id=$1",
      [versionId],
    )
  ).rows[0];
  if (!r || r.status !== "signed") return false;
  await lockPair(q, Number(r.a), Number(r.b));
  const p = (
    await q.query("SELECT * FROM partnerships WHERE id=$1 FOR UPDATE", [
      r.partnership_id,
    ])
  ).rows[0];
  if (
    p.version !== r.partnership_version ||
    !["pending", "active"].includes(p.status)
  )
    return false;
  if (p.status === "active") return true;
  const available = await q.query(
    `SELECT id FROM establishments e WHERE id IN ($1,$2) AND status='approved' AND (COALESCE(subscription_until>now(),false) OR (SELECT count(*) FROM partnerships WHERE status='active' AND (a=e.id OR b=e.id))<2+purchased_slots)`,
    [p.a, p.b],
  );
  if (available.rowCount !== 2) return false;
  await q.query(
    "UPDATE partnerships SET status='active',accepted_a=true,accepted_b=true,activated_at=now() WHERE id=$1",
    [p.id],
  );
  return true;
}
export function documents(app: Hono<Env>, pool: pg.Pool, cfg: Config) {
  const hashCode = (v: string) =>
    createHmac("sha256", cfg.BETTER_AUTH_SECRET).update(v).digest("hex");
  app.use("/atelier/*", async (c, next) => {
    if (c.req.method === "POST" && c.get("user")!.Role !== "owner")
      return c.text("Action réservée au responsable.", 403);
    await next();
  });
  const show = async (c: AppContext, kind: string, id?: number) => {
    const u = c.get("user") as Identity;
    const items = (
      await pool.query(
        `SELECT id,CASE WHEN author_id=$1 AND establishment_id=$2 THEN title ELSE (SELECT content->>'title' FROM document_versions WHERE document_id=business_documents.id AND version=current_version) END AS title,kind,current_version,author_id FROM business_documents WHERE (author_id=$1 AND establishment_id=$2) OR (current_version>0 AND (establishment_id=$2 OR recipient_id=$2)) ORDER BY updated_at DESC LIMIT 100`,
        [u.ID, u.EstID],
      )
    ).rows;
    const templates = (
      await pool.query(
        "SELECT id,name,kind FROM document_templates WHERE establishment_id=$1 ORDER BY id",
        [u.EstID],
      )
    ).rows;
    const establishments = (
      await pool.query(
        "SELECT id,name FROM establishments WHERE status='approved' AND id<>$1 ORDER BY name",
        [u.EstID],
      )
    ).rows;
    const doc = id ? await accessible(pool, u, id) : null;
    const versions = doc
      ? (
          await pool.query(
            `SELECT v.id,v.version,v.sha256,v.content,r.final_pdf IS NOT NULL AS has_final,r.status,p.status AS activation,r.partnership_id,r.partnership_version, (SELECT count(*) FROM document_signatures s WHERE s.version_id=v.id) AS signatures,EXISTS(SELECT 1 FROM document_signatures s WHERE s.version_id=v.id AND establishment_id=$2) AS own_signed FROM document_versions v JOIN document_requests r ON r.version_id=v.id LEFT JOIN partnerships p ON p.id=r.partnership_id WHERE v.document_id=$1 ORDER BY v.version DESC`,
            [id, u.EstID],
          )
        ).rows
      : [];
    if (
      doc &&
      !(
        Number(doc.author_id) === u.ID &&
        Number(doc.establishment_id) === u.EstID
      )
    ) {
      doc.draft = versions[0]?.content;
      doc.title = doc.draft?.title || "Document partagé";
      doc.original_pdf = null;
    }
    const conv = c.req.query("conversation");
    if (conv && /^\d+$/.test(conv)) {
      const row = (
        await pool.query(
          "SELECT CASE WHEN a=$2 THEN b ELSE a END AS other FROM conversations WHERE id=$1 AND (a=$2 OR b=$2)",
          [conv, u.EstID],
        )
      ).rows[0];
      if (row)
        establishments.sort(
          (a, b) => Number(b.id === row.other) - Number(a.id === row.other),
        );
    }
    const conversations = doc
      ? (
          await pool.query(
            "SELECT id,subject FROM conversations WHERE (a=$1 AND b=$2) OR (a=$2 AND b=$1)",
            [doc.establishment_id, doc.recipient_id],
          )
        ).rows
      : [];
    return c.html(
      "<!doctype html>" +
        (await DocumentsView({
          u,
          csrf: c.get("csrf"),
          kind,
          items,
          templates,
          establishments,
          doc,
          versions,
          conversations,
          conversation: c.req.query("conversation") || "",
        })),
    );
  };
  app.get("/devis", (c) => show(c, "quote"));
  app.get("/contrats", (c) => show(c, "contract"));
  app.get("/atelier/:id", (c) =>
    show(c, "", positiveId.parse(c.req.param("id"))),
  );
  app.post("/atelier/creer", async (c) => {
    const u = c.get("user")!,
      f = await c.req.parseBody(),
      other = positiveId.parse(f.recipient);
    if (
      other === u.EstID ||
      !(
        await pool.query(
          "SELECT id FROM establishments WHERE id=$1 AND status='approved'",
          [other],
        )
      ).rowCount
    )
      reject(400, "Destinataire invalide.");
    const kind = f.kind === "contract" ? "contract" : "quote";
    let content = documentInput.parse({
        reference: "",
        date: new Date().toISOString().slice(0, 10),
        issuer: u.EstName,
        recipient: (
          await pool.query("SELECT name FROM establishments WHERE id=$1", [
            other,
          ])
        ).rows[0].name,
        layout: kind === "contract" ? "partnership" : "classic",
      }),
      original = null;
    if (f.template) {
      const t = (
        await pool.query(
          "SELECT * FROM document_templates WHERE id=$1 AND establishment_id=$2 AND kind=$3",
          [positiveId.parse(f.template), u.EstID, kind],
        )
      ).rows[0];
      if (!t) reject(404, "Modèle introuvable.");
      content = t.content;
      original = t.original_pdf;
    }
    let conversation = null;
    if (f.conversation) {
      conversation = positiveId.parse(f.conversation);
      if (
        !(
          await pool.query(
            "SELECT id FROM conversations WHERE id=$1 AND ((a=$2 AND b=$3) OR (a=$3 AND b=$2))",
            [conversation, u.EstID, other],
          )
        ).rowCount
      )
        reject(400, "Discussion incompatible.");
    }
    const d = (
      await pool.query(
        "INSERT INTO business_documents(kind,establishment_id,author_id,recipient_id,title,draft,original_pdf,conversation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
        [
          kind,
          u.EstID,
          u.ID,
          other,
          kind === "contract" ? "Contrat de partenariat" : "Devis",
          content,
          original,
          conversation,
        ],
      )
    ).rows[0];
    return c.redirect(`/atelier/${d.id}`, 303);
  });
  app.post("/atelier/:id/sauver", async (c) => {
    const u = c.get("user")!,
      f = await c.req.parseBody(),
      id = positiveId.parse(c.req.param("id")),
      data = documentInput.parse(JSON.parse(String(f.content)));
    const revision = await transaction(pool, async (tx) => {
      const d = await accessible(tx, u, id, true);
      if (d.revision !== Number(f.revision))
        reject(
          409,
          "Brouillon modifié dans une autre session. Rechargez avant de continuer.",
        );
      await checkedPDF(data, d.kind, d.original_pdf);
      const title = String(f.title || d.title)
        .trim()
        .slice(0, 200);
      await tx.query(
        "UPDATE business_documents SET draft=$1,title=$2,revision=revision+1,updated_at=now() WHERE id=$3",
        [data, title, id],
      );
      return d.revision + 1;
    });
    return c.json({ revision });
  });
  app.get("/atelier/:id/aperçu", async (c) => {
    const d = await accessible(
      pool,
      c.get("user")!,
      positiveId.parse(c.req.param("id")),
      true,
    );
    return pdfResponse(await makePDF(d.draft, d.kind, d.original_pdf));
  });
  app.get("/atelier/:id/original", async (c) => {
    const d = await accessible(
      pool,
      c.get("user")!,
      positiveId.parse(c.req.param("id")),
      true,
    );
    if (!d.original_pdf) reject(404, "Pas de fond PDF.");
    return pdfResponse(d.original_pdf);
  });
  app.post("/atelier/:id/importer", async (c) => {
    const u = c.get("user")!,
      f = await c.req.parseBody(),
      id = positiveId.parse(c.req.param("id"));
    await accessible(pool, u, id, true);
    if (!(f.pdf instanceof File)) reject(400, "PDF requis.");
    const bytes = Buffer.from(await (f.pdf as File).arrayBuffer());
    if (!validPDF(bytes)) reject(400, "PDF invalide (5 Mo maximum).");
    let clean;
    try {
      clean = await scanWithClamAV(bytes, cfg.CLAMAV_HOST, cfg.CLAMAV_PORT);
    } catch {
      reject(503, "Antivirus indisponible.");
    }
    if (!clean) reject(400, "PDF infecté.");
    await transaction(pool, async (tx) => {
      const d = await accessible(tx, u, id, true);
      if (d.revision !== Number(f.revision)) reject(409, "Brouillon modifié.");
      await checkedPDF(d.draft, d.kind, bytes);
      await tx.query(
        "UPDATE business_documents SET original_pdf=$1,revision=revision+1 WHERE id=$2",
        [bytes, id],
      );
    });
    return c.redirect(`/atelier/${id}`, 303);
  });
  app.post("/atelier/:id/modele", async (c) => {
    const u = c.get("user")!,
      f = await c.req.parseBody(),
      d = await accessible(pool, u, positiveId.parse(c.req.param("id")), true);
    await pool.query(
      "INSERT INTO document_templates(establishment_id,name,kind,content,original_pdf) VALUES($1,$2,$3,$4,$5)",
      [
        u.EstID,
        String(f.name || d.title).slice(0, 150),
        d.kind,
        d.draft,
        d.original_pdf,
      ],
    );
    return c.redirect(d.kind === "quote" ? "/devis" : "/contrats", 303);
  });
  app.post("/atelier/modeles/:id/:action", async (c) => {
    const u = c.get("user")!,
      f = await c.req.parseBody(),
      id = positiveId.parse(c.req.param("id"));
    switch (c.req.param("action")) {
      case "supprimer":
        await pool.query(
          "DELETE FROM document_templates WHERE id=$1 AND establishment_id=$2",
          [id, u.EstID],
        );
        break;
      case "renommer":
        await pool.query(
          "UPDATE document_templates SET name=$1 WHERE id=$2 AND establishment_id=$3",
          [String(f.name || "Modèle").slice(0, 150), id, u.EstID],
        );
        break;
      case "dupliquer":
        await pool.query(
          "INSERT INTO document_templates(establishment_id,name,kind,content,original_pdf) SELECT establishment_id,name||' (copie)',kind,content,original_pdf FROM document_templates WHERE id=$1 AND establishment_id=$2",
          [id, u.EstID],
        );
        break;
      default:
        reject(404, "Action inconnue.");
    }
    return c.redirect("/devis", 303);
  });
  app.post("/atelier/:id/envoyer", async (c) => {
    const u = c.get("user")!,
      f = await c.req.parseBody(),
      id = positiveId.parse(c.req.param("id"));
    await transaction(pool, async (tx) => {
      // Establishments are locked first, as in the historical partnership path.
      const initial = await accessible(tx, u, id);
      await lockPair(
        tx,
        Number(initial.establishment_id),
        Number(initial.recipient_id),
      );
      const d = await accessible(tx, u, id, true);
      if (d.revision !== Number(f.revision))
        reject(409, "Sauvegardez puis rechargez le document.");
      const conversation = positiveId.parse(
        f.conversation || d.conversation_id,
      );
      if (
        !(
          await tx.query(
            "SELECT id FROM conversations WHERE id=$1 AND ((a=$2 AND b=$3) OR (a=$3 AND b=$2))",
            [conversation, d.establishment_id, d.recipient_id],
          )
        ).rowCount
      )
        reject(400, "Choisissez une discussion entre les deux établissements.");
      const pdf = await makePDF(d.draft, d.kind, d.original_pdf),
        version = d.current_version + 1;
      await tx.query(
        "UPDATE document_requests SET status='superseded' WHERE version_id IN (SELECT id FROM document_versions WHERE document_id=$1) AND status<>'superseded'",
        [id],
      );
      const v = (
        await tx.query(
          "INSERT INTO document_versions(document_id,version,content,pdf,sha256) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [id, version, { ...d.draft, title: d.title }, pdf, digest(pdf)],
        )
      ).rows[0];
      let pid = null,
        pversion = null;
      if (d.kind === "contract") {
        const [a, b] = pair(Number(d.establishment_id), Number(d.recipient_id));
        const p = (
          await tx.query(
            "SELECT * FROM partnerships WHERE a=$1 AND b=$2 FOR UPDATE",
            [a, b],
          )
        ).rows[0];
        pid =
          p?.id ||
          (
            await tx.query(
              "INSERT INTO partnerships(a,b) VALUES($1,$2) RETURNING id",
              [a, b],
            )
          ).rows[0].id;
        pversion = p ? p.version + 1 : 1;
        const details = {
          benefits: d.draft.benefits,
          commitments: d.draft.commitments,
          start: d.draft.start,
          end: d.draft.end,
          renewal: "",
          renewal_terms: d.draft.renewal,
        };
        await tx.query(
          "UPDATE document_requests SET status='superseded' WHERE partnership_id=$1 AND status IN ('signing','signed')",
          [pid],
        );
        await tx.query(
          "INSERT INTO partnership_versions(partnership_id,version,terms,author_id,details) VALUES($1,$2,$3,$4,$5)",
          [pid, pversion, d.draft.conditions || d.title, u.ID, details],
        );
        await tx.query(
          "UPDATE partnerships SET version=$2,status='pending',accepted_a=false,accepted_b=false WHERE id=$1",
          [pid, pversion],
        );
      }
      await tx.query(
        "INSERT INTO document_requests(version_id,status,partnership_id,partnership_version) VALUES($1,$2,$3,$4)",
        [v.id, d.kind === "contract" ? "signing" : "sent", pid, pversion],
      );
      await tx.query(
        "UPDATE business_documents SET current_version=$2,conversation_id=$3,revision=revision+1,updated_at=now() WHERE id=$1",
        [id, version, conversation],
      );
      await tx.query(
        "INSERT INTO messages(conversation_id,sender_id,establishment_id,body,document_version_id) VALUES($1,$2,$3,$4,$5)",
        [
          conversation,
          u.ID,
          u.EstID,
          `${d.title} · ${d.draft.reference} · version ${version}${d.kind === "quote" ? ` · ${(totals(d.draft).gross / 100).toFixed(2)} € TTC` : ""}`,
          v.id,
        ],
      );
      await notify(
        tx,
        Number(d.recipient_id),
        "document",
        id,
        d.kind === "contract" ? "Contrat à signer" : "Nouveau devis",
      );
      await event(tx, u, id, v.id, "shared");
    });
    return c.redirect(`/atelier/${id}`, 303);
  });
  app.get("/atelier/:id/versions/:version/:file", async (c) => {
    const u = c.get("user")!,
      d = await accessible(pool, u, positiveId.parse(c.req.param("id"))),
      v = (
        await pool.query(
          "SELECT v.*,r.final_pdf,r.final_sha256 FROM document_versions v JOIN document_requests r ON r.version_id=v.id WHERE v.document_id=$1 AND v.version=$2",
          [d.id, positiveId.parse(c.req.param("version"))],
        )
      ).rows[0];
    if (!v) reject(404, "Version introuvable.");
    if (c.req.param("file") === "preuve") {
      const signatures = (
        await pool.query(
          "SELECT * FROM document_signatures WHERE version_id=$1 ORDER BY establishment_id",
          [v.id],
        )
      ).rows;
      const events = (
        await pool.query(
          "SELECT * FROM document_events WHERE version_id=$1 ORDER BY id",
          [v.id],
        )
      ).rows;
      c.header(
        "Content-Disposition",
        'attachment; filename="hoslink-preuve.json"',
      );
      return c.json({
        document: d.id,
        version: v.version,
        sha256: v.sha256,
        final_sha256: v.final_sha256,
        consent,
        signatures,
        events,
      });
    }
    return pdfResponse(
      c.req.param("file") === "final"
        ? v.final_pdf || reject(409, "Signatures incomplètes.")
        : v.pdf,
    );
  });
  app.post("/atelier/:id/versions/:version/:action", async (c) => {
    const u = c.get("user")!,
      f = await c.req.parseBody(),
      id = positiveId.parse(c.req.param("id")),
      version = positiveId.parse(c.req.param("version")),
      action = c.req.param("action");
    const outcome = await transaction(pool, async (tx) => {
      const d = await accessible(tx, u, id);
      // Lock establishments before the document/request to serialize activation with legacy acceptances.
      await lockPair(tx, Number(d.establishment_id), Number(d.recipient_id));
      const locked = await accessible(tx, u, id);
      if (locked.current_version !== version)
        reject(409, "Cette version est remplacée.");
      const v = (
        await tx.query(
          "SELECT v.*,r.status,r.partnership_id,r.partnership_version FROM document_versions v JOIN document_requests r ON r.version_id=v.id WHERE v.document_id=$1 AND v.version=$2 FOR UPDATE OF r",
          [id, version],
        )
      ).rows[0];
      if (!v || v.status === "superseded") reject(409, "Version indisponible.");
      if (action === "accepter" || action === "refuser") {
        if (
          d.kind === "quote"
            ? Number(d.recipient_id) !== u.EstID || v.status !== "sent"
            : action !== "refuser" || v.status !== "signing"
        )
          reject(409, "Réponse impossible.");
        await tx.query(
          "UPDATE document_requests SET status=$1 WHERE version_id=$2",
          [action === "accepter" ? "accepted" : "refused", v.id],
        );
        await event(tx, u, id, v.id, action);
        await notify(
          tx,
          Number(d.establishment_id),
          "document",
          id,
          d.kind === "contract" ? "Contrat refusé" : "Réponse au devis",
        );
        return "ok";
      }
      if (action === "activer") {
        if (v.status !== "signed") reject(409, "Contrat non signé.");
        await activateContract(tx, Number(v.id));
        return "ok";
      }
      if (d.kind !== "contract" || v.status !== "signing")
        reject(409, "Signature indisponible.");
      if (
        (
          await tx.query(
            "SELECT 1 FROM document_signatures WHERE version_id=$1 AND establishment_id=$2",
            [v.id, u.EstID],
          )
        ).rowCount
      )
        reject(409, "Votre établissement a déjà signé.");
      const current = (
        await tx.query("SELECT version FROM partnerships WHERE id=$1", [
          v.partnership_id,
        ])
      ).rows[0];
      if (current.version !== v.partnership_version)
        reject(409, "Les conditions ont changé.");
      if (action === "code") {
        const recent = (
          await tx.query(
            "SELECT count(*) AS n,max(created_at) AS last FROM document_challenges WHERE version_id=$1 AND user_id=$2 AND created_at>now()-interval '1 hour'",
            [v.id, u.ID],
          )
        ).rows[0];
        if (
          Number(recent.n) >= 5 ||
          (recent.last && Date.now() - new Date(recent.last).getTime() < 60000)
        )
          return "rate";
        const code = String(randomInt(100000, 1000000));
        await tx.query(
          "UPDATE document_challenges SET consumed_at=now() WHERE version_id=$1 AND user_id=$2 AND consumed_at IS NULL",
          [v.id, u.ID],
        );
        await tx.query(
          "INSERT INTO document_challenges(version_id,user_id,establishment_id,sha256,code_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')",
          [
            v.id,
            u.ID,
            u.EstID,
            v.sha256,
            hashCode(`${v.id}:${u.ID}:${u.EstID}:${v.sha256}:${code}`),
          ],
        );
        await mailer(cfg)(
          u.Email,
          "Hoslink · Code de signature",
          `Votre code de signature : ${code}\nExpire dans dix minutes.`,
        );
        await event(tx, u, id, v.id, "challenge_sent");
        return "ok";
      }
      if (action !== "signer") reject(404, "Action inconnue.");
      if (f.consent !== "yes") reject(400, "Consentement obligatoire.");
      const drawing = signatureDrawing.parse(JSON.parse(String(f.drawing)));
      const challenge = (
        await tx.query(
          "SELECT * FROM document_challenges WHERE version_id=$1 AND user_id=$2 AND establishment_id=$3 ORDER BY id DESC LIMIT 1 FOR UPDATE",
          [v.id, u.ID, u.EstID],
        )
      ).rows[0];
      if (
        !challenge ||
        challenge.consumed_at ||
        challenge.attempts >= 5 ||
        new Date(challenge.expires_at).getTime() < Date.now() ||
        challenge.sha256 !== v.sha256
      )
        return "invalid";
      const actual = hashCode(
        `${v.id}:${u.ID}:${u.EstID}:${v.sha256}:${String(f.code)}`,
      );
      await tx.query(
        "UPDATE document_challenges SET attempts=attempts+1 WHERE id=$1",
        [challenge.id],
      );
      if (
        !timingSafeEqual(Buffer.from(actual), Buffer.from(challenge.code_hash))
      ) {
        await event(tx, u, id, v.id, "challenge_failed");
        return "invalid";
      }
      await tx.query(
        "UPDATE document_challenges SET consumed_at=now() WHERE id=$1",
        [challenge.id],
      );
      await tx.query(
        "INSERT INTO document_signatures(version_id,establishment_id,user_id,identity,consent,drawing,sha256) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          v.id,
          u.EstID,
          u.ID,
          {
            name: u.Name,
            email: u.Email,
            authId: u.AuthID,
            establishment: u.EstName,
          },
          consent,
          JSON.stringify(drawing),
          v.sha256,
        ],
      );
      await event(tx, u, id, v.id, "signed");
      const signatures = (
        await tx.query(
          "SELECT * FROM document_signatures WHERE version_id=$1 ORDER BY establishment_id",
          [v.id],
        )
      ).rows;
      if (signatures.length === 2) {
        const final = await finalPDF(v.pdf, signatures);
        await tx.query(
          "UPDATE document_requests SET status='signed',final_pdf=$2,final_sha256=$3 WHERE version_id=$1",
          [v.id, final, digest(final)],
        );
        await activateContract(tx, Number(v.id));
        await notify(
          tx,
          Number(d.establishment_id),
          "document",
          id,
          "Contrat signé",
        );
        await notify(
          tx,
          Number(d.recipient_id),
          "document",
          id,
          "Contrat signé",
        );
        await event(tx, u, id, v.id, "finalized");
      }
      return "ok";
    });
    if (outcome === "invalid")
      return c.text("Code invalide, expiré ou déjà utilisé.", 400);
    if (outcome === "rate")
      return c.text(
        "Attendez une minute ; cinq envois maximum par heure.",
        429,
      );
    return c.redirect(`/atelier/${id}`, 303);
  });
}
async function checkedPDF(
  data: Parameters<typeof makePDF>[0],
  kind: string,
  original?: Buffer | null,
) {
  try {
    return await makePDF(data, kind, original);
  } catch {
    return reject(
      400,
      "PDF illisible, chiffré, trop long ou champ hors de sa page. Vérifiez le document et les positions.",
    );
  }
}
function pdfResponse(bytes: Buffer) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="hoslink.pdf"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
