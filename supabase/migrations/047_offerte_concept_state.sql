-- Concept-state voor leveranciersofferte preview/correctie-loop.
-- Bewaart de tussentijdse status (marges per element, zichtbaarheid, regels,
-- correctie-rondes) tussen sessies tot de gebruiker op "Goedkeuren" klikt.
-- Wordt automatisch opgeruimd na 30 dagen (cleanup in app of cron).
CREATE TABLE IF NOT EXISTS offerte_concept_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offerte_id uuid REFERENCES offertes(id) ON DELETE CASCADE,
  administratie_id uuid REFERENCES administraties(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  approved boolean DEFAULT false,
  ronde integer DEFAULT 0,            -- aantal AI-correctierondes uitgevoerd
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offerte_concept_state_offerte ON offerte_concept_state(offerte_id);
CREATE INDEX IF NOT EXISTS idx_offerte_concept_state_admin ON offerte_concept_state(administratie_id);
