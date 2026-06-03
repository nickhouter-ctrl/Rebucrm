-- Aparte factuurgegevens per verkoopkans (project).
-- Als factuur_afwijkend = true worden deze velden gebruikt op de factuur-PDF
-- en in de factuurmail i.p.v. de gekoppelde relatie. Lege velden vallen per
-- veld terug op de relatie. Bestaande verkoopkansen: factuur_afwijkend = false
-- → ongewijzigd gedrag (relatiegegevens).
ALTER TABLE projecten ADD COLUMN IF NOT EXISTS factuur_afwijkend boolean DEFAULT false;
ALTER TABLE projecten ADD COLUMN IF NOT EXISTS factuur_bedrijfsnaam text;
ALTER TABLE projecten ADD COLUMN IF NOT EXISTS factuur_contactpersoon text;
ALTER TABLE projecten ADD COLUMN IF NOT EXISTS factuur_adres text;
ALTER TABLE projecten ADD COLUMN IF NOT EXISTS factuur_postcode text;
ALTER TABLE projecten ADD COLUMN IF NOT EXISTS factuur_plaats text;
ALTER TABLE projecten ADD COLUMN IF NOT EXISTS factuur_email text;
ALTER TABLE projecten ADD COLUMN IF NOT EXISTS factuur_btw_nummer text;
ALTER TABLE projecten ADD COLUMN IF NOT EXISTS factuur_kvk_nummer text;
