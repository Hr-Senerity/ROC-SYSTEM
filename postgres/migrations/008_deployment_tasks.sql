BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deployment_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  resource_type VARCHAR(32) NOT NULL
    CHECK (resource_type IN ('road_network', 'map')),
  resource_revision_id UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(128) NOT NULL,
  cancel_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, created_by, idempotency_key)
);

CREATE TABLE IF NOT EXISTS deployment_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES deployment_batches(id) ON DELETE RESTRICT,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  state VARCHAR(24) NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'offered', 'accepted', 'downloading',
                     'delivering', 'delivered', 'failed', 'canceled', 'expired')),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  lease_token_hash VARCHAR(64),
  lease_expires_at TIMESTAMPTZ,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error_code VARCHAR(64),
  error_message VARCHAR(512),
  offered_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS deployment_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES deployment_tasks(id) ON DELETE CASCADE,
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  actor VARCHAR(16) NOT NULL CHECK (actor IN ('platform', 'device')),
  device_event_id UUID,
  from_state VARCHAR(24),
  to_state VARCHAR(24) NOT NULL,
  progress INTEGER CHECK (progress IS NULL OR progress BETWEEN 0 AND 100),
  code VARCHAR(64),
  message VARCHAR(512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_deployment_batches_project_created
  ON deployment_batches(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployment_tasks_vehicle_state
  ON deployment_tasks(vehicle_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployment_tasks_batch
  ON deployment_tasks(batch_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployment_events_task_sequence
  ON deployment_events(task_id, sequence);
CREATE UNIQUE INDEX IF NOT EXISTS uq_deployment_events_device_event
  ON deployment_events(device_event_id)
  WHERE device_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_deployment_batch_resource()
RETURNS trigger AS $$
BEGIN
  IF NEW.resource_type = 'road_network' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM road_network_revisions r
      JOIN maps m ON m.id = r.map_id
      WHERE r.id = NEW.resource_revision_id
        AND m.project_id = NEW.project_id
    ) THEN
      RAISE EXCEPTION 'road network revision must belong to the deployment project';
    END IF;
  ELSIF NEW.resource_type = 'map' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM map_artifacts a
      JOIN maps m ON m.id = a.map_id
      WHERE a.id = NEW.resource_revision_id
        AND m.project_id = NEW.project_id
    ) THEN
      RAISE EXCEPTION 'map artifact must belong to the deployment project';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_deployment_batch_resource ON deployment_batches;
CREATE TRIGGER trg_validate_deployment_batch_resource
BEFORE INSERT OR UPDATE OF project_id, resource_type, resource_revision_id
ON deployment_batches
FOR EACH ROW EXECUTE FUNCTION validate_deployment_batch_resource();

CREATE OR REPLACE FUNCTION validate_deployment_task_vehicle()
RETURNS trigger AS $$
DECLARE
  batch_project UUID;
  batch_resource_type VARCHAR(32);
  batch_resource UUID;
  required_map UUID;
BEGIN
  SELECT project_id, resource_type, resource_revision_id
    INTO batch_project, batch_resource_type, batch_resource
  FROM deployment_batches
  WHERE id = NEW.batch_id;

  IF NOT EXISTS (
    SELECT 1 FROM vehicles
    WHERE id = NEW.vehicle_id
      AND project_id = batch_project
      AND device_enabled = true
  ) THEN
    RAISE EXCEPTION 'deployment vehicle must belong to the project and have an enabled device token';
  END IF;

  IF batch_resource_type = 'road_network' THEN
    SELECT map_id INTO required_map
    FROM road_network_revisions
    WHERE id = batch_resource;
    IF NOT EXISTS (
      SELECT 1 FROM vehicles
      WHERE id = NEW.vehicle_id AND map_id = required_map
    ) THEN
      RAISE EXCEPTION 'road network target vehicle must be bound to the revision map';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_deployment_task_vehicle ON deployment_tasks;
CREATE TRIGGER trg_validate_deployment_task_vehicle
BEFORE INSERT OR UPDATE OF batch_id, vehicle_id
ON deployment_tasks
FOR EACH ROW EXECUTE FUNCTION validate_deployment_task_vehicle();

INSERT INTO schema_migrations (version)
VALUES ('008_deployment_tasks')
ON CONFLICT (version) DO NOTHING;

COMMIT;