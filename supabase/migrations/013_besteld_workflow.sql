-- Extend orders status to include 'moet_besteld' and 'besteld'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('nieuw', 'in_behandeling', 'geleverd', 'gefactureerd', 'geannuleerd', 'moet_besteld', 'besteld'));
