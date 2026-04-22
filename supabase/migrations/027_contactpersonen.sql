-- Meerdere contactpersonen per relatie
CREATE TABLE IF NOT EXISTS contactpersonen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  administratie_id UUID NOT NULL REFERENCES administraties(id) ON DELETE CASCADE,
  relatie_id UUID NOT NULL REFERENCES relaties(id) ON DELETE CASCADE,
  naam TEXT NOT NULL,
  functie TEXT,
  email TEXT,
  telefoon TEXT,
  mobiel TEXT,
  is_primair BOOLEAN DEFAULT false,
  opmerkingen TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contactpersonen_relatie ON contactpersonen(relatie_id);
CREATE INDEX IF NOT EXISTS idx_contactpersonen_administratie ON contactpersonen(administratie_id);

ALTER TABLE contactpersonen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contactpersonen_administratie" ON contactpersonen
  FOR ALL USING (
    administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
  );

CREATE TRIGGER set_updated_at BEFORE UPDATE ON contactpersonen FOR EACH ROW EXECUTE FUNCTION update_updated_at();
