import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { makeDemoRecord, parseCounts, seedDemo } from "../src/seed-demo.js";

test("seed démo borne les quantités et exige au moins un compte", () => {
  assert.deepEqual(parseCounts(["--hotels=2", "--providers=3"]), { hotels: 2, providers: 3 });
  assert.throws(() => parseCounts([]));
  assert.throws(() => parseCounts(["--hotels=26"]));
  assert.throws(() => parseCounts(["--hotel=1"]));
});

test("seed démo génère des données identifiables et des SIRET de 14 chiffres", () => {
  const hotel = makeDemoRecord("hotel", 2);
  const provider = makeDemoRecord("provider", 1);
  assert.match(hotel.email, /^hoslink-demo-hotel-02@example\.invalid$/);
  assert.match(hotel.siret, /^\d{14}$/);
  assert.equal(hotel.category, "hotel");
  assert.match(provider.email, /^hoslink-demo-provider-01@example\.invalid$/);
  assert.match(provider.siret, /^\d{14}$/);
  assert.notEqual(provider.category, "hotel");
});

test("seed démo protège les environnements Coolify même avant connexion DB", async () => {
  await assert.rejects(
    seedDemo({ NODE_ENV: "production", DATABASE_URL: "postgres://db/hoslink_node", DEMO_SEED_PASSWORD: "password-demo-12" }, ["--hotels=1"]),
    /Cible protégée/,
  );
});

test("mot de passe du seed utilise le format Better Auth", async () => {
  const hash = await hashPassword("mot-de-passe-de-demo-123");
  assert.equal(await verifyPassword({ hash, password: "mot-de-passe-de-demo-123" }), true);
  assert.equal(await verifyPassword({ hash, password: "mauvais-mot-de-passe" }), false);
});
