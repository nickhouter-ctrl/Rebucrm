-- Voeg bron kolom toe aan projecten tabel
-- 'import' = geimporteerd vanuit oud systeem, 'handmatig' = nieuw aangemaakt
ALTER TABLE projecten ADD COLUMN IF NOT EXISTS bron TEXT DEFAULT 'handmatig';

-- Backfill: alle bestaande projecten zijn geimporteerd
UPDATE projecten SET bron = 'import' WHERE bron = 'handmatig';
