-- Klantenportaal: klant_relaties, berichten, email_log

-- Koppeltabel: klant-user <-> relatie
CREATE TABLE IF NOT EXISTS klant_relaties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profiel_id UUID NOT NULL REFERENCES profielen(id) ON DELETE CASCADE,
  relatie_id UUID NOT NULL REFERENCES relaties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profiel_id, relatie_id)
);

ALTER TABLE klant_relaties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "klant_relaties_select_own" ON klant_relaties
  FOR SELECT USING (profiel_id = auth.uid());

CREATE POLICY "klant_relaties_admin_all" ON klant_relaties
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profielen
      WHERE profielen.id = auth.uid()
      AND profielen.rol IN ('admin', 'gebruiker')
      AND profielen.administratie_id = (
        SELECT p2.administratie_id FROM profielen p2 WHERE p2.id = klant_relaties.profiel_id
      )
    )
  );

-- Chat berichten per offerte
CREATE TABLE IF NOT EXISTS berichten (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  administratie_id UUID NOT NULL REFERENCES administraties(id),
  offerte_id UUID NOT NULL REFERENCES offertes(id) ON DELETE CASCADE,
  afzender_id UUID NOT NULL REFERENCES profielen(id),
  afzender_type TEXT NOT NULL CHECK (afzender_type IN ('klant', 'medewerker')),
  afzender_naam TEXT,
  tekst TEXT NOT NULL,
  gelezen BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_berichten_offerte ON berichten(offerte_id, created_at);

ALTER TABLE berichten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "berichten_klant_select" ON berichten
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM klant_relaties kr
      JOIN offertes o ON o.relatie_id = kr.relatie_id
      WHERE kr.profiel_id = auth.uid()
      AND o.id = berichten.offerte_id
    )
  );

CREATE POLICY "berichten_klant_insert" ON berichten
  FOR INSERT WITH CHECK (
    afzender_id = auth.uid()
    AND afzender_type = 'klant'
    AND EXISTS (
      SELECT 1 FROM klant_relaties kr
      JOIN offertes o ON o.relatie_id = kr.relatie_id
      WHERE kr.profiel_id = auth.uid()
      AND o.id = berichten.offerte_id
    )
  );

CREATE POLICY "berichten_admin_all" ON berichten
  FOR ALL USING (
    administratie_id = (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
    AND (SELECT rol FROM profielen WHERE id = auth.uid()) IN ('admin', 'gebruiker')
  );

-- Email log: verstuurde e-mails opslaan
CREATE TABLE IF NOT EXISTS email_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  administratie_id UUID NOT NULL REFERENCES administraties(id),
  offerte_id UUID REFERENCES offertes(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  relatie_id UUID NOT NULL REFERENCES relaties(id),
  aan TEXT NOT NULL,
  onderwerp TEXT NOT NULL,
  body_html TEXT,
  bijlagen JSONB DEFAULT '[]',
  verstuurd_door UUID REFERENCES profielen(id),
  verstuurd_op TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_log_relatie ON email_log(relatie_id, verstuurd_op DESC);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_log_klant_select" ON email_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM klant_relaties kr
      WHERE kr.profiel_id = auth.uid()
      AND kr.relatie_id = email_log.relatie_id
    )
  );

CREATE POLICY "email_log_admin_all" ON email_log
  FOR ALL USING (
    administratie_id = (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );

-- RLS voor klanten op bestaande tabellen
-- Klant kan offertes zien (niet concept) van hun relatie(s)
CREATE POLICY "offertes_klant_select" ON offertes
  FOR SELECT USING (
    status != 'concept'
    AND EXISTS (
      SELECT 1 FROM klant_relaties kr
      WHERE kr.profiel_id = auth.uid()
      AND kr.relatie_id = offertes.relatie_id
    )
  );

-- Klant kan offerte regels zien
CREATE POLICY "offerte_regels_klant_select" ON offerte_regels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM offertes o
      JOIN klant_relaties kr ON kr.relatie_id = o.relatie_id
      WHERE o.id = offerte_regels.offerte_id
      AND kr.profiel_id = auth.uid()
      AND o.status != 'concept'
    )
  );

-- Klant kan orders zien van hun relatie(s)
CREATE POLICY "orders_klant_select" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM klant_relaties kr
      WHERE kr.profiel_id = auth.uid()
      AND kr.relatie_id = orders.relatie_id
    )
  );

-- Klant kan hun eigen relatie gegevens zien
CREATE POLICY "relaties_klant_select" ON relaties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM klant_relaties kr
      WHERE kr.profiel_id = auth.uid()
      AND kr.relatie_id = relaties.id
    )
  );
