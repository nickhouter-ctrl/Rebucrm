-- ============================================
-- Rebu - Redesign Migratie
-- ============================================

-- Offerte versioning
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS versie_nummer integer DEFAULT 1;
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS groep_id uuid DEFAULT gen_random_uuid();

-- Relaties uitbreiden met lead type
ALTER TABLE relaties DROP CONSTRAINT IF EXISTS relaties_type_check;
ALTER TABLE relaties ADD CONSTRAINT relaties_type_check
  CHECK (type IN ('klant', 'leverancier', 'beide', 'lead'));

-- Google Place ID voor leads
ALTER TABLE relaties ADD COLUMN IF NOT EXISTS google_place_id text;

-- Profielen: collega's zien binnen administratie (zodat gebruikersbeheer werkt)
CREATE POLICY "profielen_select_administratie" ON profielen
  FOR SELECT USING (
    administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
  );
