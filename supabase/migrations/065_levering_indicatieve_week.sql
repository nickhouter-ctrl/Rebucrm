-- Twee-fasen leveringsplanning.
-- leverweek = indicatieve verwachte leverweek (maandag van de ISO-week), gezet
-- zodra wij een levering voorlopig inplannen. De definitieve exacte datum blijft
-- in leverdatum staan en wordt pas gevuld als de fabriek een vaste dag bevestigt.
--
-- Status afgeleid (geen extra kolom nodig):
--   leverdatum gevuld          -> definitief gepland
--   alleen leverweek gevuld    -> indicatief gepland (kan max 1 week uitlopen)
--   beide leeg                 -> nog te plannen
ALTER TABLE orders ADD COLUMN IF NOT EXISTS leverweek date;
COMMENT ON COLUMN orders.leverweek IS 'Indicatieve leverweek (maandag van ISO-week); definitieve datum staat in leverdatum';
