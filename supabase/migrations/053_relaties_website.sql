-- Voeg website-kolom toe aan relaties zodat zakelijke contacten een
-- website kunnen koppelen. Wordt gebruikt door de AI-verrijk-knop op de
-- relatie-form (scant de website + vult lege velden in).

ALTER TABLE relaties ADD COLUMN IF NOT EXISTS website text;
