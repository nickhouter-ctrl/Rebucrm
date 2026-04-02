-- Taak-notities: notities gekoppeld aan taken (vergelijkbaar met relatie-notities)
CREATE TABLE IF NOT EXISTS taak_notities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  administratie_id uuid NOT NULL REFERENCES administraties(id) ON DELETE CASCADE,
  taak_id uuid NOT NULL REFERENCES taken(id) ON DELETE CASCADE,
  gebruiker_id uuid NOT NULL REFERENCES profielen(id),
  tekst text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS taak_notities
ALTER TABLE taak_notities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taak_notities_select" ON taak_notities FOR SELECT USING (
  administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
);
CREATE POLICY "taak_notities_insert" ON taak_notities FOR INSERT WITH CHECK (
  administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
);
CREATE POLICY "taak_notities_delete" ON taak_notities FOR DELETE USING (
  administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
);
