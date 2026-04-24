-- Flag om dubbele betalingsbevestiging-mails te voorkomen bij factuur-update
ALTER TABLE facturen ADD COLUMN IF NOT EXISTS betalingsbevestiging_verzonden_op timestamptz;
