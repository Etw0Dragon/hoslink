CREATE TABLE profiles (
 id bigserial PRIMARY KEY, auth_user_id text NOT NULL UNIQUE REFERENCES auth_user(id) ON DELETE CASCADE,
 admin boolean NOT NULL DEFAULT false, current_establishment_id bigint,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE companies(id bigserial PRIMARY KEY, siren text NOT NULL UNIQUE CHECK(siren ~ '^[0-9]{9}$'), name text NOT NULL);
CREATE TABLE establishments (
 id bigserial PRIMARY KEY, company_id bigint NOT NULL REFERENCES companies(id),
 siret text NOT NULL UNIQUE CHECK(siret ~ '^[0-9]{14}$'), name text NOT NULL,
 category text NOT NULL CHECK(category IN ('hotel','ski','spa','activite','autre')),
 station text NOT NULL, city text NOT NULL, address text NOT NULL,
 description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','suspended')),
 purchased_slots integer NOT NULL DEFAULT 0 CHECK(purchased_slots>=0), subscription_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships(user_id bigint REFERENCES profiles(id), establishment_id bigint REFERENCES establishments(id), role text NOT NULL CHECK(role IN ('owner','member')), PRIMARY KEY(user_id,establishment_id));
CREATE TABLE tokens(token_hash text PRIMARY KEY, user_id bigint REFERENCES profiles(id) ON DELETE CASCADE, kind text NOT NULL CHECK(kind='invite'), establishment_id bigint REFERENCES establishments(id), email text, expires_at timestamptz NOT NULL);
CREATE TABLE conversations(id bigserial PRIMARY KEY, a bigint NOT NULL REFERENCES establishments(id), b bigint NOT NULL REFERENCES establishments(id), subject text NOT NULL, quote boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), CHECK(a<b));
CREATE TABLE messages(id bigserial PRIMARY KEY, conversation_id bigint NOT NULL REFERENCES conversations(id), sender_id bigint NOT NULL REFERENCES profiles(id), establishment_id bigint NOT NULL REFERENCES establishments(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE attachments(id bigserial PRIMARY KEY, message_id bigint NOT NULL REFERENCES messages(id), name text NOT NULL, data bytea NOT NULL CHECK(octet_length(data)<=5242880));
CREATE TABLE partnerships(id bigserial PRIMARY KEY, a bigint NOT NULL REFERENCES establishments(id), b bigint NOT NULL REFERENCES establishments(id), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended','ended')), version integer NOT NULL DEFAULT 1, accepted_a boolean NOT NULL DEFAULT false, accepted_b boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), activated_at timestamptz, CHECK(a<b), UNIQUE(a,b));
CREATE TABLE partnership_versions(partnership_id bigint REFERENCES partnerships(id), version integer NOT NULL, terms text NOT NULL, author_id bigint NOT NULL REFERENCES profiles(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(partnership_id,version));
CREATE TABLE retained_partnerships(establishment_id bigint REFERENCES establishments(id), partnership_id bigint REFERENCES partnerships(id), PRIMARY KEY(establishment_id,partnership_id));
CREATE TABLE audit(id bigserial PRIMARY KEY, user_id bigint REFERENCES profiles(id), action text NOT NULL, entity_id bigint NOT NULL, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX memberships_est ON memberships(establishment_id);
CREATE INDEX messages_conversation ON messages(conversation_id,id);
CREATE INDEX partnerships_a ON partnerships(a,status);
CREATE INDEX partnerships_b ON partnerships(b,status);
ALTER TABLE profiles ADD FOREIGN KEY(current_establishment_id) REFERENCES establishments(id);
CREATE VIEW users AS SELECT p.id,u.email,u.name,u.email_verified AS verified,p.admin FROM profiles p JOIN auth_user u ON u.id=p.auth_user_id;
