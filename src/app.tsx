import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "@hono/node-server/serve-static";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type pg from "pg";
import type { Auth } from "./auth.js";
import type { Config } from "./config.js";
import type { Env, Identity } from "./types.js";
import { page, pageHandlers } from "./pages.js";
import { drizzle } from "drizzle-orm/node-postgres";
import { profiles } from "./db/schema.js";
import { business } from "./business.js";
import { filters } from "./validation.js";
import { Security, Challenge } from "./views/security.js";
export function createApp(pool: pg.Pool, auth: Auth, cfg: Config) {
  const app = new Hono<Env>();
  const orm = drizzle(pool);
  const attempts = new Map<string, { at: number; count: number }>();
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
      referrerPolicy: "same-origin",
    }),
  );
  app.use(
    "*",
    bodyLimit({
      maxSize: 6 * 1024 * 1024,
      onError: (c) => c.text("Formulaire trop volumineux.", 413),
    }),
  );
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.get("/healthz", async (c) => {
    try {
      await pool.query("SELECT 1");
      return c.text("ok");
    } catch {
      return c.text("unavailable", 503);
    }
  });
  app.get("/public/logo.png", serveStatic({ path: "./public/logo.png" }));
  app.get("/static/*", serveStatic({ root: "./web" }));
  // Better Auth owns authentication, its cookies, origin/CSRF and rate limiting.
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  app.use("*", async (c, next) => {
    let csrf = getCookie(c, "hoslink_csrf");
    if (!csrf || !/^[a-f0-9]{64}$/.test(csrf)) {
      csrf = randomBytes(32).toString("hex");
      setCookie(c, "hoslink_csrf", csrf, {
        path: "/",
        httpOnly: true,
        secure: ["production", "test-prod"].includes(cfg.NODE_ENV),
        sameSite: "Lax",
        maxAge: 86400,
      });
    }
    c.set("csrf", csrf);
    c.set("user", null);
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      if (c.req.header("Origin") !== cfg.BASE_URL)
        return c.text("Origine refusée.", 403);
      const f = await c.req.parseBody(),
        provided = String(f.csrf || "");
      if (
        !/^[a-f0-9]{64}$/.test(provided) ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(csrf))
      )
        return c.text("Session de formulaire expirée.", 403);
    }
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session) {
      await orm
        .insert(profiles)
        .values({ authUserId: session.user.id })
        .onConflictDoNothing();
      const p = (
        await pool.query(
          `SELECT p.id,p.admin,e.id AS est_id,e.name AS est_name,e.category AS est_category,e.status,m.role FROM profiles p
 LEFT JOIN memberships m ON m.user_id=p.id AND m.establishment_id=COALESCE(p.current_establishment_id,(SELECT min(establishment_id) FROM memberships WHERE user_id=p.id))
 LEFT JOIN establishments e ON e.id=m.establishment_id WHERE p.auth_user_id=$1`,
          [session.user.id],
        )
      ).rows[0];
      const u: Identity = {
        ID: Number(p.id),
        AuthID: session.user.id,
        Name: session.user.name,
        Email: session.user.email,
        Verified: session.user.emailVerified,
        Admin: p.admin,
        TwoFactor: !!session.user.twoFactorEnabled,
        EstID: Number(p.est_id || 0),
        EstName: p.est_name || "",
        EstCategory: p.est_category || "",
        Status: p.status || "",
        Role: p.role || "",
      };
      c.set("user", u);
    }
    await next();
  });
  app.get("/", (c) => {
    const u = c.get("user");
    return u
      ? c.redirect(
          u.Status === "approved" ? "/tableau-de-bord" : "/compte",
          303,
        )
      : page(c, "home");
  });
  app.get("/presentation", (c) => page(c, "home"));
  app.get("/informations", (c) => page(c, "legal"));
  app.get("/recherche", (c) => {
    const f = filters(c.req.query()),
      u = c.get("user");
    if (u?.Verified && u.Status === "approved")
      return c.redirect(`/annuaire?${f}`, 303);
    setCookie(c, "directory_search", f.toString(), {
      path: "/",
      httpOnly: true,
      secure: ["production", "test-prod"].includes(cfg.NODE_ENV),
      sameSite: "Lax",
      maxAge: 1800,
    });
    return page(c, "search", {
      Query: f.get("q"),
      Category: f.get("category"),
      Station: f.get("station"),
    });
  });
  for (const name of [
    "connexion",
    "inscription",
    "mot-de-passe",
    "reinitialiser",
    "verifier",
    "invitation",
  ])
    app.get(`/${name}`, (c) =>
      page(c, name, { Token: c.req.query("token") || "" }),
    );
  app.get("/double-authentification", (c) => c.html(<Challenge />));
  const basePrivate = [
    "/compte",
    "/securite",
    "/securite/appareils/revoquer",
    "/etablissement",
    "/changer",
    "/invitation",
    "/deconnexion",
    "/renvoyer-verification",
    "/administration",
    "/apres-connexion",
  ];
  const ownerPatterns = [
    /^\/etablissement$/,
    /^\/fiche$/,
    /^\/equipe\/.*$/,
    /^\/partenariats(?:\/\d+\/[^/]+)?$/,
  ];
  app.use("*", async (c, next) => {
    const path = c.req.path,
      u = c.get("user");
    if (!u) return c.redirect("/connexion", 303);
    // Every private route and mutation is blocked until an administrator has confirmed enrollment.
    if (
      u.Admin &&
      !u.TwoFactor &&
      !["/securite", "/deconnexion"].includes(path)
    )
      return c.redirect("/securite", 303);
    if (
      !u.Verified &&
      !["/compte", "/deconnexion", "/renvoyer-verification"].includes(path)
    )
      return c.redirect("/compte", 303);
    if (
      !basePrivate.includes(path) &&
      !path.startsWith("/administration/") &&
      (!u.EstID || u.Status !== "approved")
    )
      return c.redirect("/compte", 303);
    if (
      c.req.method === "POST" &&
      ownerPatterns.some((r) => r.test(path)) &&
      path !== "/etablissement" &&
      u.Role !== "owner"
    )
      return c.text("Action réservée au responsable.", 403);
    if (c.req.method === "POST") {
      const now = Date.now();
      for (const [key, value] of attempts)
        if (now - value.at > 60000) attempts.delete(key);
      const key = String(u.ID),
        entry = attempts.get(key) || { at: now, count: 0 };
      entry.count++;
      attempts.set(key, entry);
      if (entry.count > 60)
        return c.text("Trop de demandes. Réessayez dans une minute.", 429);
    }
    await next();
  });
  app.get("/securite", (c) =>
    c.html(
      <Security
        csrf={c.get("csrf")}
        user={c.get("user")!}
        forgotten={c.req.query("appareils") === "revoques"}
        enabled={c.get("user")!.TwoFactor}
        admin={c.get("user")!.Admin}
      />,
    ),
  );
  app.post("/securite/appareils/revoquer", async (c) => {
    await pool.query(
      "DELETE FROM auth_verification WHERE value=$1 AND identifier LIKE 'trust-device-%'",
      [c.get("user")!.AuthID],
    );
    return c.redirect("/securite?appareils=revoques", 303);
  });
  app.get("/apres-connexion", (c) => {
    const cookie = getCookie(c, "directory_search");
    if (cookie && c.get("user")!.Status === "approved") {
      const f = filters(Object.fromEntries(new URLSearchParams(cookie)));
      setCookie(c, "directory_search", "", { path: "/", maxAge: 0 });
      return c.redirect(`/annuaire?${f}`, 303);
    }
    return c.redirect(
      c.get("user")!.Admin
        ? "/administration"
        : c.get("user")!.Status === "approved"
          ? "/tableau-de-bord"
          : "/compte",
      303,
    );
  });
  const handler = pageHandlers(pool);
  const routes = {
    "/compte": "account",
    "/annuaire": "directory",
    "/etablissements/:id": "profile",
    "/equipe": "team",
    "/administration": "admin",
    "/tableau-de-bord": "dashboard",
    "/messages": "conversations",
    "/messages/:id": "conversation",
    "/partenariats": "partnerships",
    "/offres": "offers",
    "/partenariats/:id/historique": "history",
  } as const;
  for (const [path, name] of Object.entries(routes))
    app.get(path, (c) => handler(c, name));
  business(app, pool, cfg);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.text(err.message, err.status);
    if (err instanceof ZodError)
      return c.text("Formulaire invalide. Vérifiez les informations.", 400);
    if ((err as { code?: string }).code === "23505")
      return c.text("Cette entrée existe déjà.", 409);
    // No request body, URL, auth token or DB parameters are logged.
    console.error("request failed", { type: err.name });
    return c.text("Une erreur est survenue. Réessayez.", 500);
  });
  return app;
}
