ALTER TABLE establishments
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision,
  ADD CONSTRAINT establishment_coordinates_pair CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  );

CREATE INDEX establishments_coordinates_idx
  ON establishments(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
