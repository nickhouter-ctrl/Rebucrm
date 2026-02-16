-- ============================================
-- Rebu - Project-Offerte link
-- ============================================

-- Link offertes aan projecten
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projecten(id);
CREATE INDEX IF NOT EXISTS offertes_project_id_idx ON offertes(project_id);
