BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

INSERT INTO schema_migrations (version)
VALUES ('009_registration_invites')
ON CONFLICT (version) DO NOTHING;

COMMIT;
