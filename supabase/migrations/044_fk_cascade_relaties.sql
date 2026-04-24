-- FK's die klant-delete nog blokkeerden: projecten, offertes, facturen, orders,
-- contactpersonen, notities, afspraken. Zet ze op ON DELETE CASCADE zodat
-- een klant-verwijdering al haar afhankelijke records meeneemt.

ALTER TABLE projecten DROP CONSTRAINT IF EXISTS projecten_relatie_id_fkey;
ALTER TABLE projecten ADD CONSTRAINT projecten_relatie_id_fkey
  FOREIGN KEY (relatie_id) REFERENCES relaties(id) ON DELETE CASCADE;

ALTER TABLE offertes DROP CONSTRAINT IF EXISTS offertes_relatie_id_fkey;
ALTER TABLE offertes ADD CONSTRAINT offertes_relatie_id_fkey
  FOREIGN KEY (relatie_id) REFERENCES relaties(id) ON DELETE CASCADE;

ALTER TABLE facturen DROP CONSTRAINT IF EXISTS facturen_relatie_id_fkey;
ALTER TABLE facturen ADD CONSTRAINT facturen_relatie_id_fkey
  FOREIGN KEY (relatie_id) REFERENCES relaties(id) ON DELETE CASCADE;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_relatie_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_relatie_id_fkey
  FOREIGN KEY (relatie_id) REFERENCES relaties(id) ON DELETE CASCADE;

ALTER TABLE contactpersonen DROP CONSTRAINT IF EXISTS contactpersonen_relatie_id_fkey;
ALTER TABLE contactpersonen ADD CONSTRAINT contactpersonen_relatie_id_fkey
  FOREIGN KEY (relatie_id) REFERENCES relaties(id) ON DELETE CASCADE;

ALTER TABLE notities DROP CONSTRAINT IF EXISTS notities_relatie_id_fkey;
ALTER TABLE notities ADD CONSTRAINT notities_relatie_id_fkey
  FOREIGN KEY (relatie_id) REFERENCES relaties(id) ON DELETE CASCADE;

-- Email log: bij klant-delete wil je ook de verzonden e-mail history
-- opruimen zodat er geen zombie-records overblijven.
ALTER TABLE email_log DROP CONSTRAINT IF EXISTS email_log_relatie_id_fkey;
ALTER TABLE email_log ADD CONSTRAINT email_log_relatie_id_fkey
  FOREIGN KEY (relatie_id) REFERENCES relaties(id) ON DELETE CASCADE;

-- Klant_relaties: portaal-koppeling tussen user-profile en klant
ALTER TABLE klant_relaties DROP CONSTRAINT IF EXISTS klant_relaties_relatie_id_fkey;
ALTER TABLE klant_relaties ADD CONSTRAINT klant_relaties_relatie_id_fkey
  FOREIGN KEY (relatie_id) REFERENCES relaties(id) ON DELETE CASCADE;
