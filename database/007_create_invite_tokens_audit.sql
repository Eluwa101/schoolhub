-- Migration: Invite tokens and audit logs

CREATE TABLE IF NOT EXISTS invite_tokens (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email      varchar(255) NOT NULL,
  role       user_role NOT NULL,
  token      varchar(128) UNIQUE NOT NULL,
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  used_at    timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_invite_tokens_token ON invite_tokens(token);
CREATE INDEX idx_invite_tokens_school_id ON invite_tokens(school_id);

ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School admins view invite tokens" ON invite_tokens
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   uuid REFERENCES schools(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action      varchar(100) NOT NULL,
  entity_type varchar(100),
  entity_id   uuid,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_logs_school_id ON audit_logs(school_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School admins view audit logs" ON audit_logs
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
