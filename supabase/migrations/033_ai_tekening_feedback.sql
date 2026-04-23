-- AI leert van leveranciers-specifieke tekening layouts.
-- We slaan per leverancier de gedetecteerde bounding box(es) + eventuele correcties op
-- zodat de volgende pagina van dezelfde leverancier direct de juiste crop krijgt.
CREATE TABLE IF NOT EXISTS ai_tekening_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier text NOT NULL,
  page_width integer NOT NULL,
  page_height integer NOT NULL,
  box_x_pct numeric(6,4) NOT NULL,
  box_y_pct numeric(6,4) NOT NULL,
  box_w_pct numeric(6,4) NOT NULL,
  box_h_pct numeric(6,4) NOT NULL,
  confidence numeric(3,2) DEFAULT 0.8,
  validated boolean DEFAULT false,
  usage_count integer DEFAULT 1,
  last_used timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_tekening_supplier ON ai_tekening_template(supplier);

-- Feedback: user kan markeren dat een crop niet goed was
CREATE TABLE IF NOT EXISTS ai_tekening_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier text NOT NULL,
  offerte_id uuid,
  element_naam text,
  issue text NOT NULL, -- 'prijs_zichtbaar', 'tekening_afgeknipt', 'anders'
  detail text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_tekening_feedback_supplier ON ai_tekening_feedback(supplier, created_at DESC);
