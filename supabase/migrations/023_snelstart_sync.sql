-- SnelStart koppeling: tracking kolommen
ALTER TABLE relaties ADD COLUMN IF NOT EXISTS snelstart_relatie_id TEXT;
ALTER TABLE relaties ADD COLUMN IF NOT EXISTS snelstart_synced_at TIMESTAMPTZ;

ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snelstart_boeking_id TEXT;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snelstart_synced_at TIMESTAMPTZ;

-- Indexeren voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_relaties_snelstart ON relaties(snelstart_relatie_id) WHERE snelstart_relatie_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_facturen_snelstart ON facturen(snelstart_boeking_id) WHERE snelstart_boeking_id IS NOT NULL;

-- Markeer alle bestaande facturen als 'reeds bestaand' zodat ze NIET worden gesynchroniseerd
-- (alleen nieuwe facturen na deze migratie gaan naar SnelStart)
UPDATE facturen SET snelstart_synced_at = '1900-01-01'::timestamptz
WHERE snelstart_boeking_id IS NULL AND snelstart_synced_at IS NULL;
