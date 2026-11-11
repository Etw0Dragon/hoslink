import { test } from "node:test";
import assert from "node:assert/strict";
import { filters, validPDF } from "../src/validation.js";
import { validSIRET } from "../src/business.js";
import { renderPage } from "../src/views/pages.js";
import { readConfig } from "../src/config.js";
test("PDF et SIRET : limites et structure", () => {
  assert(validPDF(Buffer.from("%PDF-1.7\n%%EOF")));
  assert(!validPDF(Buffer.alloc(5 * 1024 * 1024 + 1)));
  assert(!validPDF(Buffer.from("%PDF-1.7 invalid")));
  assert(validSIRET("73282932000074"));
  assert(!validSIRET("73282932000075"));
  assert(!validSIRET("x"));
});
test("recherche : seules les clés autorisées sont conservées", () => {
  assert.equal(
    filters({
      q: " spa ",
      station: "Paris",
      category: "hotel",
      redirect: "https://evil.example",
    }).toString(),
    "q=spa&station=Paris&category=hotel",
  );
  assert(!filters({ category: "invalid" }).has("category"));
});
test("la production requiert HTTPS et SMTP", () => {
  const env = {
    DATABASE_URL: "postgres://a:b@localhost/hoslink_node",
    BETTER_AUTH_SECRET: "x".repeat(40),
    NODE_ENV: "production",
  };
  assert.throws(() => readConfig(env));
  assert.throws(() =>
    readConfig({ ...env, BASE_URL: "https://hoslink.tmfolio.site" }),
  );
  assert(
    readConfig({
      ...env,
      BASE_URL: "https://hoslink.tmfolio.site",
      SMTP_URL: "smtp://localhost:1025",
    }),
  );
});
test("rendu des pages : médias, échappement et actions selon rôle", async () => {
  const html = await renderPage({ Page: "home" }).toString();
  assert(html.includes("/public/logo.png"));
  assert(html.includes("/static/auth.js"));
  assert(!html.includes("{{"));
  const directory = await renderPage({
    Page: "directory",
    User: { Name: "<script>x</script>", EstID: 1, Role: "member" },
    Items: [{ ID: 2, Name: "<script>alert(1)</script>", Category: "spa" }],
  }).toString();
  assert(!directory.includes("<script>alert(1)</script>"));
  assert(directory.includes("&lt;script&gt;"));
  assert(directory.includes("/etablissements/2"));
  const member = await renderPage({
    Page: "profile",
    User: { Name: "A", EstID: 1, Role: "member" },
    Item: { ID: 2, Name: "B" },
  }).toString();
  assert(!member.includes('action="/partenariats"'));
});
