BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE deployment_events
  ADD COLUMN IF NOT EXISTS request_body JSONB,
  ADD COLUMN IF NOT EXISTS request_digest CHAR(64),
  ADD COLUMN IF NOT EXISTS attempt INTEGER,
  ADD COLUMN IF NOT EXISTS lease_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

ALTER TABLE deployment_events
  DROP CONSTRAINT IF EXISTS deployment_events_request_digest_check;
ALTER TABLE deployment_events
  ADD CONSTRAINT deployment_events_request_digest_check
  CHECK (request_digest IS NULL OR request_digest ~ '^[0-9a-f]{64}$');

ALTER TABLE deployment_events
  DROP CONSTRAINT IF EXISTS deployment_events_attempt_check;
ALTER TABLE deployment_events
  ADD CONSTRAINT deployment_events_attempt_check
  CHECK (attempt IS NULL OR attempt > 0);

ALTER TABLE deployment_events
  DROP CONSTRAINT IF EXISTS deployment_events_lease_token_hash_check;
ALTER TABLE deployment_events
  ADD CONSTRAINT deployment_events_lease_token_hash_check
  CHECK (lease_token_hash IS NULL OR lease_token_hash ~ '^[0-9a-f]{64}$');

INSERT INTO schema_migrations (version)
VALUES ('012_deployment_event_replay')
ON CONFLICT (version) DO NOTHING;

COMMIT;
