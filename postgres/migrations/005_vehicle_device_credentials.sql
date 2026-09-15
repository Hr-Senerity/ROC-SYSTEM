BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS device_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS device_token_hint VARCHAR(12),
  ADD COLUMN IF NOT EXISTS device_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_device_token_hash
  ON vehicles(device_token_hash)
  WHERE device_token_hash IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('005_vehicle_device_credentials')
ON CONFLICT (version) DO NOTHING;

COMMIT;
