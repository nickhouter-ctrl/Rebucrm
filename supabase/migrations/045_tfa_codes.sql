-- Two-factor authentication via email (6-cijferige codes)
-- Codes worden bewaard als SHA-256 hash; 5 min TTL; max 5 pogingen
CREATE TABLE IF NOT EXISTS tfa_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  pogingen int DEFAULT 0,
  used boolean DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tfa_codes_user ON tfa_codes(user_id, created_at DESC);

-- Login-audit: registreert pogingen voor rate-limiting en debug
CREATE TABLE IF NOT EXISTS login_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  ip text,
  user_agent text,
  succes boolean NOT NULL,
  reden text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_audit_ip_recent ON login_audit(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_audit_email_recent ON login_audit(email, created_at DESC);
