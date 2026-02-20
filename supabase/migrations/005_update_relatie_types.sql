-- Update relatie types van klant/leverancier/beide/lead naar particulier/zakelijk
-- Bestaande data omzetten
UPDATE relaties SET type = 'particulier' WHERE type IN ('klant', 'lead');
UPDATE relaties SET type = 'zakelijk' WHERE type IN ('leverancier', 'beide');

-- Constraint updaten
ALTER TABLE relaties DROP CONSTRAINT IF EXISTS relaties_type_check;
ALTER TABLE relaties ADD CONSTRAINT relaties_type_check
  CHECK (type IN ('particulier', 'zakelijk'));
