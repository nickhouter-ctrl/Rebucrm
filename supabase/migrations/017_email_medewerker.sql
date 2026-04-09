-- Migratie 017: Email toewijzen aan medewerker
ALTER TABLE emails ADD COLUMN IF NOT EXISTS medewerker_id UUID REFERENCES medewerkers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS emails_medewerker_id_idx ON emails(medewerker_id);
