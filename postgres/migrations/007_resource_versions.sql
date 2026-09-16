BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS road_network_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  network JSONB NOT NULL,
  content_type VARCHAR(96) NOT NULL DEFAULT 'application/vnd.roc.road-network+json',
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (map_id, version)
);

CREATE TABLE IF NOT EXISTS map_artifacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  storage_key VARCHAR(512) NOT NULL UNIQUE,
  content_type VARCHAR(96) NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 52428800),
  sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  image_width INTEGER CHECK (image_width IS NULL OR image_width > 0),
  image_height INTEGER CHECK (image_height IS NULL OR image_height > 0),
  resolution DOUBLE PRECISION CHECK (resolution IS NULL OR resolution > 0),
  origin_x DOUBLE PRECISION,
  origin_y DOUBLE PRECISION,
  origin_theta DOUBLE PRECISION,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (map_id, version)
);

CREATE INDEX IF NOT EXISTS idx_road_network_revisions_map
  ON road_network_revisions(map_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_map_artifacts_map
  ON map_artifacts(map_id, version DESC);

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS delivered_map_artifact_id UUID
    REFERENCES map_artifacts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS delivered_road_revision_id UUID
    REFERENCES road_network_revisions(id) ON DELETE RESTRICT;

INSERT INTO schema_migrations (version)
VALUES ('007_resource_versions')
ON CONFLICT (version) DO NOTHING;

COMMIT;