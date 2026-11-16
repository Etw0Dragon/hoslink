import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { verifyStripeEvent } from "../src/billing.js";

test("Stripe : la signature protège les octets reçus et refuse les altérations", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_test", object: "event", type: "checkout.session.completed" });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(verifyStripeEvent(payload, signature, secret).id, "evt_test");
  assert.throws(() => verifyStripeEvent(payload + " ", signature, secret));
  assert.throws(() => verifyStripeEvent(payload, signature, "whsec_wrong"));
});

import { randomUUID } from "node:crypto";
import { database } from "../src/db/index.js";
import { migrate } from "../src/db/migrate.js";
import { processStripeEvent } from "../src/billing.js";
import { readConfig } from "../src/config.js";

test("Stripe PostgreSQL : droits, doublons, échecs et factures désordonnées", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const url = process.env.TEST_DATABASE_URL!;
  assert.match(new URL(url).pathname, /\/hoslink_ts_test(?:_[a-z0-9]+)?$/);
  const { pool } = database(url);
  try {
    await migrate(pool);
    const cfg = readConfig({ DATABASE_URL: url, BETTER_AUTH_SECRET: "test-only-secret-with-more-than-32-characters", NODE_ENV: "test" });
    const company = (await pool.query("INSERT INTO companies(siren,name) VALUES($1,'Test') RETURNING id", [String(Math.floor(Math.random()*1e9)).padStart(9,"0")])).rows[0].id;
    const establishment = (await pool.query("INSERT INTO establishments(company_id,siret,name,category,station,city,address,status) VALUES($1,$2,'Test','hotel','Paris','Paris','Paris','approved') RETURNING id", [company, String(Math.floor(Math.random()*1e14)).padStart(14,"0")])).rows[0].id;
    const slotAttempt = randomUUID(), subAttempt = randomUUID();
    const suffix = randomUUID().replaceAll("-", ""), slotSession = `cs_test_${suffix}`, subSession = `cs_test_sub${suffix}`, subscriptionId = `sub_${suffix}`, newInvoice = `in_new${suffix}`, oldInvoice = `in_old${suffix}`;
    await pool.query("INSERT INTO billing_checkouts(id,establishment_id,stripe_customer_id,kind,price_id,stripe_session_id,status) VALUES($1,$2,'cus_test','slot','price_slot',$4,'open'),($3,$2,'cus_test','subscription','price_sub',$5,'open')", [slotAttempt, establishment, subAttempt, slotSession, subSession]);
    let paid = false, end = 1900000000;
    const stripe = {
      checkout: { sessions: {
        retrieve: async () => ({ id: slotSession, livemode:false, metadata:{attempt_id:slotAttempt,establishment_id:String(establishment)}, customer:"cus_test", status:"complete", mode:"payment", payment_status:paid?"paid":"unpaid" }),
        listLineItems: async () => ({ has_more:false,data:[{price:{id:"price_slot"},quantity:1}] }),
      }},
      invoices: {
        retrieve: async (id: string) => ({id,livemode:false,status:"paid",customer:"cus_test",parent:{subscription_details:{subscription:subscriptionId}}}),
        listLineItems: async () => ({has_more:false,data:[{pricing:{price_details:{price:"price_sub"}},period:{start:end-1000,end},amount:1000}]}),
      },
      subscriptions: { retrieve: async () => ({livemode:false,customer:"cus_test",metadata:{attempt_id:subAttempt,establishment_id:String(establishment)}}) },
    } as unknown as Stripe;
    const event = (type:string,id:string) => ({type,livemode:false,data:{object:{id}}}) as Stripe.Event;
    await processStripeEvent(pool,stripe,cfg,event("checkout.session.completed",slotSession));
    assert.equal((await pool.query("SELECT purchased_slots FROM establishments WHERE id=$1",[establishment])).rows[0].purchased_slots,0);
    paid=true;
    await Promise.all(Array.from({length:5},()=>processStripeEvent(pool,stripe,cfg,event("checkout.session.async_payment_succeeded",slotSession))));
    assert.equal((await pool.query("SELECT purchased_slots FROM establishments WHERE id=$1",[establishment])).rows[0].purchased_slots,1);
    await processStripeEvent(pool,stripe,cfg,event("invoice.paid",newInvoice));
    end -= 5000;
    await processStripeEvent(pool,stripe,cfg,event("invoice.paid",oldInvoice));
    await processStripeEvent(pool,stripe,cfg,event("invoice.payment_failed","in_failed"));
    assert.equal(Math.floor((await pool.query("SELECT subscription_until FROM establishments WHERE id=$1",[establishment])).rows[0].subscription_until.getTime()/1000),1900000000);
    await assert.rejects(processStripeEvent(pool,stripe,cfg,{...event("invoice.paid",newInvoice),livemode:true}));
  } finally { await pool.end(); }
});
