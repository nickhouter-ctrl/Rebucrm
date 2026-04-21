-- Taak categorie (Bellen / Uitwerken / etc) net als in Tribe
ALTER TABLE taken ADD COLUMN IF NOT EXISTS categorie TEXT;
CREATE INDEX IF NOT EXISTS idx_taken_categorie ON taken(categorie);
