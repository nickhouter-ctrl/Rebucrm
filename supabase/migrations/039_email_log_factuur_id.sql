-- Email log ontbrak nog een factuur_id kolom, waardoor getFactuurEmailLog
-- niets teruggaf ondanks dat de query er op filterde.
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS factuur_id uuid REFERENCES facturen(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_email_log_factuur ON email_log(factuur_id, verstuurd_op DESC);
