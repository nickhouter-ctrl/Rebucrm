-- ============================================
-- Medewerkers & ZZP'ers beheer
-- ============================================

-- === MEDEWERKERS ===
CREATE TABLE medewerkers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  administratie_id UUID NOT NULL REFERENCES administraties(id) ON DELETE CASCADE,
  profiel_id UUID REFERENCES profielen(id) ON DELETE SET NULL,
  naam TEXT NOT NULL,
  email TEXT,
  telefoon TEXT,
  type TEXT NOT NULL CHECK (type IN ('werknemer', 'zzp')),
  functie TEXT,
  uurtarief NUMERIC(12,2),
  kvk_nummer TEXT,
  btw_nummer TEXT,
  specialisaties TEXT[],
  kleur TEXT DEFAULT '#3b82f6',
  actief BOOLEAN DEFAULT true,
  startdatum DATE,
  opmerkingen TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_medewerkers_administratie ON medewerkers(administratie_id);
CREATE INDEX idx_medewerkers_profiel ON medewerkers(profiel_id);

ALTER TABLE medewerkers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medewerkers_administratie" ON medewerkers
  FOR ALL USING (
    administratie_id IN (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );

-- === ORDER_MEDEWERKERS (koppeltabel) ===
CREATE TABLE order_medewerkers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  medewerker_id UUID NOT NULL REFERENCES medewerkers(id) ON DELETE CASCADE,
  rol TEXT,
  gepland_van DATE,
  gepland_tot DATE,
  geschatte_uren NUMERIC(5,2),
  notitie TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(order_id, medewerker_id)
);

CREATE INDEX idx_order_medewerkers_order ON order_medewerkers(order_id);
CREATE INDEX idx_order_medewerkers_medewerker ON order_medewerkers(medewerker_id);
CREATE INDEX idx_order_medewerkers_gepland ON order_medewerkers(gepland_van, gepland_tot);

ALTER TABLE order_medewerkers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_medewerkers_administratie" ON order_medewerkers
  FOR ALL USING (
    order_id IN (
      SELECT id FROM orders WHERE administratie_id IN (
        SELECT administratie_id FROM profielen WHERE id = auth.uid()
      )
    )
  );

-- === FK toevoegen aan taken ===
ALTER TABLE taken ADD COLUMN IF NOT EXISTS medewerker_id UUID REFERENCES medewerkers(id) ON DELETE SET NULL;

-- === FK toevoegen aan uren ===
ALTER TABLE uren ADD COLUMN IF NOT EXISTS medewerker_id UUID REFERENCES medewerkers(id) ON DELETE SET NULL;

-- === Profielen rol constraint updaten ===
ALTER TABLE profielen DROP CONSTRAINT IF EXISTS profielen_rol_check;
ALTER TABLE profielen ADD CONSTRAINT profielen_rol_check
  CHECK (rol IN ('admin', 'gebruiker', 'readonly', 'klant', 'medewerker'));
