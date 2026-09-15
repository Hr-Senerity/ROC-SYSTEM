BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS telemetry_version BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

INSERT INTO schema_migrations (version)
VALUES ('004_telemetry_version')
ON CONFLICT (version) DO NOTHING;

COMMIT;
