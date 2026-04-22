-- Verkoopkansen kunnen ook als verloren/vervallen worden gemarkeerd
ALTER TABLE projecten DROP CONSTRAINT IF EXISTS projecten_status_check;
ALTER TABLE projecten ADD CONSTRAINT projecten_status_check
  CHECK (status IN ('actief', 'afgerond', 'gewonnen', 'verloren', 'vervallen', 'on_hold', 'geannuleerd'));
