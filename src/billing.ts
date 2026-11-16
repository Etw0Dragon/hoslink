import type pg from "pg";
import Stripe from "stripe";
import { transaction } from "./db/index.js";

/** Verify the signature against the raw bytes, before parsing or trusting an event. */
export function verifyStripeEvent(raw: string | Buffer, signature: string, secret: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(raw, signature, secret);
}

/** Apply a previously verified, paid Checkout Session once, atomically. */
export async function creditSlotPurchase(pool: pg.Pool, input: {
  sessionId: string;
  establishmentId: number;
  quantity: number;
}): Promise<boolean> {
  if (!/^cs_test_[A-Za-z0-9]+$/.test(input.sessionId) ||
      !Number.isSafeInteger(input.establishmentId) || input.establishmentId <= 0 ||
      !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 100)
    throw new Error("Achat de test invalide");
  return transaction(pool, async (tx) => {
    const inserted = await tx.query(
      `INSERT INTO billing_slot_purchases(stripe_session_id,establishment_id,quantity)
       VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING stripe_session_id`,
      [input.sessionId, input.establishmentId, input.quantity],
    );
    if (!inserted.rowCount) {
      const previous = await tx.query(
        "SELECT establishment_id, quantity FROM billing_slot_purchases WHERE stripe_session_id=$1",
        [input.sessionId],
      );
      if (Number(previous.rows[0].establishment_id) !== input.establishmentId || previous.rows[0].quantity !== input.quantity)
        throw new Error("Achat Stripe incohérent");
      return false;
    }
    await tx.query("UPDATE establishments SET purchased_slots=purchased_slots+$1 WHERE id=$2", [input.quantity, input.establishmentId]);
    return true;
  });
}

import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";
import { reject } from "./partnerships.js";

export function stripeClient(cfg: Config): Stripe | null {
  return cfg.STRIPE_SECRET_KEY ? new Stripe(cfg.STRIPE_SECRET_KEY) : null;
}

