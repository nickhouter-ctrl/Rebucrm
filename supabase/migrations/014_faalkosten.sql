-- Faalkosten tracking table
CREATE TABLE IF NOT EXISTS faalkosten (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  administratie_id UUID NOT NULL REFERENCES administraties(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projecten(id),
  offerte_id UUID REFERENCES offertes(id),
  order_id UUID REFERENCES orders(id),
  omschrijving TEXT NOT NULL,
  categorie TEXT CHECK (categorie IN ('verkeerde_maat', 'verkeerd_kozijn', 'verkeerde_kleur', 'transport_schade', 'montage_fout', 'overig')),
  bedrag DECIMAL(10,2) NOT NULL DEFAULT 0,
  datum DATE DEFAULT CURRENT_DATE,
  verantwoordelijke TEXT,
  opgelost BOOLEAN DEFAULT false,
  notities TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE faalkosten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faalkosten_select" ON faalkosten FOR SELECT USING (
  administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
);
CREATE POLICY "faalkosten_insert" ON faalkosten FOR INSERT WITH CHECK (
  administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
);
CREATE POLICY "faalkosten_update" ON faalkosten FOR UPDATE USING (
  administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
);
CREATE POLICY "faalkosten_delete" ON faalkosten FOR DELETE USING (
  administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON faalkosten FOR EACH ROW EXECUTE FUNCTION update_updated_at();
