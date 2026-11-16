import Stripe from "stripe";

// Explicit sandbox provisioning; never print or persist the API key.
const secret = process.env.STRIPE_SECRET_KEY;
if (!secret?.startsWith("sk_test_")) throw new Error("STRIPE_SECRET_KEY doit être une clé de test Stripe");
const stripe = new Stripe(secret);
let rate: Stripe.TaxRate | undefined;
for await (const candidate of stripe.taxRates.list({ active: true, limit: 100 })) {
  if (candidate.metadata?.hoslink_sandbox === "vat_20_v1") { rate = candidate; break; }
}
rate ??= await stripe.taxRates.create({
  display_name: "TVA test",
  description: "Simulation Hoslink : taux provisoire, sans validation fiscale",
  country: "FR",
  percentage: 20,
  inclusive: false,
  metadata: { hoslink_sandbox: "vat_20_v1" },
}, { idempotencyKey: "hoslink-sandbox-vat-20-v1" });
if (rate.livemode || !rate.active || rate.percentage !== 20 || rate.inclusive) throw new Error("Taux de test inattendu");
console.log(`STRIPE_TEST_TAX_RATE_ID=${rate.id}`);
