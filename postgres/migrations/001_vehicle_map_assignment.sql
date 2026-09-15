BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS map_id UUID REFERENCES maps(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_vehicles_map ON vehicles(map_id);

CREATE OR REPLACE FUNCTION enforce_vehicle_map_project()
RETURNS trigger AS $$
BEGIN
  IF NEW.project_id IS NULL THEN
    NEW.map_id := NULL;
  ELSIF NEW.map_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM maps WHERE id = NEW.map_id AND project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'vehicle map must belong to the same project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vehicle_map_project ON vehicles;
CREATE TRIGGER trg_vehicle_map_project
BEFORE INSERT OR UPDATE OF project_id, map_id ON vehicles
FOR EACH ROW EXECUTE FUNCTION enforce_vehicle_map_project();

INSERT INTO schema_migrations (version)
VALUES ('001_vehicle_map_assignment')
ON CONFLICT (version) DO NOTHING;

COMMIT;
