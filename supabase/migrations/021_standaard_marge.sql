-- Standaard marge percentage per klant
ALTER TABLE relaties ADD COLUMN IF NOT EXISTS standaard_marge NUMERIC DEFAULT NULL;
