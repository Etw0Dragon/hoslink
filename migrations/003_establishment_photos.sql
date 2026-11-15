CREATE TABLE establishment_photos (
 id bigserial PRIMARY KEY,
 establishment_id bigint NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('profile','gallery')),
 position integer NOT NULL DEFAULT 0 CHECK(position>=0),
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png')),
 data bytea NOT NULL CHECK(octet_length(data)<=4194304),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX establishment_profile_photo ON establishment_photos(establishment_id) WHERE kind='profile';
CREATE INDEX establishment_gallery_photos ON establishment_photos(establishment_id,position,id) WHERE kind='gallery';
