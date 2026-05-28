-- PostgreSQL 数据库初始化脚本
-- ROC-SYSTEM 完整数据库 Schema
-- 优先级: P0 用户认证 > P1 业务数据 > P2 机器人日志

-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- 地图坐标系与路网数据 (Phase 4 P1)
ALTER TABLE maps ADD COLUMN IF NOT EXISTS coordinate_origin_x DOUBLE PRECISION DEFAULT 0;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS coordinate_origin_y DOUBLE PRECISION DEFAULT 0;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS road_network JSONB;

-- 车辆/机器人表
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_project ON vehicles(project_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);

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
-- CREATE INDEX IF NOT EXISTS idx_logs_robot ON robot_logs(robot_id);
-- CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON robot_logs(timestamp);

-- ============================================================
-- 初始数据: 默认超级管理员 (密码: [REDACTED_DEFAULT_PASSWORD], 首次登录后需修改)
-- ============================================================
-- SHA-256 hash of '[REDACTED_DEFAULT_PASSWORD]' + salt '[REDACTED_DEFAULT_SALT]' = '[REDACTED_DEFAULT_PASSWORD][REDACTED_DEFAULT_SALT]'
INSERT INTO users (username, email, password_hash, salt, role, status)
VALUES (
  'admin',
  'operator@example.invalid',
  '[REDACTED_PASSWORD_HASH]',
  '[REDACTED_DEFAULT_SALT]',
  'super_admin',
  'active'
) ON CONFLICT (username) DO NOTHING;
