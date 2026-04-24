-- Uitbreiding op 032: ontbrekende indexen voor de zwaarste query-paths
-- (klant-detail, verkoopkans-timeline, archief, email log per klant).

-- Facturen: veel filters op FK's zonder auto-index
CREATE INDEX IF NOT EXISTS idx_facturen_relatie_datum ON facturen(relatie_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_facturen_offerte ON facturen(offerte_id) WHERE offerte_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_facturen_order ON facturen(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_facturen_gerelateerde ON facturen(gerelateerde_factuur_id) WHERE gerelateerde_factuur_id IS NOT NULL;

-- Offertes: per klant chronologisch, per project
CREATE INDEX IF NOT EXISTS idx_offertes_relatie_datum ON offertes(relatie_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_offertes_project_datum ON offertes(project_id, datum DESC) WHERE project_id IS NOT NULL;

-- Email log: klant-detail en factuur-detail
CREATE INDEX IF NOT EXISTS idx_email_log_admin_verstuurd ON email_log(administratie_id, verstuurd_op DESC);

-- Projecten op admin+created voor archief/lijst
CREATE INDEX IF NOT EXISTS idx_projecten_admin_created ON projecten(administratie_id, created_at DESC);

-- Taken op project/offerte voor verkoopkans-timeline
CREATE INDEX IF NOT EXISTS idx_taken_project_created ON taken(project_id, created_at DESC) WHERE project_id IS NOT NULL;

-- Notities per project (nieuw in migratie 038)
CREATE INDEX IF NOT EXISTS idx_notities_project ON notities(project_id, created_at DESC) WHERE project_id IS NOT NULL;

-- Berichten per offerte (chat op klant-portaal)
CREATE INDEX IF NOT EXISTS idx_berichten_offerte ON berichten(offerte_id) WHERE offerte_id IS NOT NULL;

-- Documenten per entiteit (al in 032 maar hier nog expliciet op type)
CREATE INDEX IF NOT EXISTS idx_documenten_entiteit_type ON documenten(entiteit_type);

-- Klant_relaties / profielen koppeling
CREATE INDEX IF NOT EXISTS idx_klant_relaties_relatie ON klant_relaties(relatie_id);
CREATE INDEX IF NOT EXISTS idx_klant_relaties_profiel ON klant_relaties(profiel_id);

-- Contactpersonen per relatie
CREATE INDEX IF NOT EXISTS idx_contactpersonen_relatie ON contactpersonen(relatie_id);

ANALYZE facturen;
ANALYZE offertes;
ANALYZE taken;
ANALYZE projecten;
ANALYZE notities;
ANALYZE email_log;
