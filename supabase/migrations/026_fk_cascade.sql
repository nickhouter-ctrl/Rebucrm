-- FK's die klant-delete blokkeerden → ON DELETE SET NULL zodat taken/emails blijven bestaan
ALTER TABLE taken DROP CONSTRAINT IF EXISTS taken_relatie_id_fkey;
ALTER TABLE taken ADD CONSTRAINT taken_relatie_id_fkey
  FOREIGN KEY (relatie_id) REFERENCES relaties(id) ON DELETE SET NULL;

-- Offerte-link op taken idem
ALTER TABLE taken DROP CONSTRAINT IF EXISTS taken_offerte_id_fkey;
ALTER TABLE taken ADD CONSTRAINT taken_offerte_id_fkey
  FOREIGN KEY (offerte_id) REFERENCES offertes(id) ON DELETE SET NULL;
