-- factuur_type uitbreiden met 'credit' zodat creditnota's valide zijn
ALTER TABLE facturen DROP CONSTRAINT IF EXISTS facturen_factuur_type_check;
ALTER TABLE facturen ADD CONSTRAINT facturen_factuur_type_check
  CHECK (factuur_type IN ('volledig', 'aanbetaling', 'restbetaling', 'credit'));
