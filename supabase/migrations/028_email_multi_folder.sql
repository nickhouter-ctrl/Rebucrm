-- Per-folder UID tracking zodat we meerdere IMAP folders kunnen syncen
ALTER TABLE email_sync_state ADD COLUMN IF NOT EXISTS folder_uids JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(imap_folder);
