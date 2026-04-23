-- Notities kunnen nu ook direct aan een project (verkoopkans) gekoppeld worden.
-- relatie_id blijft verplicht zodat bestaande policies werken; project_id is optioneel.
ALTER TABLE notities ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projecten(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notities_project_created ON notities(project_id, created_at DESC);
