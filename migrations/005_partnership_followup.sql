ALTER TABLE partnership_versions ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE partnership_reviews (
 id bigserial PRIMARY KEY,
 partnership_id bigint NOT NULL REFERENCES partnerships(id),
 establishment_id bigint NOT NULL REFERENCES establishments(id),
 user_id bigint NOT NULL REFERENCES profiles(id),
 outcome text NOT NULL CHECK(outcome IN ('positive','adjust','pause')),
 note text NOT NULL CHECK(length(note) BETWEEN 1 AND 2000),
 next_review date,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partnership_reviews_latest ON partnership_reviews(partnership_id,establishment_id,created_at DESC);
