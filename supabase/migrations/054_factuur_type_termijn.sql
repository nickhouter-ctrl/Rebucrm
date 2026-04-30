-- factuur_type uitbreiden met 'termijn' zodat 3-deling-facturen
-- (aanbetaling + termijn + restbetaling) valide zijn voor klanten
-- die in 3 termijnen willen betalen.
ALTER TABLE facturen DROP CONSTRAINT IF EXISTS facturen_factuur_type_check;
ALTER TABLE facturen ADD CONSTRAINT facturen_factuur_type_check
  CHECK (factuur_type IN ('volledig', 'aanbetaling', 'termijn', 'restbetaling', 'credit'));
