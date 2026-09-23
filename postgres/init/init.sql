-- PostgreSQL 数据库初始化脚本
-- ROC-SYSTEM 完整数据库 Schema
-- 优先级: P0 用户认证 > P1 业务数据 > P2 机器人日志

-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 设置时区
SET timezone = 'Asia/Shanghai';

-- ============================================================
-- P0: 用户认证与档案
-- ============================================================

-- 用户角色枚举
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'regular');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 用户状态枚举
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(128) NOT NULL UNIQUE,
  password_hash VARCHAR(256) NOT NULL,
  salt VARCHAR(64) NOT NULL,
  role user_role NOT NULL DEFAULT 'regular',
  status user_status NOT NULL DEFAULT 'active',
  avatar VARCHAR(256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 会话表
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(256) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 用户表索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);

-- 注册邀请码：由超级管理员生成，单次使用，可在使用前撤销
CREATE TABLE IF NOT EXISTS registration_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(5) NOT NULL UNIQUE
    CHECK (code ~ '^[A-Z0-9]{5}$' AND code ~ '[A-Z]' AND code ~ '[0-9]'),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_by UUID REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (used_by IS NULL OR used_at IS NOT NULL),
  CHECK (used_at IS NULL OR revoked_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_registration_invites_created
  ON registration_invites(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registration_invites_available
  ON registration_invites(created_at DESC)
  WHERE used_at IS NULL AND revoked_at IS NULL;

-- ============================================================
-- P1: 用户业务数据
-- ============================================================

-- 项目表
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  description TEXT DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- 地图表
CREATE TABLE IF NOT EXISTS maps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  image_url VARCHAR(256),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maps_project ON maps(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_maps_default_per_project
  ON maps(project_id) WHERE is_active = true;

-- 地图坐标系与路网数据 (Phase 4 P1)
ALTER TABLE maps ADD COLUMN IF NOT EXISTS coordinate_origin_x DOUBLE PRECISION DEFAULT 0;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS coordinate_origin_y DOUBLE PRECISION DEFAULT 0;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS road_network JSONB;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS coordinate_mode VARCHAR(32) NOT NULL DEFAULT 'legacy-normalized';
ALTER TABLE maps ADD COLUMN IF NOT EXISTS image_width INTEGER;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS image_height INTEGER;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS resolution DOUBLE PRECISION;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS origin_theta DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 车辆/机器人表
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  map_id UUID REFERENCES maps(id) ON DELETE RESTRICT,
  name VARCHAR(64) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error')),
  cpu DOUBLE PRECISION NOT NULL DEFAULT 0,
  memory DOUBLE PRECISION NOT NULL DEFAULT 0,
  battery DOUBLE PRECISION NOT NULL DEFAULT 100,
  localization_confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_x DOUBLE PRECISION DEFAULT 0,
  position_y DOUBLE PRECISION DEFAULT 0,
  position_theta DOUBLE PRECISION DEFAULT 0,
  velocity_linear DOUBLE PRECISION DEFAULT 0,
  velocity_angular DOUBLE PRECISION DEFAULT 0,
  delivery_path JSONB,
  last_heartbeat TIMESTAMPTZ,
  telemetry_version BIGINT NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ,
  device_token_hash VARCHAR(64),
  device_token_hint VARCHAR(12),
  device_enabled BOOLEAN NOT NULL DEFAULT false,
  device_protocol_version INTEGER,
  device_library_version VARCHAR(64),
  device_last_sequence BIGINT NOT NULL DEFAULT 0,
  device_connected_at TIMESTAMPTZ,
  device_disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_vehicles_device_last_sequence_nonnegative CHECK (device_last_sequence >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_project ON vehicles(project_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_map ON vehicles(map_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_device_token_hash
  ON vehicles(device_token_hash)
  WHERE device_token_hash IS NOT NULL;

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

-- Immutable delivery resources and durable deployment tasks
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

-- ============================================================
-- P2: 机器人日志（最低优先级 — 暂不创建表, 保留 DDL 供后续使用）
-- ============================================================
-- CREATE TABLE IF NOT EXISTS robot_logs (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   robot_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
--   level VARCHAR(10) NOT NULL CHECK (level IN ('info', 'warning', 'error')),
--   message TEXT NOT NULL DEFAULT '',
--   timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

-- ============================================================
-- 操作审计日志
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32),
  target_id VARCHAR(64),
  detail TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- No fixed administrator account is created. Register the intended operator
-- through the application, then promote that exact account during deployment:
-- UPDATE users SET role = 'super_admin' WHERE username = '<operator>';
