-- Audit-log voor kritieke acties: offerte verwijderen, factuur aanpassen,
-- email versturen, status-changes etc. Geen migratie van bestaande data —
-- groeit vanaf vandaag. Auto-prune oudere records via cron (90 dagen).
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  administratie_id uuid REFERENCES administraties(id) ON DELETE CASCADE,
  user_id uuid,                       -- profielen.id (nullable bij cron)
  user_email text,                    -- snapshot van user-email (voor leesbaarheid log)
  actie text NOT NULL,                -- 'offerte.delete', 'factuur.update', 'email.send', etc.
  entiteit_type text,                 -- 'offerte', 'factuur', 'relatie', etc.
  entiteit_id uuid,                   -- id van het record
  details jsonb,                      -- before/after of extra context
  ip_adres text,                      -- vanuit request headers
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_admin_created ON audit_log(administratie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entiteit ON audit_log(entiteit_type, entiteit_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);
