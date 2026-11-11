CREATE TABLE auth_user(id text PRIMARY KEY,name text NOT NULL,email text NOT NULL UNIQUE,email_verified boolean NOT NULL DEFAULT false,image text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),two_factor_enabled boolean DEFAULT false);
CREATE TABLE auth_session(id text PRIMARY KEY,token text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),ip_address text,user_agent text,user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE);
CREATE INDEX auth_session_user ON auth_session(user_id);
CREATE TABLE auth_account(id text PRIMARY KEY,account_id text NOT NULL,provider_id text NOT NULL,user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,access_token text,refresh_token text,id_token text,access_token_expires_at timestamptz,refresh_token_expires_at timestamptz,scope text,password text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider_id,account_id));
CREATE TABLE auth_verification(id text PRIMARY KEY,identifier text NOT NULL,value text NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX auth_verification_identifier ON auth_verification(identifier);
CREATE TABLE auth_two_factor(id text PRIMARY KEY,secret text NOT NULL,backup_codes text NOT NULL,verified boolean DEFAULT true,failed_verification_count integer DEFAULT 0,locked_until timestamptz,user_id text NOT NULL UNIQUE REFERENCES auth_user(id) ON DELETE CASCADE);

CREATE INDEX auth_two_factor_secret ON auth_two_factor(secret);
