-- Bewaart handmatige prijs-correcties per leverancier zodat AI er van leert
-- voor toekomstige extracties. Element-naam + leverancier-slug als key.
CREATE TABLE IF NOT EXISTS leverancier_prijs_correctie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leverancier_slug text NOT NULL,
  element_naam text NOT NULL,
  ai_prijs numeric,                       -- wat AI extraheerde (vaak 0)
  handmatige_prijs numeric NOT NULL,      -- wat de gebruiker invulde
  pdf_text_sample text,                   -- omliggende tekst voor AI-context
  offerte_id uuid REFERENCES offertes(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lev_prijs_corr_lev ON leverancier_prijs_correctie(leverancier_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lev_prijs_corr_naam ON leverancier_prijs_correctie(leverancier_slug, element_naam);
