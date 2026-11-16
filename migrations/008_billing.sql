-- Payment records are scoped to an establishment and uniquely keyed by Stripe's
-- Checkout Session, so retries cannot grant the same slot twice.
CREATE TABLE billing_slot_purchases (
  stripe_session_id text PRIMARY KEY,
  establishment_id bigint NOT NULL REFERENCES establishments(id),
  quantity integer NOT NULL CHECK (quantity > 0 AND quantity <= 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_customers (
 establishment_id bigint PRIMARY KEY REFERENCES establishments(id),
 stripe_customer_id text UNIQUE,
 request_key uuid NOT NULL UNIQUE
);
CREATE TABLE billing_checkouts (
 id uuid PRIMARY KEY,
 establishment_id bigint NOT NULL REFERENCES establishments(id),
 stripe_customer_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('slot','subscription')),
 price_id text NOT NULL,
 stripe_session_id text UNIQUE,
 status text NOT NULL DEFAULT 'creating' CHECK(status IN ('creating','open','complete','expired')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX billing_one_subscription_checkout ON billing_checkouts(establishment_id) WHERE kind='subscription' AND status IN ('creating','open');
CREATE TABLE billing_subscriptions (
 stripe_subscription_id text PRIMARY KEY,
 establishment_id bigint NOT NULL REFERENCES establishments(id),
 stripe_customer_id text NOT NULL,
 paid_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_paid_invoices (
 stripe_invoice_id text PRIMARY KEY,
 stripe_subscription_id text NOT NULL REFERENCES billing_subscriptions(stripe_subscription_id),
 paid_until timestamptz NOT NULL
);
