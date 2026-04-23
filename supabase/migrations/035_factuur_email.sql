-- Apart e-mailadres voor facturen — sommige klanten (vnl. aannemers/VOF's) laten
-- facturen naar boekhouding@... sturen ipv naar hun algemene adres.
ALTER TABLE relaties ADD COLUMN IF NOT EXISTS factuur_email TEXT;
