import type pg from "pg";
import { queries } from "./queries.js";
import type { AppContext } from "./types.js";
import { renderPage } from "./views/pages.js";
import { reject, reconcile } from "./partnerships.js";
export async function project(
  pool: pg.Pool,
  query: { sql: string; fields: readonly string[] },
  args: unknown[] = [],
) {
  const r = await pool.query({
    text: query.sql,
    values: args,
    rowMode: "array",
  });
  return r.rows.map((row) =>
    Object.fromEntries(
      query.fields.map((key, i) => [
        key,
        [
          "ID",
          "OtherID",
          "Active",
          "Pending",
          "Slots",
          "Count",
          "Version",
        ].includes(key)
          ? Number(row[i])
          : row[i],
      ]),
    ),
  );
}
const titles: Record<string, string> = {
  home: "Le réseau des hôtels et prestataires",
  search: "Votre recherche de partenaires",
  dashboard: "Tableau de bord",
  directory: "Rencontrez vos prochains partenaires",
  account: "Mon établissement",
  profile: "Établissement",
  team: "Votre équipe",
  conversations: "Vos échanges",
  conversation: "Conversation",
  partnerships: "Vos partenariats",
  offers: "Votre offre",
  admin: "Validation des professionnels",
  history: "Historique des conditions",
  legal: "Informations",
};
export const page = (
  c: AppContext,
  Page: string,
  data: Record<string, unknown> = {},
) =>
  c.html(
    renderPage({
      Page,
      Title: titles[Page] || "Votre espace professionnel",
      User: c.get("user"),
      TestProd: process.env.NODE_ENV === "test-prod",
      CSRF: c.get("csrf"),
      ...data,
    }),
  );
export function pageHandlers(pool: pg.Pool) {
  return async (c: AppContext, name: keyof typeof queries) => {
    const u = c.get("user")!;
    const eid = u.EstID;
    const id = Number(c.req.param("id"));
    const q: readonly { sql: string; fields: readonly string[] }[] =
      queries[name];
    let data: Record<string, unknown> = {};
    switch (name) {
      case "account":
        data.Establishments = await project(pool, q[0], [u.ID]);
        break;
      case "directory": {
        const Query = (c.req.query("q") || "").slice(0, 160),
          Category = (c.req.query("category") || "").slice(0, 20),
          Station = (c.req.query("station") || "").slice(0, 100);
        data = {
          Query,
          Category,
          Station,
          Items: await project(pool, q[0], [eid, Query, Category, Station]),
        };
        break;
      }
      case "profile": {
        const rows = await project(pool, q[0], [id]);
        if (!rows.length) reject(404, "Établissement introuvable.");
        data = {
          Title: rows[0].Name,
          Item: Object.fromEntries(
            Object.entries(rows[0]).map(([k, v]) => [k, v]),
          ),
        };
        break;
      }
      case "team":
        data.Members = await project(pool, q[0], [eid]);
        break;
      case "admin":
        if (!u.Admin) reject(403, "Accès réservé à l’administration.");
        data.Items = await project(pool, q[0]);
        data.Messages = await project(pool, q[1]);
        break;
      case "dashboard":
        data = {
          ...(await project(pool, q[0], [eid]))[0],
          Messages: await project(pool, q[1], [eid]),
          Items: await project(pool, q[2], [eid]),
        };
        break;
      case "conversations":
        data.Items = await project(pool, q[0], [eid]);
        break;
      case "conversation": {
        const rows = await project(pool, q[0], [id, eid]);
        if (!rows.length) reject(404, "Conversation introuvable.");
        data.Item = rows[0];
        data.Messages = await project(pool, q[1], [id]);
        break;
      }
      case "partnerships":
        await reconcile(pool);
        data.Items = await project(pool, q[0], [eid]);
        break;
      case "offers":
        await reconcile(pool);
        data = { ...(await project(pool, q[0], [eid]))[0] };
        break;
      case "history":
        data.Items = await project(pool, q[0], [id, eid]);
        if (!(data.Items as unknown[]).length)
          reject(404, "Accord introuvable.");
        break;
    }
    return page(c, name, data);
  };
}
