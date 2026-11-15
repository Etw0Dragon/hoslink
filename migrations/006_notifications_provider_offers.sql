ALTER TABLE establishments ADD COLUMN provider_offer jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE notifications (
 id bigserial PRIMARY KEY,
 user_id bigint NOT NULL REFERENCES profiles(id),
 establishment_id bigint NOT NULL REFERENCES establishments(id),
 kind text NOT NULL CHECK(kind IN ('message','partnership')),
 entity_id bigint NOT NULL,
 title text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz,
 email_sent_at timestamptz,
 email_attempts integer NOT NULL DEFAULT 0,
 email_retry_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_inbox ON notifications(user_id,establishment_id,id DESC);
CREATE INDEX notifications_email ON notifications(email_retry_at) WHERE email_sent_at IS NULL;
CREATE TABLE conversation_reads (
 user_id bigint NOT NULL REFERENCES profiles(id),
 establishment_id bigint NOT NULL REFERENCES establishments(id),
 conversation_id bigint NOT NULL REFERENCES conversations(id),
 last_message_id bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,establishment_id,conversation_id)
);
