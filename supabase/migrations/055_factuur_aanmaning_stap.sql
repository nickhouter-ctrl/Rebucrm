-- Tracking-kolom voor 3-staps aanmaningssysteem.
-- 0 = nog geen aanmaning, 1/2/3 = laatst verstuurde stap.
-- aanmaning_verstuurd_op = datum laatste herinnering (UI: "3e aanmaning op …").

ALTER TABLE facturen
  ADD COLUMN IF NOT EXISTS aanmaning_stap smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aanmaning_verstuurd_op timestamptz;

COMMENT ON COLUMN facturen.aanmaning_stap IS 'Laatst verstuurde aanmaning-stap: 0=geen, 1=herinnering 7d, 2=aanmaning 14d, 3=laatste 30d';
COMMENT ON COLUMN facturen.aanmaning_verstuurd_op IS 'Wanneer de laatste aanmaning is verstuurd';
