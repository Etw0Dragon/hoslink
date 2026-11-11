import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHmac, randomUUID } from "node:crypto";
import { database } from "../src/db/index.js";
import { migrate } from "../src/db/migrate.js";
import { createAuth } from "../src/auth.js";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { propose, partnershipAction, reconcile } from "../src/partnerships.js";
import { hash } from "../src/business.js";
function totp(uri: string) {
  const secret = new URL(uri).searchParams.get("secret")!;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((x) => parseInt(x, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest(),
    offset = digest[19] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
test(
  "PostgreSQL : migrations, identité, 2FA, isolation et capacités",
  { skip: !process.env.TEST_DATABASE_URL, timeout: 120000 },
  async (t) => {
    const url = process.env.TEST_DATABASE_URL!;
    assert.match(
      new URL(url).pathname,
      /\/hoslink_ts_test(?:_[a-z0-9]+)?$/,
      "Utiliser une base de test dédiée et vide.",
    );
    const { pool, db } = database(url),
      dir = await mkdtemp(`${tmpdir()}/hoslink-mail-`);
    try {
      await migrate(pool);
      await migrate(pool);
      const cfg = readConfig({
        DATABASE_URL: url,
        BETTER_AUTH_SECRET: "test-only-secret-with-more-than-32-characters",
        NODE_ENV: "test",
        BASE_URL: "http://localhost:8080",
        MAIL_DIR: dir,
      });
      const auth = createAuth(cfg, db),
        app = createApp(pool, auth, cfg),
        password = "Une phrase de passe 2026!";
      class Browser {
        jar = new Map<string, string>();
        csrf = "";
        async request(
          path: string,
          body?: Record<string, unknown>,
          json = false,
        ) {
          const headers: Record<string, string> = {
            Cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "),
          };
          let payload: string | undefined;
          if (body) {
            headers.Origin = cfg.BASE_URL;
            headers["Content-Type"] = json
              ? "application/json"
              : "application/x-www-form-urlencoded";
            payload = json
              ? JSON.stringify(body)
              : new URLSearchParams({ ...body, csrf: this.csrf } as Record<
                  string,
                  string
                >).toString();
          }
          const r = await app.request(cfg.BASE_URL + path, {
            method: body ? "POST" : "GET",
            headers,
            body: payload,
          });
          for (const cookie of r.headers.getSetCookie()) {
            const [part] = cookie.split(";");
            const i = part.indexOf("=");
            this.jar.set(part.slice(0, i), part.slice(i + 1));
          }
          this.csrf = this.jar.get("hoslink_csrf") || "";
          return r;
        }
        async api(path: string, body: Record<string, unknown>) {
          return this.request(`/api/auth/${path}`, body, true);
        }
      }
      const browser = new Browser();
      await browser.request("/recherche?q=spa&station=Paris&category=spa");
      const email = `${randomUUID()}@example.test`;
      let uid: number, eid: number;
      let backupCodes: string[] = [];
      await t.test(
        "inscription, email et refus avant vérification",
        async () => {
          const r = await browser.api("sign-up/email", {
            name: "Responsable",
            email,
            password,
          });
          assert.equal(r.status, 200);
          assert.notEqual(
            (await browser.api("sign-in/email", { email, password })).status,
            200,
          );
          const file = (await readdir(dir))[0],
            mail = await readFile(`${dir}/${file}`, "utf8");
          const link = mail.split("\n").find((l) => l.startsWith("http"))!;
          assert(link);
          const verify = await browser.request(link.replace(cfg.BASE_URL, ""));
          assert([200, 302].includes(verify.status));
          assert.equal(
            (await browser.api("sign-in/email", { email, password })).status,
            200,
          );
          assert.equal((await browser.request("/compte")).status, 200);
          uid = Number(
            (
              await pool.query(
                "SELECT id FROM profiles WHERE auth_user_id=(SELECT id FROM auth_user WHERE email=$1)",
                [email],
              )
            ).rows[0].id,
          );
        },
      );
      await t.test(
        "administrateur : obligation serveur avant activation confirmée",
        async () => {
          await pool.query("UPDATE profiles SET admin=true WHERE id=$1", [uid]);
          assert.equal(
            (await browser.request("/administration")).headers.get("location"),
            "/securite",
          );
          const enabled = await browser.api("two-factor/enable", { password });
          assert.equal(enabled.status, 200);
          const data = await enabled.json();
          backupCodes = data.backupCodes;
          assert(data.totpURI);
          assert(data.backupCodes.length);
          assert.equal(
            (await browser.request("/administration")).headers.get("location"),
            "/securite",
          );
          assert.notEqual(
            (
              await browser.api("two-factor/verify-totp", {
                code: ((Number(totp(data.totpURI)) + 1) % 1000000)
                  .toString()
                  .padStart(6, "0"),
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await browser.api("two-factor/verify-totp", {
                code: totp(data.totpURI),
              })
            ).status,
            200,
          );
          assert.equal((await browser.request("/administration")).status, 200);
          await browser.api("sign-out", {});
          const signin = await browser.api("sign-in/email", {
            email,
            password,
          });
          assert((await signin.json()).twoFactorRedirect);
          assert.equal(
            (await browser.request("/administration")).headers.get("location"),
            "/connexion",
          );
          assert.equal(
            (
              await browser.api("two-factor/verify-backup-code", {
                code: data.backupCodes[0],
              })
            ).status,
            200,
          );
          await browser.api("sign-out", {});
          await browser.api("sign-in/email", { email, password });
          assert.notEqual(
            (
              await browser.api("two-factor/verify-backup-code", {
                code: data.backupCodes[0],
              })
            ).status,
            200,
          );
          await browser.api("sign-in/email", { email, password });
          assert.equal(
            (
              await browser.api("two-factor/verify-backup-code", {
                code: data.backupCodes[1],
              })
            ).status,
            200,
          );
          assert.notEqual(
            (await browser.api("two-factor/disable", { password: "incorrect" }))
              .status,
            200,
          );
        },
      );
      await t.test(
        "appareil mémorisé : reconnexion, expiration, falsification et révocation",
        async () => {
          await browser.api("sign-out", {});
          assert(
            (
              await (
                await browser.api("sign-in/email", { email, password })
              ).json()
            ).twoFactorRedirect,
          );
          const verification = await browser.api(
            "two-factor/verify-backup-code",
            { code: backupCodes[3], trustDevice: true },
          );
          assert.equal(verification.status, 200);
          const trustHeader = verification.headers
            .getSetCookie()
            .find((cookie) => cookie.includes("trust_device="));
          assert(trustHeader?.includes("HttpOnly"));
          assert.match(trustHeader!, /Max-Age=2592000/i);
          assert.match(trustHeader!, /SameSite=Lax/i);
          const trustedCookie = [...browser.jar].find(([name]) =>
            name.endsWith("trust_device"),
          )!;
          assert(trustedCookie);
          await browser.api("sign-out", {});
          assert(
            !(
              await (
                await browser.api("sign-in/email", { email, password })
              ).json()
            ).twoFactorRedirect,
          );
          assert.equal((await browser.request("/administration")).status, 200);
          const newcomer = new Browser();
          assert(
            (
              await (
                await newcomer.api("sign-in/email", { email, password })
              ).json()
            ).twoFactorRedirect,
          );
          const tampered = new Browser();
          tampered.jar.set(trustedCookie[0], trustedCookie[1] + "invalid");
          assert(
            (
              await (
                await tampered.api("sign-in/email", { email, password })
              ).json()
            ).twoFactorRedirect,
          );
          await pool.query(
            "UPDATE auth_verification SET expires_at=now()-interval '1 minute' WHERE value=(SELECT auth_user_id FROM profiles WHERE id=$1) AND identifier LIKE 'trust-device-%'",
            [uid],
          );
          await browser.api("sign-out", {});
          assert(
            (
              await (
                await browser.api("sign-in/email", { email, password })
              ).json()
            ).twoFactorRedirect,
          );
          assert.equal(
            (
              await browser.api("two-factor/verify-backup-code", {
                code: backupCodes[4],
                trustDevice: true,
              })
            ).status,
            200,
          );
          await browser.request("/securite");
          assert.equal(
            (await browser.request("/securite/appareils/revoquer", {})).status,
            303,
          );
          assert.equal((await browser.request("/administration")).status, 200);
          await browser.api("sign-out", {});
          assert(
            (
              await (
                await browser.api("sign-in/email", { email, password })
              ).json()
            ).twoFactorRedirect,
          );
          assert.equal(
            (
              await browser.api("two-factor/verify-backup-code", {
                code: backupCodes[5],
                trustDevice: true,
              })
            ).status,
            200,
          );
        },
      );
      const est = async (name: string) => {
        const n = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
        const company = (
          await pool.query(
            "INSERT INTO companies(siren,name) VALUES($1,$2) RETURNING id",
            [n, name],
          )
        ).rows[0];
        return Number(
          (
            await pool.query(
              "INSERT INTO establishments(company_id,siret,name,category,station,city,address,status) VALUES($1,$2,$3,'hotel','Paris','Paris','Rue test','approved') RETURNING id",
              [company.id, n + "00001", name],
            )
          ).rows[0].id,
        );
      };
      await t.test(
        "rôles, invitations vérifiées, conversations et PDF privés",
        async () => {
          eid = await est("Établissement A");
          const other = await est("Établissement B"),
            outside = await est("Établissement C");
          await pool.query("INSERT INTO memberships VALUES($1,$2,'owner')", [
            uid,
            eid,
          ]);
          await pool.query(
            "UPDATE profiles SET current_establishment_id=$1,admin=false WHERE id=$2",
            [eid, uid],
          );
          await browser.request("/compte");
          assert.equal(
            (await browser.request("/apres-connexion")).headers.get("location"),
            "/annuaire?q=spa&station=Paris&category=spa",
          );
          const cid = Number(
            (
              await pool.query(
                "INSERT INTO conversations(a,b,subject) VALUES($1,$2,'Privé') RETURNING id",
                [Math.min(other, outside), Math.max(other, outside)],
              )
            ).rows[0].id,
          );
          const mid = (
            await pool.query(
              "INSERT INTO messages(conversation_id,sender_id,establishment_id,body) VALUES($1,$2,$3,'Secret') RETURNING id",
              [cid, uid, other],
            )
          ).rows[0].id;
          const doc = (
            await pool.query(
              "INSERT INTO attachments(message_id,name,data) VALUES($1,$2,$3) RETURNING id",
              [mid, "devis.pdf", Buffer.from("%PDF-1.7\n%%EOF")],
            )
          ).rows[0].id;
          assert.equal((await browser.request(`/messages/${cid}`)).status, 404);
          assert.equal(
            (await browser.request(`/messages/${cid}`, { body: "Injection" }))
              .status,
            404,
          );
          assert.equal(
            (await browser.request(`/documents/${doc}`)).status,
            404,
          );
          const token = randomUUID();
          await pool.query(
            "INSERT INTO tokens(token_hash,kind,establishment_id,email,expires_at) VALUES($1,'invite',$2,$3,now()+interval '1 day')",
            [hash(token), other, email],
          );
          assert.equal(
            (await browser.request("/invitation", { token })).status,
            303,
          );
          assert.equal(
            (await browser.request("/invitation", { token })).status,
            400,
          );
          assert.equal(
            (await browser.request("/changer", { establishment: other }))
              .status,
            303,
          );
          assert.equal(
            (await browser.request(`/documents/${doc}`)).status,
            200,
          );
          assert.equal(
            (await browser.request("/fiche", { description: "Interdit" }))
              .status,
            403,
          );
          await browser.request("/changer", { establishment: eid });
        },
      );
      await t.test(
        "acceptations simultanées, versions et expiration",
        async () => {
          const targets = await Promise.all(["D", "E", "F"].map(est));
          const ids = await Promise.all(
            targets.map((other) =>
              propose(pool, uid, eid, other, "Conditions initiales"),
            ),
          );
          const results = await Promise.allSettled(
            ids.map((id, i) =>
              partnershipAction(pool, uid, targets[i], id, "accepter", 1, ""),
            ),
          );
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            2,
          );
          assert.equal(
            Number(
              (
                await pool.query(
                  "SELECT count(*) FROM partnerships WHERE status='active' AND (a=$1 OR b=$1)",
                  [eid],
                )
              ).rows[0].count,
            ),
            2,
          );
          const active =
            ids[results.findIndex((r) => r.status === "fulfilled")];
          await partnershipAction(
            pool,
            uid,
            eid,
            active,
            "modifier",
            1,
            "Nouvelles conditions",
          );
          await assert.rejects(() =>
            partnershipAction(pool, uid, eid, active, "accepter", 1, ""),
          );
          assert.equal(
            (
              await pool.query(
                "SELECT * FROM partnership_versions WHERE partnership_id=$1",
                [active],
              )
            ).rowCount,
            2,
          );
          await pool.query(
            "UPDATE establishments SET subscription_until=now()+interval '1 day' WHERE id=$1",
            [eid],
          );
          for (let i = 0; i < ids.length; i++) {
            const p = (
              await pool.query(
                "SELECT status,version FROM partnerships WHERE id=$1",
                [ids[i]],
              )
            ).rows[0];
            if (p.status === "pending") {
              await partnershipAction(
                pool,
                uid,
                eid,
                ids[i],
                "accepter",
                p.version,
                "",
              );
              await partnershipAction(
                pool,
                uid,
                targets[i],
                ids[i],
                "accepter",
                p.version,
                "",
              );
            }
          }
          await pool.query(
            "UPDATE establishments SET subscription_until=now()-interval '1 minute' WHERE id=$1",
            [eid],
          );
          await Promise.all([reconcile(pool), reconcile(pool)]);
          assert.equal(
            Number(
              (
                await pool.query(
                  "SELECT count(*) FROM partnerships WHERE status='active' AND (a=$1 OR b=$1)",
                  [eid],
                )
              ).rows[0].count,
            ),
            2,
          );
        },
      );
      await t.test(
        "récupération : lien expirant et révocation des sessions",
        async () => {
          const before = new Set(await readdir(dir));
          assert.equal(
            (
              await browser.api("request-password-reset", {
                email,
                redirectTo: cfg.BASE_URL + "/reinitialiser",
              })
            ).status,
            200,
          );
          const file = (await readdir(dir)).find((name) => !before.has(name))!;
          assert(file);
          const mail = await readFile(`${dir}/${file}`, "utf8"),
            link = mail.split("\n").find((line) => line.startsWith("http"))!;
          // Better Auth redirects its reset link to the French page with the short-lived token.
          const redirect = await browser.request(
            link.replace(cfg.BASE_URL, ""),
          );
          const target = redirect.headers.get("location");
          assert(target);
          const token = new URL(target, cfg.BASE_URL).searchParams.get("token");
          assert(token);
          assert.equal(
            (
              await browser.api("reset-password", {
                token,
                newPassword: password + " nouveau",
              })
            ).status,
            200,
          );
          assert.equal(
            (await browser.request("/compte")).headers.get("location"),
            "/connexion",
          );
          assert.notEqual(
            (
              await browser.api("reset-password", {
                token,
                newPassword: password,
              })
            ).status,
            200,
          );
          // A new login still requires the configured second factor; use the remaining backup code.
          const signIn = await browser.api("sign-in/email", {
            email,
            password: password + " nouveau",
          });
          assert((await signIn.json()).twoFactorRedirect);
          assert.equal(
            (
              await browser.api("two-factor/verify-backup-code", {
                code: backupCodes[2],
              })
            ).status,
            200,
          );
        },
      );
      await t.test(
        "origine, CSRF, anciennes sessions et révocation",
        async () => {
          assert.equal(
            (
              await app.request("/changer", {
                method: "POST",
                headers: { Origin: "https://evil.example" },
              })
            ).status,
            403,
          );
          const old = new Browser();
          old.jar.set("session", "old-go-token");
          assert.equal(
            (await old.request("/compte")).headers.get("location"),
            "/connexion",
          );
          const saved = new Map(browser.jar);
          assert.equal((await browser.api("revoke-sessions", {})).status, 200);
          browser.jar = saved;
          assert.equal(
            (await browser.request("/compte")).headers.get("location"),
            "/connexion",
          );
        },
      );
      await t.test(
        "limitation des tentatives active hors environnement test",
        async () => {
          const limited = createAuth({ ...cfg, NODE_ENV: "development" }, db);
          let status = 0;
          for (let i = 0; i < 4; i++) {
            const response = await limited.handler(
              new Request(cfg.BASE_URL + "/api/auth/sign-in/email", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Origin: cfg.BASE_URL,
                },
                body: JSON.stringify({
                  email: "missing@example.test",
                  password: "incorrect-password",
                }),
              }),
            );
            status = response.status;
          }
          assert.equal(status, 429);
        },
      );
    } finally {
      await pool.end();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
