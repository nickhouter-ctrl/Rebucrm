-- ============================================
-- Rebu - Offerte Flow + Notities
-- ============================================

-- Publiek token voor offertes (klant kan offerte bekijken/accepteren)
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS publiek_token uuid DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS offertes_publiek_token_idx ON offertes(publiek_token);

-- Notities per relatie per medewerker met herinnering
CREATE TABLE IF NOT EXISTS notities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  administratie_id uuid NOT NULL REFERENCES administraties(id) ON DELETE CASCADE,
  relatie_id uuid NOT NULL REFERENCES relaties(id) ON DELETE CASCADE,
  gebruiker_id uuid NOT NULL REFERENCES profielen(id),
  tekst text NOT NULL,
  herinnering_datum timestamptz,
  herinnering_verstuurd boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS notities
ALTER TABLE notities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notities_select" ON notities FOR SELECT USING (
  administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
);
CREATE POLICY "notities_insert" ON notities FOR INSERT WITH CHECK (
  administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
);
CREATE POLICY "notities_update" ON notities FOR UPDATE USING (
  administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
);
CREATE POLICY "notities_delete" ON notities FOR DELETE USING (
  administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
);

-- updated_at trigger voor notities
CREATE TRIGGER set_updated_at BEFORE UPDATE ON notities FOR EACH ROW EXECUTE FUNCTION update_updated_at();
