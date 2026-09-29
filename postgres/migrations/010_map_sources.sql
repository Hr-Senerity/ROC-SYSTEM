BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS source_pgm_storage_key VARCHAR(512),
  ADD COLUMN IF NOT EXISTS source_yaml_storage_key VARCHAR(512),
  ADD COLUMN IF NOT EXISTS source_pgm_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS source_yaml_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE maps DROP CONSTRAINT IF EXISTS maps_source_type_check;
ALTER TABLE maps ADD CONSTRAINT maps_source_type_check
  CHECK (source_type IN ('image', 'pgm-yaml'));
ALTER TABLE maps DROP CONSTRAINT IF EXISTS maps_source_sha256_check;
ALTER TABLE maps ADD CONSTRAINT maps_source_sha256_check CHECK (
  (source_pgm_sha256 IS NULL OR source_pgm_sha256 ~ '^[0-9a-f]{64}$') AND
  (source_yaml_sha256 IS NULL OR source_yaml_sha256 ~ '^[0-9a-f]{64}$')
);
ALTER TABLE maps DROP CONSTRAINT IF EXISTS maps_pgm_yaml_source_check;
ALTER TABLE maps ADD CONSTRAINT maps_pgm_yaml_source_check CHECK (
  source_type <> 'pgm-yaml' OR (
    source_pgm_storage_key IS NOT NULL AND
    source_yaml_storage_key IS NOT NULL AND
    source_pgm_sha256 IS NOT NULL AND
    source_yaml_sha256 IS NOT NULL AND
    coordinate_mode = 'metric' AND
    resolution IS NOT NULL
  )
);

INSERT INTO schema_migrations (version)
VALUES ('010_map_sources')
ON CONFLICT (version) DO NOTHING;

COMMIT;
