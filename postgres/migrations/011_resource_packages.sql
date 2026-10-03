BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE road_network_revisions
  DROP CONSTRAINT IF EXISTS road_network_revisions_schema_version_check;
ALTER TABLE road_network_revisions
  ADD CONSTRAINT road_network_revisions_schema_version_check
  CHECK (schema_version IN (1, 2));

ALTER TABLE map_artifacts
  ADD COLUMN IF NOT EXISTS package_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS map_format VARCHAR(32),
  ADD COLUMN IF NOT EXISTS coordinate_mode VARCHAR(32);

ALTER TABLE map_artifacts DROP CONSTRAINT IF EXISTS map_artifacts_package_version_check;
ALTER TABLE map_artifacts ADD CONSTRAINT map_artifacts_package_version_check
  CHECK (package_version IN (1, 2));
ALTER TABLE map_artifacts DROP CONSTRAINT IF EXISTS map_artifacts_map_format_check;
ALTER TABLE map_artifacts ADD CONSTRAINT map_artifacts_map_format_check
  CHECK (map_format IS NULL OR map_format IN ('png', 'jpeg', 'pgm-yaml'));
ALTER TABLE map_artifacts DROP CONSTRAINT IF EXISTS map_artifacts_coordinate_mode_check;
ALTER TABLE map_artifacts ADD CONSTRAINT map_artifacts_coordinate_mode_check
  CHECK (coordinate_mode IS NULL OR coordinate_mode IN ('legacy-normalized', 'metric'));

UPDATE map_artifacts artifact
SET map_format = CASE
      WHEN artifact.content_type = 'image/png' THEN 'png'
      WHEN artifact.content_type = 'image/jpeg' THEN 'jpeg'
      ELSE NULL
    END,
    coordinate_mode = map.coordinate_mode
FROM maps map
WHERE map.id = artifact.map_id
  AND (artifact.map_format IS NULL OR artifact.coordinate_mode IS NULL);

CREATE TABLE IF NOT EXISTS map_artifact_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artifact_id UUID NOT NULL REFERENCES map_artifacts(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL
    CHECK (role IN ('image', 'pgm', 'yaml')),
  file_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  content_type VARCHAR(96) NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 52428800),
  sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (artifact_id, role),
  UNIQUE (artifact_id, file_name)
);

INSERT INTO map_artifact_files
  (artifact_id, role, file_name, storage_key, content_type, byte_size, sha256)
SELECT id, 'image', storage_key, storage_key, content_type, byte_size, sha256
FROM map_artifacts
ON CONFLICT (artifact_id, role) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_map_artifact_files_artifact
  ON map_artifact_files(artifact_id, role);

INSERT INTO schema_migrations (version)
VALUES ('011_resource_packages')
ON CONFLICT (version) DO NOTHING;

COMMIT;
