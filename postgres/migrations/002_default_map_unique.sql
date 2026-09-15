BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY project_id ORDER BY created_at DESC, id) AS position
  FROM maps
  WHERE is_active = true
)
UPDATE maps
SET is_active = false
WHERE id IN (SELECT id FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_maps_default_per_project
  ON maps(project_id) WHERE is_active = true;

INSERT INTO schema_migrations (version)
VALUES ('002_default_map_unique')
ON CONFLICT (version) DO NOTHING;

COMMIT;
