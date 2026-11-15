import { test } from "node:test";
import assert from "node:assert/strict";
import { filters, validPDF } from "../src/validation.js";
import { validSIRET } from "../src/business.js";
import { renderPage } from "../src/views/pages.js";
import { readConfig } from "../src/config.js";
import { createGeocoder, verifyGeocodedPlace } from "../src/geocoding.js";
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
test("géocodage : recherche explicite limitée, cache et jeton signé", async () => {
  let calls = 0;
  const geocoder = createGeocoder(
    "https://nominatim.example.test/search",
    "secret",
    async (input, init) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("q"), "10 rue de la Paix, Paris, France");
      assert.equal(url.searchParams.get("countrycodes"), "fr");
      assert.equal(url.searchParams.get("limit"), "5");
      assert.match(String((init?.headers as Record<string, string>)["User-Agent"]), /^Hoslink\//);
      return Response.json([{
        display_name: "10 rue de la Paix, 75002 Paris, France",
        lat: "48.8698",
        lon: "2.3412",
        address: { city: "Paris" },
      }]);
    },
    () => 1_000,
    async () => {},
  );
  const places = await geocoder.search("10 rue de la Paix", "Paris");
  assert.equal(calls, 1);
  assert.equal(places[0].latitude, 48.8698);
  assert.deepEqual(await geocoder.search("10 rue de la Paix", "Paris"), places);
  assert.equal(calls, 1, "La requête identique est servie depuis le cache.");
  assert(verifyGeocodedPlace(places[0].token, places[0].address, places[0].city, "secret", 1_000));
  assert.equal(verifyGeocodedPlace(places[0].token, "Adresse modifiée", "Paris", "secret", 1_000), null);
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

test("sécurité : navigation, appareil mémorisé et accès administrateur visibles", async () => {
  const { Security, Challenge } = await import("../src/views/security.js");
  const user = {
    ID: 1,
    AuthID: "test",
    Name: "Responsable",
    Email: "test@example.test",
    Verified: true,
    Admin: true,
    TwoFactor: true,
    EstID: 0,
    EstName: "",
    Status: "",
    Role: "",
  };
  const security = await Security({
    enabled: true,
    admin: true,
    csrf: "test",
    user,
  }).toString();
  assert(security.includes('href="/administration"'));
  assert(security.includes('action="/securite/appareils/revoquer"'));
  assert(security.includes("workspace.css"));
  assert(security.includes('aria-current="page"'));
  const challenge = await Challenge().toString();
  assert(challenge.includes('name="trustDevice"'));
  assert(challenge.includes("30 jours"));
  assert(challenge.includes("/public/logo.png"));
});
test("test-prod exige HTTPS et SMTP comme la production", () => {
  const env = { NODE_ENV: "test-prod", DATABASE_URL: "postgres://a:b@localhost/hoslink_node", BETTER_AUTH_SECRET: "x".repeat(40) };
  assert.throws(() => readConfig(env));
  assert.throws(() => readConfig({...env, BASE_URL: "https://hoslink.tmfolio.site"}));
  assert.equal(readConfig({...env, BASE_URL: "https://hoslink.tmfolio.site", SMTP_URL: "smtp://localhost:1025"}).NODE_ENV, "test-prod");
});

 test("conditions de partenariat : dates et bilan validés", async () => {
 const {partnershipDetails,reviewInput} = await import("../src/partnership-details.js");
 assert.equal(partnershipDetails.parse({benefits:" Réduction "}).benefits,"Réduction");
 assert.throws(()=>partnershipDetails.parse({start:"2026-12-01",end:"2026-11-01"}));
 assert.throws(()=>partnershipDetails.parse({renewal:"2026-02-30"}));
 assert.throws(()=>reviewInput.parse({outcome:"other",note:"test"}));
 assert.throws(()=>reviewInput.parse({outcome:"positive",note:" "}));
 });
