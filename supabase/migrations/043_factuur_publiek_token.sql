-- Publiek token voor facturen zodat we een permanente redirect-URL kunnen
-- sturen in e-mails. De onderliggende Mollie-payment-link kan verlopen zonder
-- dat de mail-link daardoor kapot gaat — de server leest altijd de actuele
-- betaal_link uit de DB.
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS publiek_token uuid DEFAULT gen_random_uuid();
UPDATE facturen SET publiek_token = gen_random_uuid() WHERE publiek_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS facturen_publiek_token_idx ON facturen(publiek_token);
