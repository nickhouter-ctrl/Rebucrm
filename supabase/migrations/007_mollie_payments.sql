-- Add Mollie payment fields to facturen table
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS mollie_payment_id text;
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS betaal_link text;

CREATE INDEX IF NOT EXISTS idx_facturen_mollie_payment_id ON facturen(mollie_payment_id);
