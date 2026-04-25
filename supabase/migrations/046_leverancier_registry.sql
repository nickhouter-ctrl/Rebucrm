-- Bekende leveranciers registry — groeit mee met de business.
-- AI gebruikt deze tabel als ground-truth voor leverancier-detectie.
-- Gebruikers kunnen nieuwe leveranciers toevoegen via de wizard.
CREATE TABLE IF NOT EXISTS bekende_leveranciers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam text NOT NULL UNIQUE,              -- slug: 'eko-okna', 'schuco'
  display_naam text NOT NULL,             -- 'Eko-Okna', 'Schüco'
  aliases text[] DEFAULT '{}',            -- alternatieve schrijfwijzen voor matching
  profielen text[] DEFAULT '{}',          -- bekende profielen die deze leverancier levert
  parser_key text NOT NULL DEFAULT 'default', -- welke branch in pdf-parser.ts gebruikt moet worden
  detect_count integer DEFAULT 0,         -- hoe vaak door AI gedetecteerd
  validated_count integer DEFAULT 0,      -- hoe vaak door gebruiker bevestigd
  added_by_user boolean DEFAULT false,    -- true = handmatig toegevoegd door medewerker
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bekende_leveranciers_naam ON bekende_leveranciers(naam);

-- Seed: leveranciers die de parser nu al herkent
INSERT INTO bekende_leveranciers (naam, display_naam, aliases, profielen, parser_key, validated_count) VALUES
  ('eko-okna', 'Eko-Okna', ARRAY['eko okna','ekookna','eko_okna'], ARRAY['Aluprof','Aluplast'], 'eko-okna', 1),
  ('schuco',   'Schüco',   ARRAY['schueco','sch¿co','sch_co'],     ARRAY['Schüco Slide','Schüco Verdiept'], 'schuco', 1),
  ('gealan',   'Gealan',   ARRAY['gealan-nl'],                      ARRAY['S9000','S9000NL'], 'gealan', 1),
  ('kochs',    'Kochs',    ARRAY['k-vision','primus md','premidoor','kvision'], ARRAY['K-Vision','Primus MD','Premidoor'], 'kochs', 1),
  ('reynaers', 'Reynaers', ARRAY['reynaers aluminium'],             ARRAY[]::text[], 'default', 0),
  ('aluplast', 'Aluplast', ARRAY[]::text[],                         ARRAY['Ideal'], 'aluplast', 0)
ON CONFLICT (naam) DO NOTHING;

-- Detectie-log: per offerte loggen we wat AI/regex/user vonden, voor analyse en leereffect
CREATE TABLE IF NOT EXISTS leverancier_detectie_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offerte_id uuid REFERENCES offertes(id) ON DELETE CASCADE,
  detected_leverancier text,
  detected_profiel text,
  ai_confidence numeric(3,2),
  ai_model text,
  regex_match text,
  user_confirmed boolean,
  user_corrected_to text,
  pdf_text_sample text,                   -- eerste 500 chars voor debug/learning
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leverancier_detectie_log_offerte ON leverancier_detectie_log(offerte_id);
CREATE INDEX IF NOT EXISTS idx_leverancier_detectie_log_lev ON leverancier_detectie_log(detected_leverancier, created_at DESC);
