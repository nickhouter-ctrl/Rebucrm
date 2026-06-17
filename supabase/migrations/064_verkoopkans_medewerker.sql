-- Verkoopkans koppelen aan een verantwoordelijke medewerker.
-- Nullable + ON DELETE SET NULL zodat het verwijderen van een medewerker een
-- verkoopkans niet meeneemt; de koppeling valt dan gewoon terug op "niemand".
ALTER TABLE projecten ADD COLUMN IF NOT EXISTS medewerker_id UUID REFERENCES medewerkers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projecten_medewerker ON projecten(medewerker_id);
