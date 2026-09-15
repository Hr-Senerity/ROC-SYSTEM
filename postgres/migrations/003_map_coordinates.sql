BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS coordinate_mode VARCHAR(32) NOT NULL DEFAULT 'legacy-normalized',
  ADD COLUMN IF NOT EXISTS image_width INTEGER,
  ADD COLUMN IF NOT EXISTS image_height INTEGER,
  ADD COLUMN IF NOT EXISTS resolution DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS origin_theta DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE maps DROP CONSTRAINT IF EXISTS maps_coordinate_mode_check;
ALTER TABLE maps ADD CONSTRAINT maps_coordinate_mode_check
  CHECK (coordinate_mode IN ('legacy-normalized', 'metric'));
ALTER TABLE maps DROP CONSTRAINT IF EXISTS maps_image_dimensions_check;
ALTER TABLE maps ADD CONSTRAINT maps_image_dimensions_check
  CHECK ((image_width IS NULL AND image_height IS NULL) OR
         (image_width > 0 AND image_height > 0));
ALTER TABLE maps DROP CONSTRAINT IF EXISTS maps_resolution_check;
ALTER TABLE maps ADD CONSTRAINT maps_resolution_check
  CHECK (resolution IS NULL OR resolution > 0);

INSERT INTO schema_migrations (version)
VALUES ('003_map_coordinates')
ON CONFLICT (version) DO NOTHING;

COMMIT;