export async function checkout(pool: pg.Pool, stripe: Stripe, cfg: Config, establishmentId: number, _email: string, kind: "slot" | "subscription") {
  const price = kind === "slot" ? cfg.STRIPE_SLOT_PRICE_ID! : cfg.STRIPE_SUBSCRIPTION_PRICE_ID!;
  const [configuredPrice, taxRate] = await Promise.all([stripe.prices.retrieve(price), stripe.taxRates.retrieve(cfg.STRIPE_TEST_TAX_RATE_ID!)]);
  if (configuredPrice.livemode || !configuredPrice.active || configuredPrice.currency !== "eur" || !configuredPrice.unit_amount ||
      (kind === "slot" ? configuredPrice.type !== "one_time" : configuredPrice.type !== "recurring" || configuredPrice.recurring?.interval !== "month" || configuredPrice.recurring.interval_count !== 1) ||
      taxRate.livemode || !taxRate.active || taxRate.inclusive || configuredPrice.tax_behavior !== "exclusive")
    throw new Error("Prix ou TVA de test Stripe invalides");
  const customerRow = (await pool.query(`INSERT INTO billing_customers(establishment_id,request_key) VALUES($1,$2)
    ON CONFLICT(establishment_id) DO UPDATE SET establishment_id=EXCLUDED.establishment_id RETURNING *`, [establishmentId, randomUUID()])).rows[0];
  const customer = customerRow.stripe_customer_id
    ? await stripe.customers.retrieve(customerRow.stripe_customer_id)
    : await stripe.customers.create({ metadata: { establishment_id: String(establishmentId) } }, { idempotencyKey: `hoslink-customer-${customerRow.request_key}` });
  if (customer.deleted || customer.livemode || customer.metadata.establishment_id !== String(establishmentId)) throw new Error("Client Stripe incohérent");
  const mapped = (await pool.query("UPDATE billing_customers SET stripe_customer_id=$2 WHERE establishment_id=$1 AND (stripe_customer_id IS NULL OR stripe_customer_id=$2) RETURNING stripe_customer_id", [establishmentId, customer.id])).rows[0];
  if (!mapped) throw new Error("Client Stripe incohérent");
  if (kind === "subscription") {
    const existing = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 });
    if (existing.has_more || existing.data.some(s => !["canceled", "incomplete_expired"].includes(s.status)))
      reject(409, "Un abonnement existe déjà. Gérez-le depuis votre espace de facturation.");
  }
  // Serialize creation of an attempt; a retry reuses its stable Stripe idempotency key.
  const attempt = await transaction(pool, async tx => {
    await tx.query("SELECT id FROM establishments WHERE id=$1 FOR UPDATE", [establishmentId]);
    const previous = await tx.query("SELECT * FROM billing_checkouts WHERE establishment_id=$1 AND kind=$2 AND status IN ('creating','open') ORDER BY created_at DESC LIMIT 1", [establishmentId, kind]);
    if (previous.rowCount) return previous.rows[0];
    const id = randomUUID();
    return (await tx.query("INSERT INTO billing_checkouts(id,establishment_id,stripe_customer_id,kind,price_id) VALUES($1,$2,$3,$4,$5) RETURNING *", [id, establishmentId, customer.id, kind, price])).rows[0];
  });
  if (attempt.price_id !== price || attempt.stripe_customer_id !== customer.id) throw new Error("Configuration du checkout modifiée");
  if (attempt.stripe_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(attempt.stripe_session_id);
    if (existing.status === "open" && existing.url) return existing.url;
    if (existing.status === "complete") reject(409, "Votre paiement est en cours de traitement. Actualisez cette page.");
    await pool.query("UPDATE billing_checkouts SET status='expired' WHERE id=$1", [attempt.id]);
    return checkout(pool, stripe, cfg, establishmentId, _email, kind);
  }
  const metadata = { attempt_id: attempt.id, establishment_id: String(establishmentId) };
  const session = await stripe.checkout.sessions.create({
    mode: kind === "slot" ? "payment" : "subscription", customer: customer.id,
    line_items: [{ price, quantity: 1, tax_rates: [taxRate.id] }], metadata,
    ...(kind === "subscription" ? { subscription_data: { metadata } } : {}),
    success_url: `${cfg.BASE_URL}/offres?paiement=retour`, cancel_url: `${cfg.BASE_URL}/offres?paiement=annule`,
  }, { idempotencyKey: `hoslink-checkout-${attempt.id}` });
  if (session.livemode || !session.url) throw new Error("Session Stripe invalide");
  await pool.query("UPDATE billing_checkouts SET stripe_session_id=$2,status='open' WHERE id=$1 AND status='creating'", [attempt.id, session.id]);
  return session.url;
}

export async function portal(pool: pg.Pool, stripe: Stripe, cfg: Config, establishmentId: number) {
  const row = (await pool.query("SELECT stripe_customer_id FROM billing_customers WHERE establishment_id=$1", [establishmentId])).rows[0];
  if (!row) reject(409, "Aucun compte de facturation pour cet établissement.");
  const configuration = await stripe.billingPortal.configurations.retrieve(cfg.STRIPE_PORTAL_CONFIGURATION_ID!);
  if (configuration.livemode || !configuration.active || !configuration.features.subscription_cancel.enabled || configuration.features.subscription_cancel.mode !== "at_period_end" || configuration.features.subscription_update.enabled)
    throw new Error("Configuration du portail Stripe incompatible");
  const session = await stripe.billingPortal.sessions.create({ customer: row.stripe_customer_id, configuration: configuration.id, return_url: `${cfg.BASE_URL}/offres` });
  return session.url;
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id || null;
}

