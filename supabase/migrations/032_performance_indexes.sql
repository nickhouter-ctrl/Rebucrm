-- Performance indexen voor zwaar gefilterde queries (dashboard, lijsten, sync)
-- Alle composite indexen hebben administratie_id als eerste kolom omdat ALL
-- queries per administratie filteren (multi-tenant).

-- Facturen: dashboard (openstaand, status filter, datum sort), Snelstart sync
CREATE INDEX IF NOT EXISTS idx_facturen_admin_status ON facturen(administratie_id, status);
CREATE INDEX IF NOT EXISTS idx_facturen_admin_datum ON facturen(administratie_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_facturen_admin_vervaldatum ON facturen(administratie_id, vervaldatum) WHERE status IN ('verzonden','deels_betaald','vervallen');
CREATE INDEX IF NOT EXISTS idx_facturen_factuurnummer ON facturen(factuurnummer);

-- Offertes: dashboard, lijsten per project/klant
CREATE INDEX IF NOT EXISTS idx_offertes_admin_status ON offertes(administratie_id, status);
CREATE INDEX IF NOT EXISTS idx_offertes_admin_datum ON offertes(administratie_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_offertes_relatie_versie ON offertes(relatie_id, versie_nummer DESC);
CREATE INDEX IF NOT EXISTS idx_offertes_project_versie ON offertes(project_id, versie_nummer DESC) WHERE project_id IS NOT NULL;

-- Taken: dashboard (mijn-taken), status, deadline filters
CREATE INDEX IF NOT EXISTS idx_taken_admin_status ON taken(administratie_id, status);
CREATE INDEX IF NOT EXISTS idx_taken_toegewezen_status ON taken(toegewezen_aan, status) WHERE status != 'afgerond';
CREATE INDEX IF NOT EXISTS idx_taken_relatie ON taken(relatie_id) WHERE relatie_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_taken_offerte ON taken(offerte_id) WHERE offerte_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_taken_project ON taken(project_id) WHERE project_id IS NOT NULL;

-- Relaties: lijsten, filteren op type
CREATE INDEX IF NOT EXISTS idx_relaties_admin_type ON relaties(administratie_id, type);
CREATE INDEX IF NOT EXISTS idx_relaties_admin_created ON relaties(administratie_id, created_at DESC);

-- Notities: recent op dashboard + per-relatie lijst
CREATE INDEX IF NOT EXISTS idx_notities_admin_created ON notities(administratie_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notities_relatie_created ON notities(relatie_id, created_at DESC);

-- Orders: dashboard leveringen, klusjes
CREATE INDEX IF NOT EXISTS idx_orders_admin_status ON orders(administratie_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_admin_leverdatum ON orders(administratie_id, leverdatum) WHERE leverdatum IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_relatie ON orders(relatie_id);

-- Projecten (verkoopkansen)
CREATE INDEX IF NOT EXISTS idx_projecten_admin_status ON projecten(administratie_id, status);
CREATE INDEX IF NOT EXISTS idx_projecten_relatie ON projecten(relatie_id) WHERE relatie_id IS NOT NULL;

-- Berichten: ongelezen teller
CREATE INDEX IF NOT EXISTS idx_berichten_admin_ongelezen ON berichten(administratie_id, afzender_type, gelezen) WHERE gelezen = false;

-- Email_log: tijdlijn-queries
CREATE INDEX IF NOT EXISTS idx_email_log_offerte ON email_log(offerte_id) WHERE offerte_id IS NOT NULL;

-- Factuur/offerte regels: detail-view
CREATE INDEX IF NOT EXISTS idx_factuur_regels_factuur ON factuur_regels(factuur_id);
CREATE INDEX IF NOT EXISTS idx_offerte_regels_offerte ON offerte_regels(offerte_id);

-- Documenten: per-entiteit ophalen
CREATE INDEX IF NOT EXISTS idx_documenten_entiteit ON documenten(entiteit_type, entiteit_id);

-- Afspraken: per-relatie + per-project
CREATE INDEX IF NOT EXISTS idx_afspraken_relatie ON afspraken(relatie_id) WHERE relatie_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_afspraken_project ON afspraken(project_id) WHERE project_id IS NOT NULL;

-- Statistieken bijwerken voor planner
ANALYZE facturen;
ANALYZE offertes;
ANALYZE taken;
ANALYZE relaties;
ANALYZE notities;
ANALYZE orders;
ANALYZE projecten;
