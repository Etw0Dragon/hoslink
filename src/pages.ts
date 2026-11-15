import type pg from "pg";
import { queries } from "./queries.js";
import type { AppContext } from "./types.js";
import { renderPage } from "./views/pages.js";
import { reject, reconcile } from "./partnerships.js";
import type { Config } from "./config.js";
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
        row[i] !== null && [
          "ID",
          "OtherID",
          "Active",
          "Pending",
          "Slots",
          "Count",
          "Version",
          "PhotoID",
          "Latitude",
          "Longitude",
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
export const page = async (
  c: AppContext,
  Page: string,
  data: Record<string, unknown> = {},
) =>
  c.html(
    "<!doctype html>" + await renderPage({
      Page,
      Title: titles[Page] || "Votre espace professionnel",
      User: c.get("user"),
      TestProd: process.env.NODE_ENV === "test-prod",
      CSRF: c.get("csrf"),
      ...data,
    }),
  );
export function pageHandlers(pool: pg.Pool, cfg: Config) {
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
        data.MapTileURL = cfg.MAP_TILE_URL;
        data.MapTileAttribution = cfg.MAP_TILE_ATTRIBUTION;
        if (eid) {
          const establishment = (
            await pool.query(
              "SELECT address,city,latitude,longitude FROM establishments WHERE id=$1",
              [eid],
            )
          ).rows[0];
          const profilePhoto = (
            await pool.query(
              "SELECT id FROM establishment_photos WHERE establishment_id=$1 AND kind='profile'",
              [eid],
            )
          ).rows[0];
          const photos = u.EstCategory === "hotel"
            ? (
                await pool.query(
                  "SELECT id FROM establishment_photos WHERE establishment_id=$1 AND kind='gallery' ORDER BY position,id",
                  [eid],
                )
              ).rows.map((row) => ({ ID: Number(row.id) }))
            : [];
          data.PhotoID = Number(profilePhoto?.id || 0);
          data.Photos = photos;
          data.GalleryRemaining = Math.max(0, 8 - photos.length);
          data.Address = establishment.address;
          data.City = establishment.city;
          data.Latitude = establishment.latitude;
          data.Longitude = establishment.longitude;
        }
        break;
      case "directory": {
        const Query = (c.req.query("q") || "").slice(0, 160),
          allowedCategories = u.EstCategory === "hotel"
            ? ["ski", "spa", "activite", "autre"]
            : ["hotel"],
          requestedCategories = c.req.queries("categories") || [],
          legacyCategory = c.req.query("category") || "",
          filterCategories = c.req.query("category_filter") === "1"
            ? requestedCategories.filter((value) => allowedCategories.includes(value))
            : legacyCategory === "prestataires"
              ? allowedCategories
            : legacyCategory
              ? allowedCategories.includes(legacyCategory) ? [legacyCategory] : []
              : allowedCategories,
          Station = (c.req.query("station") || "").slice(0, 100),
          City = (c.req.query("city") || "").slice(0, 120),
          Address = (c.req.query("address") || "").slice(0, 160),
          rawBounds = c.req.query("bbox") || "",
          coordinates = rawBounds.split(",").map(Number),
          Bounds = coordinates.length === 4 && coordinates.every(Number.isFinite) &&
              coordinates[0] >= -180 && coordinates[0] <= 180 &&
              coordinates[2] >= -180 && coordinates[2] <= 180 &&
              coordinates[1] >= -90 && coordinates[1] <= 90 &&
              coordinates[3] >= -90 && coordinates[3] <= 90 &&
              coordinates[1] <= coordinates[3]
            ? coordinates
            : null;
        data = {
          Query,
          Categories: filterCategories,
          AllowedCategories: allowedCategories,
          Station,
          City,
          Address,
          Bounds,
          MapTileURL: cfg.MAP_TILE_URL,
          MapTileAttribution: cfg.MAP_TILE_ATTRIBUTION,
          Items: await project(pool, q[0], [
            eid,
            Query,
            filterCategories,
            Station,
            City,
            Address,
            Bounds ? Bounds[0] : null,
            Bounds ? Bounds[1] : null,
            Bounds ? Bounds[3] : null,
            Bounds ? Bounds[0] : null,
            Bounds ? Bounds[2] : null,
          ]),
        };
        break;
      }
      case "profile": {
        const rows = await project(pool, q[0], [id]);
        if (!rows.length) reject(404, "Établissement introuvable.");
        data = {
          Title: rows[0].Name,
          MapTileURL: cfg.MAP_TILE_URL,
          MapTileAttribution: cfg.MAP_TILE_ATTRIBUTION,
          Item: Object.fromEntries(
            Object.entries(rows[0]).map(([k, v]) => [k, v]),
          ),
        };
        if (rows[0].Category === "hotel")
          data.Photos = (
            await pool.query(
              "SELECT id FROM establishment_photos WHERE establishment_id=$1 AND kind='gallery' ORDER BY position,id",
              [id],
            )
          ).rows.map((row) => ({ ID: Number(row.id) }));
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
          Items: await project(pool, q[2], [eid, u.EstCategory || ""]),
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
