-- Taaknummers toevoegen aan taken (format: YYYY-NNNNN, net als Tribe CRM)
ALTER TABLE taken ADD COLUMN IF NOT EXISTS taaknummer TEXT;

-- Backfill bestaande taken met nummers op basis van created_at
WITH numbered AS (
  SELECT id,
    EXTRACT(YEAR FROM created_at)::INTEGER AS jaar,
    ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM created_at) ORDER BY created_at) AS rn
  FROM taken
  WHERE taaknummer IS NULL
)
UPDATE taken
SET taaknummer = numbered.jaar || '-' || LPAD(numbered.rn::TEXT, 5, '0')
FROM numbered
WHERE taken.id = numbered.id;

-- Index voor snelle lookups en uniek per administratie
CREATE INDEX IF NOT EXISTS idx_taken_taaknummer ON taken(taaknummer);
