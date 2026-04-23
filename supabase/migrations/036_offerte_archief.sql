-- Archief voor al-behandelde geaccepteerde offertes.
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS gearchiveerd BOOLEAN DEFAULT FALSE;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS gearchiveerd_op TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_offertes_gearchiveerd ON offertes(administratie_id, gearchiveerd);
