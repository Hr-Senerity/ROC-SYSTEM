BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS device_protocol_version INTEGER,
  ADD COLUMN IF NOT EXISTS device_library_version VARCHAR(64),
  ADD COLUMN IF NOT EXISTS device_last_sequence BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS device_connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS device_disconnected_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE vehicles
    ADD CONSTRAINT chk_vehicles_device_last_sequence_nonnegative
    CHECK (device_last_sequence >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO schema_migrations (version)
VALUES ('006_device_protocol_v1')
ON CONFLICT (version) DO NOTHING;

COMMIT;