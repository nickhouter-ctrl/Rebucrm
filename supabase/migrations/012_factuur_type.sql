-- Factuur type en koppeling voor aanbetaling/restbetaling tracking
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS offerte_id UUID REFERENCES offertes(id) ON DELETE SET NULL;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS factuur_type TEXT DEFAULT 'volledig' CHECK (factuur_type IN ('volledig', 'aanbetaling', 'restbetaling'));
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS gerelateerde_factuur_id UUID REFERENCES facturen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facturen_offerte ON facturen(offerte_id);
CREATE INDEX IF NOT EXISTS idx_facturen_order ON facturen(order_id);
CREATE INDEX IF NOT EXISTS idx_facturen_gerelateerde ON facturen(gerelateerde_factuur_id);