export async function processStripeEvent(pool: pg.Pool, stripe: Stripe, cfg: Config, event: Stripe.Event) {
  if (event.livemode) throw new Error("Événement Stripe réel interdit");
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) {
    const source = event.data.object as Stripe.Checkout.Session;
    const session = await stripe.checkout.sessions.retrieve(source.id);
    if (session.livemode) throw new Error("Session réelle interdite");
    const attempt = (await pool.query("SELECT * FROM billing_checkouts WHERE id=$1 AND stripe_session_id=$2", [session.metadata?.attempt_id || null, session.id])).rows[0];
    if (!attempt) throw new Error("Session inconnue : nouvelle tentative nécessaire");
    if (idOf(session.customer) !== attempt.stripe_customer_id || session.metadata?.establishment_id !== String(attempt.establishment_id)) throw new Error("Session incohérente");
    if (session.status === "expired" || event.type === "checkout.session.async_payment_failed") {
      await pool.query("UPDATE billing_checkouts SET status='expired' WHERE id=$1 AND status<>'complete'", [attempt.id]);
      return;
    }
    if (attempt.kind === "slot" && session.payment_status === "paid") {
      const lines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      if (lines.has_more || lines.data.length !== 1 || lines.data[0].price?.id !== attempt.price_id || lines.data[0].quantity !== 1 || session.mode !== "payment") throw new Error("Contenu du paiement invalide");
      await creditSlotPurchase(pool, { sessionId: session.id, establishmentId: Number(attempt.establishment_id), quantity: 1 });
      await pool.query("UPDATE billing_checkouts SET status='complete' WHERE id=$1", [attempt.id]);
    } else if (attempt.kind === "subscription" && session.status === "complete") {
      await pool.query("UPDATE billing_checkouts SET status='complete' WHERE id=$1", [attempt.id]);
    }
    return;
  }
  if (event.type !== "invoice.paid") return;
  const source = event.data.object as Stripe.Invoice;
  const invoice = await stripe.invoices.retrieve(source.id);
  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
  if (invoice.livemode || invoice.status !== "paid" || !subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const attempt = (await pool.query("SELECT * FROM billing_checkouts WHERE id=$1 AND kind='subscription'", [subscription.metadata.attempt_id || null])).rows[0];
  if (!attempt || subscription.livemode || idOf(subscription.customer) !== attempt.stripe_customer_id || idOf(invoice.customer) !== attempt.stripe_customer_id || subscription.metadata.establishment_id !== String(attempt.establishment_id)) throw new Error("Abonnement incohérent");
  const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 100 });
  const matching = lines.data.filter(line => line.pricing?.price_details?.price === attempt.price_id && line.period.end > line.period.start && line.amount >= 0);
  if (lines.has_more || matching.length !== 1) throw new Error("Période facturée invalide");
  const until = new Date(matching[0].period.end * 1000);
  await transaction(pool, async tx => {
    await tx.query("SELECT id FROM establishments WHERE id=$1 FOR UPDATE", [attempt.establishment_id]);
    await tx.query("INSERT INTO billing_subscriptions(stripe_subscription_id,establishment_id,stripe_customer_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [subscriptionId, attempt.establishment_id, attempt.stripe_customer_id]);
    const sub = (await tx.query("SELECT * FROM billing_subscriptions WHERE stripe_subscription_id=$1 FOR UPDATE", [subscriptionId])).rows[0];
    if (Number(sub.establishment_id) !== Number(attempt.establishment_id) || sub.stripe_customer_id !== attempt.stripe_customer_id) throw new Error("Abonnement déjà attribué");
    await tx.query("INSERT INTO billing_paid_invoices(stripe_invoice_id,stripe_subscription_id,paid_until) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [invoice.id, subscriptionId, until]);
    await tx.query("UPDATE billing_subscriptions SET paid_until=GREATEST(paid_until,$2) WHERE stripe_subscription_id=$1", [subscriptionId, until]);
    await tx.query("UPDATE establishments SET subscription_until=GREATEST(subscription_until,$2) WHERE id=$1", [attempt.establishment_id, until]);
  });
}
