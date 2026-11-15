CREATE TABLE business_documents (
 id bigserial PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('quote','contract')),
 establishment_id bigint NOT NULL REFERENCES establishments(id), author_id bigint NOT NULL REFERENCES profiles(id),
 recipient_id bigint NOT NULL REFERENCES establishments(id), conversation_id bigint REFERENCES conversations(id),
 title text NOT NULL, revision integer NOT NULL DEFAULT 1, draft jsonb NOT NULL,
 original_pdf bytea CHECK(octet_length(original_pdf)<=5242880), current_version integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(establishment_id<>recipient_id)
);
CREATE TABLE document_templates (
 id bigserial PRIMARY KEY, establishment_id bigint NOT NULL REFERENCES establishments(id), name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('quote','contract')), content jsonb NOT NULL, original_pdf bytea, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE document_versions (
 id bigserial PRIMARY KEY, document_id bigint NOT NULL REFERENCES business_documents(id), version integer NOT NULL,
 content jsonb NOT NULL, pdf bytea NOT NULL, sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(document_id,version)
);
CREATE TABLE document_requests (
 version_id bigint PRIMARY KEY REFERENCES document_versions(id), status text NOT NULL CHECK(status IN ('sent','accepted','refused','signing','signed','superseded')),
 partnership_id bigint, partnership_version integer,
 FOREIGN KEY(partnership_id,partnership_version) REFERENCES partnership_versions(partnership_id,version),
 final_pdf bytea, final_sha256 text
);
CREATE UNIQUE INDEX document_contract_partnership ON document_requests(partnership_id,partnership_version) WHERE partnership_id IS NOT NULL;
CREATE TABLE document_challenges (
 id bigserial PRIMARY KEY, version_id bigint NOT NULL REFERENCES document_versions(id), user_id bigint NOT NULL REFERENCES profiles(id),
 establishment_id bigint NOT NULL REFERENCES establishments(id), sha256 text NOT NULL, code_hash text NOT NULL,
 expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_challenge_member ON document_challenges(version_id,user_id,created_at DESC);
CREATE TABLE document_signatures (
 version_id bigint REFERENCES document_versions(id), establishment_id bigint REFERENCES establishments(id), user_id bigint NOT NULL REFERENCES profiles(id),
 identity jsonb NOT NULL, consent text NOT NULL, drawing jsonb NOT NULL, sha256 text NOT NULL, signed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(version_id,establishment_id)
);
CREATE TABLE document_events (
 id bigserial PRIMARY KEY, document_id bigint NOT NULL REFERENCES business_documents(id), version_id bigint REFERENCES document_versions(id),
 user_id bigint NOT NULL REFERENCES profiles(id), establishment_id bigint NOT NULL REFERENCES establishments(id), event text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE messages ADD COLUMN document_version_id bigint REFERENCES document_versions(id);
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CHECK(kind IN ('message','partnership','document'));
CREATE FUNCTION prevent_document_version_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable document evidence'; END $$;
CREATE TRIGGER immutable_document_versions BEFORE UPDATE OR DELETE ON document_versions FOR EACH ROW EXECUTE FUNCTION prevent_document_version_update();
CREATE TRIGGER immutable_document_signatures BEFORE UPDATE OR DELETE ON document_signatures FOR EACH ROW EXECUTE FUNCTION prevent_document_version_update();
CREATE TRIGGER immutable_document_events BEFORE UPDATE OR DELETE ON document_events FOR EACH ROW EXECUTE FUNCTION prevent_document_version_update();
CREATE FUNCTION protect_final_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.final_pdf IS NOT NULL AND (NEW.final_pdf IS DISTINCT FROM OLD.final_pdf OR NEW.final_sha256 IS DISTINCT FROM OLD.final_sha256) THEN
  RAISE EXCEPTION 'Immutable final document';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_final_document BEFORE UPDATE ON document_requests FOR EACH ROW EXECUTE FUNCTION protect_final_document();
