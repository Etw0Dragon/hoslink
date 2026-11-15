import net from "node:net";
import { PDFDocument } from "pdf-lib";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { database } from "../src/db/index.js";
import { migrate } from "../src/db/migrate.js";
import { createAuth } from "../src/auth.js";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { documentInput } from "../src/document-data.js";
import { partnershipAction, propose } from "../src/partnerships.js";
test(
  "Documents PostgreSQL : isolation, rôles, versions, code et activation",
  { skip: !process.env.DOCUMENT_TEST_DATABASE_URL, timeout: 120000 },
  async () => {
    const url = process.env.DOCUMENT_TEST_DATABASE_URL!;
    assert.match(new URL(url).pathname, /\/hoslink_ts_test_documents$/);
    const { pool, db } = database(url),
      dir = await mkdtemp("/tmp/hoslink-doc-proof-");
    try {
      await migrate(pool);
      const cfg = readConfig({
        DATABASE_URL: url,
        BETTER_AUTH_SECRET: "documents-test-secret-longer-than-32-characters",
        NODE_ENV: "test",
        BASE_URL: "http://localhost:8080",
        MAIL_DIR: dir,
      });
      const auth = createAuth(cfg, db),
        app = createApp(pool, auth, cfg);
      class Browser {
        jar = new Map<string, string>();
        async request(path: string, body?: Record<string, unknown>) {
          const r = await app.request(cfg.BASE_URL + path, {
            method: body ? "POST" : "GET",
            headers: {
              Cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "),
              ...(body
                ? {
                    Origin: cfg.BASE_URL,
                    "Content-Type": "application/x-www-form-urlencoded",
                  }
                : {}),
            },
            body: body
              ? new URLSearchParams({
                  ...body,
                  csrf: this.jar.get("hoslink_csrf") || "",
                } as Record<string, string>).toString()
              : undefined,
          });
          for (const cookie of r.headers.getSetCookie()) {
            const [part] = cookie.split(";");
            const i = part.indexOf("=");
            this.jar.set(part.slice(0, i), part.slice(i + 1));
          }
          return r;
        }
      }
      const members = [];
      for (let i = 0; i < 4; i++) {
        const email = `doc-${Date.now()}-${i}@example.test`,
          password = "Documents test password 123!";
        await auth.api.signUpEmail({
          body: { email, name: `Responsable ${i}`, password },
        });
        await pool.query(
          "UPDATE auth_user SET email_verified=true WHERE email=$1",
          [email],
        );
        const browser = new Browser();
        await browser.request("/connexion");
        const login = await app.request(
          cfg.BASE_URL + "/api/auth/sign-in/email",
          {
            method: "POST",
            headers: {
              Origin: cfg.BASE_URL,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, password }),
          },
        );
        assert.equal(login.status, 200);
        for (const cookie of login.headers.getSetCookie()) {
          const [part] = cookie.split(";");
          const k = part.indexOf("=");
          browser.jar.set(part.slice(0, k), part.slice(k + 1));
        }
        await browser.request("/compte");
        const uid = Number(
          (
            await pool.query(
              "SELECT p.id FROM profiles p JOIN auth_user u ON u.id=p.auth_user_id WHERE u.email=$1",
              [email],
            )
          ).rows[0].id,
        );
        const company = (
          await pool.query(
            "INSERT INTO companies(siren,name) VALUES($1,'QA') RETURNING id",
            [`${Date.now()}`.slice(-8) + i],
          )
        ).rows[0].id;
        const eid = Number(
          (
            await pool.query(
              "INSERT INTO establishments(company_id,siret,name,category,station,city,address,status) VALUES($1,$2,$3,'hotel','Paris','Paris','QA','approved') RETURNING id",
              [company, `${Date.now()}`.slice(-13) + i, `QA ${i}`],
            )
          ).rows[0].id,
        );
        await pool.query("INSERT INTO memberships VALUES($1,$2,$3)", [
          uid,
          eid,
          i === 3 ? "member" : "owner",
        ]);
        members.push({ browser, uid, eid, email });
      }
      const [a, b, c, collab] = members;
      await pool.query("INSERT INTO memberships VALUES($1,$2,'member')", [
        collab.uid,
        a.eid,
      ]);
      await pool.query(
        "UPDATE profiles SET current_establishment_id=$1 WHERE id=$2",
        [a.eid, collab.uid],
      );
      const conv = Number(
        (
          await pool.query(
            "INSERT INTO conversations(a,b,subject) VALUES($1,$2,'Documents QA') RETURNING id",
            [Math.min(a.eid, b.eid), Math.max(a.eid, b.eid)],
          )
        ).rows[0].id,
      );
      const create = await a.browser.request("/atelier/creer", {
        kind: "quote",
        recipient: b.eid,
        conversation: conv,
      });
      assert.equal(create.status, 303);
      const path = create.headers.get("location")!;
      const id = Number(path.split("/").pop());
      assert.equal((await b.browser.request(path)).status, 404);
      assert.equal((await c.browser.request(path)).status, 404);
      assert.equal(
        (
          await collab.browser.request("/atelier/creer", {
            kind: "quote",
            recipient: b.eid,
          })
        ).status,
        403,
      );
      const data = documentInput.parse({
        reference: "Q-1",
        date: "2026-11-15",
        issuer: "A",
        recipient: "B",
        lines: [{ label: "Activité", quantity: 2, unitCents: 1000, vat: 20 }],
      });
      const saves = await Promise.all([
        a.browser.request(`${path}/sauver`, {
          revision: 1,
          title: "Devis QA",
          content: JSON.stringify(data),
        }),
        a.browser.request(`${path}/sauver`, {
          revision: 1,
          title: "Concurrent",
          content: JSON.stringify(data),
        }),
      ]);
      assert.deepEqual(saves.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        (
          await a.browser.request(`${path}/envoyer`, {
            revision: 2,
            conversation: conv,
          })
        ).status,
        303,
      );
      assert.equal((await b.browser.request(path)).status, 200);
      assert.equal((await collab.browser.request(path)).status, 200);
      assert.equal(
        (await c.browser.request(`${path}/versions/1/pdf`)).status,
        404,
      );
      assert.equal(
        (
          await b.browser.request(`${path}/sauver`, {
            revision: 3,
            content: JSON.stringify(data),
          })
        ).status,
        404,
      );
      assert.equal(
        (await b.browser.request(`${path}/versions/1/accepter`, {})).status,
        303,
      );
      await a.browser.request(`${path}/sauver`, {
        revision: 3,
        content: JSON.stringify({ ...data, reference: "SECRET DRAFT" }),
      });
      const shared = await (await b.browser.request(path)).text();
      assert.doesNotMatch(shared, /SECRET DRAFT/);
      await a.browser.request(`${path}/envoyer`, {
        revision: 4,
        conversation: conv,
      });
      assert.equal(
        (await b.browser.request(`${path}/versions/1/accepter`, {})).status,
        409,
      );
      assert.equal(
        (await b.browser.request(`${path}/versions/2/refuser`, {})).status,
        303,
      );
      assert.equal(
        (await a.browser.request(`${path}/modele`, { name: "Modèle QA" }))
          .status,
        303,
      );
      const template = (
        await pool.query(
          "SELECT id FROM document_templates WHERE establishment_id=$1",
          [a.eid],
        )
      ).rows[0].id;
      assert.equal(
        (
          await b.browser.request("/atelier/creer", {
            kind: "quote",
            recipient: a.eid,
            template,
          })
        ).status,
        404,
      );
      // Imported backgrounds: antivirus clean/infected/unavailable, two pages and private original.
      const imported = await a.browser.request("/atelier/creer", {
          kind: "quote",
          recipient: b.eid,
        }),
        ip = imported.headers.get("location")!;
      const original = await PDFDocument.create();
      original.addPage([600, 800]);
      original.addPage([400, 500]);
      const bytes = Buffer.from(await original.save());
      let verdict = "stream: OK";
      const scanner = net.createServer((socket) => {
        let buffer = Buffer.alloc(0);
        socket.on("data", (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          if (buffer.length < 10) return;
          let offset = 10;
          while (offset + 4 <= buffer.length) {
            const length = buffer.readUInt32BE(offset);
            offset += 4;
            if (!length) {
              socket.end(verdict + "\0");
              return;
            }
            if (offset + length > buffer.length) return;
            offset += length;
          }
        });
      });
      await new Promise<void>((resolve) =>
        scanner.listen(0, "127.0.0.1", resolve),
      );
      const scanCfg = {
          ...cfg,
          CLAMAV_PORT: (scanner.address() as net.AddressInfo).port,
        },
        scanApp = createApp(pool, auth, scanCfg);
      const upload = async (revision: number) => {
        const f = new FormData();
        f.set("csrf", a.browser.jar.get("hoslink_csrf")!);
        f.set("revision", String(revision));
        f.set(
          "pdf",
          new File([bytes], "fond.pdf", { type: "application/pdf" }),
        );
        return scanApp.request(cfg.BASE_URL + ip + "/importer", {
          method: "POST",
          headers: {
            Origin: cfg.BASE_URL,
            Cookie: [...a.browser.jar].map(([k, v]) => `${k}=${v}`).join("; "),
          },
          body: f,
        });
      };
      try {
        assert.equal((await upload(1)).status, 303);
        verdict = "stream: Eicar-Test-Signature FOUND";
        assert.equal((await upload(2)).status, 400);
      } finally {
        await new Promise<void>((resolve) => scanner.close(() => resolve()));
      }
      assert.equal((await upload(2)).status, 503);
      assert.equal((await b.browser.request(ip + "/original")).status, 404);
      const stored = (
        await pool.query(
          "SELECT revision,original_pdf FROM business_documents WHERE id=$1",
          [ip.split("/").pop()],
        )
      ).rows[0];
      assert.equal(stored.revision, 2);
      assert.deepEqual(stored.original_pdf, bytes);
      const positioned = {
        ...data,
        fields: [{ page: 2, x: 0.2, y: 0.3, size: 12, text: "Page 2" }],
      };
      assert.equal(
        (
          await a.browser.request(ip + "/sauver", {
            revision: 2,
            content: JSON.stringify(positioned),
          })
        ).status,
        200,
      );
      // Contract links a precise partnership version and blocks historical acceptance.
      const contract = await a.browser.request("/atelier/creer", {
          kind: "contract",
          recipient: b.eid,
          conversation: conv,
        }),
        cp = contract.headers.get("location")!;
      assert.equal(
        (
          await a.browser.request(`${cp}/envoyer`, {
            revision: 1,
            conversation: conv,
          })
        ).status,
        303,
      );
      const req = (
        await pool.query(
          "SELECT r.* FROM document_requests r JOIN document_versions v ON v.id=r.version_id JOIN business_documents d ON d.id=v.document_id WHERE d.id=$1",
          [cp.split("/").pop()],
        )
      ).rows[0];
      await assert.rejects(
        partnershipAction(
          pool,
          b.uid,
          b.eid,
          Number(req.partnership_id),
          "accepter",
          req.partnership_version,
          "",
        ),
      );
      for (const member of [a, b]) {
        assert.equal(
          (await member.browser.request(`${cp}/versions/1/code`, {})).status,
          303,
        );
        assert.equal(
          (await member.browser.request(`${cp}/versions/1/code`, {})).status,
          429,
        );
        const files = await readdir(dir),
          mails = await Promise.all(
            files.map((f) => readFile(`${dir}/${f}`, "utf8")),
          ),
          codes = mails
            .filter(
              (m) =>
                m.includes(`To: ${member.email}`) &&
                m.includes("Votre code de signature"),
            )
            .map((m) => m.match(/signature : (\d{6})/)![1]);
        const challenge = (
          await pool.query(
            "SELECT * FROM document_challenges WHERE user_id=$1 ORDER BY id DESC LIMIT 1",
            [member.uid],
          )
        ).rows[0];
        const { createHmac } = await import("node:crypto");
        const code = codes.find(
          (code) =>
            createHmac("sha256", cfg.BETTER_AUTH_SECRET)
              .update(
                `${req.version_id}:${member.uid}:${member.eid}:${challenge.sha256}:${code}`,
              )
              .digest("hex") === challenge.code_hash,
        )!;
        const body = {
          consent: "yes",
          drawing: JSON.stringify([
            [
              [0.1, 0.2],
              [0.5, 0.6],
            ],
          ]),
          code,
        };
        await pool.query(
          "UPDATE document_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",
          [challenge.id],
        );
        assert.equal(
          (await member.browser.request(`${cp}/versions/1/signer`, body))
            .status,
          400,
        );
        await pool.query(
          "UPDATE document_challenges SET expires_at=now()+interval '10 minutes' WHERE id=$1",
          [challenge.id],
        );
        assert.equal(
          (
            await member.browser.request(`${cp}/versions/1/signer`, {
              ...body,
              code: "000000",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await pool.query(
              "SELECT attempts FROM document_challenges WHERE id=$1",
              [challenge.id],
            )
          ).rows[0].attempts,
          1,
        );
        const results = await Promise.all([
          member.browser.request(`${cp}/versions/1/signer`, body),
          member.browser.request(`${cp}/versions/1/signer`, body),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [303, 409]);
      }
      assert.equal(
        (
          await pool.query("SELECT status FROM partnerships WHERE id=$1", [
            req.partnership_id,
          ])
        ).rows[0].status,
        "active",
      );
      assert.equal(
        (await a.browser.request(`${cp}/versions/1/final`)).status,
        200,
      );
      assert.equal(
        (await b.browser.request(`${cp}/versions/1/preuve`)).status,
        200,
      );
      await assert.rejects(
        pool.query("UPDATE document_versions SET sha256='bad' WHERE id=$1", [
          req.version_id,
        ]),
      );
      // Signature remains valid if both free places have already been consumed.
      const extra = await a.browser.request("/atelier/creer", {
        kind: "contract",
        recipient: c.eid,
      });
      const extraPath = extra.headers.get("location")!;
      const conv2 = Number(
        (
          await pool.query(
            "INSERT INTO conversations(a,b,subject) VALUES($1,$2,'Capacity QA') RETURNING id",
            [Math.min(a.eid, c.eid), Math.max(a.eid, c.eid)],
          )
        ).rows[0].id,
      );
      const filler = await propose(pool, a.uid, a.eid, collab.eid, "Capacité");
      await partnershipAction(
        pool,
        collab.uid,
        collab.eid,
        Number(filler),
        "accepter",
        1,
        "",
      );
      assert.equal(
        (
          await a.browser.request(`${extraPath}/envoyer`, {
            revision: 1,
            conversation: conv2,
          })
        ).status,
        303,
      );
      const signaturesToSubmit = [];
      for (const member of [a, c]) {
        await member.browser.request(`${extraPath}/versions/1/code`, {});
        const mails = await Promise.all(
          (await readdir(dir)).map((f) => readFile(`${dir}/${f}`, "utf8")),
        );
        const codes = mails
          .filter(
            (m) =>
              m.includes(`To: ${member.email}`) &&
              m.includes("Votre code de signature"),
          )
          .map((m) => m.match(/signature : (\d{6})/)![1]);
        const challenge = (
          await pool.query(
            "SELECT code_hash FROM document_challenges WHERE user_id=$1 ORDER BY id DESC LIMIT 1",
            [member.uid],
          )
        ).rows[0];
        const { createHmac } = await import("node:crypto");
        const vr = (
          await pool.query(
            "SELECT * FROM document_versions WHERE document_id=$1",
            [extraPath.split("/").pop()],
          )
        ).rows[0];
        const code = codes.find(
          (code) =>
            createHmac("sha256", cfg.BETTER_AUTH_SECRET)
              .update(
                `${vr.id}:${member.uid}:${member.eid}:${vr.sha256}:${code}`,
              )
              .digest("hex") === challenge.code_hash,
        )!;
        signaturesToSubmit.push(() =>
          member.browser.request(`${extraPath}/versions/1/signer`, {
            code,
            consent: "yes",
            drawing: "[[[0.1,0.2],[0.5,0.6]]]",
          }),
        );
      }
      assert.deepEqual(
        (await Promise.all(signaturesToSubmit.map((f) => f()))).map(
          (r) => r.status,
        ),
        [303, 303],
      );
      const pending = (
        await pool.query(
          "SELECT r.status,p.status AS activation FROM document_requests r JOIN document_versions v ON v.id=r.version_id JOIN partnerships p ON p.id=r.partnership_id WHERE v.document_id=$1",
          [extraPath.split("/").pop()],
        )
      ).rows[0];
      assert.deepEqual(pending, { status: "signed", activation: "pending" });
      await partnershipAction(
        pool,
        a.uid,
        a.eid,
        Number(filler),
        "terminer",
        1,
        "",
      );
      const activations = await Promise.all([
        a.browser.request(`${extraPath}/versions/1/activer`, {}),
        c.browser.request(`${extraPath}/versions/1/activer`, {}),
      ]);
      assert.deepEqual(
        activations.map((r) => r.status),
        [303, 303],
      );
      const count = Number(
        (
          await pool.query(
            "SELECT count(*) AS n FROM partnerships WHERE status='active' AND (a=$1 OR b=$1)",
            [a.eid],
          )
        ).rows[0].n,
      );
      assert.equal(count, 2);
      // New contractual versions invalidate earlier challenges, retaining final evidence.
      assert.equal(
        (
          await a.browser.request(`${cp}/envoyer`, {
            revision: 2,
            conversation: conv,
          })
        ).status,
        303,
      );
      assert.equal(
        (await a.browser.request(`${cp}/versions/2/code`, {})).status,
        303,
      );
      for (let i = 0; i < 5; i++)
        assert.equal(
          (
            await a.browser.request(`${cp}/versions/2/signer`, {
              code: "000000",
              consent: "yes",
              drawing: "[[[0.1,0.2],[0.5,0.6]]]",
            })
          ).status,
          400,
        );
      const exhausted = (
        await pool.query(
          "SELECT attempts FROM document_challenges WHERE user_id=$1 ORDER BY id DESC LIMIT 1",
          [a.uid],
        )
      ).rows[0];
      assert.equal(exhausted.attempts, 5);
      assert.equal(
        (
          await a.browser.request(`${cp}/envoyer`, {
            revision: 3,
            conversation: conv,
          })
        ).status,
        303,
      );
      assert.equal(
        (
          await a.browser.request(`${cp}/versions/2/signer`, {
            code: "123456",
            consent: "yes",
            drawing: "[[[0.1,0.2],[0.5,0.6]]]",
          })
        ).status,
        409,
      );
      assert.equal(
        (await a.browser.request(`${cp}/versions/1/final`)).status,
        200,
      );
      await assert.rejects(
        pool.query(
          "UPDATE document_requests SET final_sha256='changed' WHERE version_id=$1",
          [req.version_id],
        ),
      );
    } finally {
      await pool.end();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
