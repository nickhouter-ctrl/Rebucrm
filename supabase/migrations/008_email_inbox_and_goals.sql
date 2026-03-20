-- Migratie 008: E-mail inbox en omzetdoelen
-- Tabellen: emails, email_sync_state, omzetdoelen

-- === EMAILS TABEL ===
CREATE TABLE IF NOT EXISTS emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  administratie_id UUID NOT NULL REFERENCES administraties(id) ON DELETE CASCADE,
  message_id TEXT, -- IMAP Message-ID header
  in_reply_to TEXT, -- In-Reply-To header (threading)
  reference_ids TEXT[], -- References header (threading)
  van_email TEXT NOT NULL,
  van_naam TEXT,
  aan_email TEXT NOT NULL,
  onderwerp TEXT,
  body_text TEXT,
  body_html TEXT,
  datum TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  richting TEXT NOT NULL CHECK (richting IN ('inkomend', 'uitgaand')),
  relatie_id UUID REFERENCES relaties(id) ON DELETE SET NULL,
  offerte_id UUID REFERENCES offertes(id) ON DELETE SET NULL,
  gelezen BOOLEAN NOT NULL DEFAULT FALSE,
  verwerkt BOOLEAN NOT NULL DEFAULT FALSE,
  labels TEXT[] DEFAULT '{}',
  imap_uid INTEGER,
  imap_folder TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS emails_message_id_unique ON emails(administratie_id, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS emails_administratie_id_idx ON emails(administratie_id);
CREATE INDEX IF NOT EXISTS emails_relatie_id_idx ON emails(relatie_id);
CREATE INDEX IF NOT EXISTS emails_offerte_id_idx ON emails(offerte_id);
CREATE INDEX IF NOT EXISTS emails_datum_idx ON emails(datum DESC);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emails_select" ON emails
  FOR SELECT USING (
    administratie_id IN (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );

CREATE POLICY "emails_insert" ON emails
  FOR INSERT WITH CHECK (
    administratie_id IN (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );

CREATE POLICY "emails_update" ON emails
  FOR UPDATE USING (
    administratie_id IN (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );

CREATE POLICY "emails_delete" ON emails
  FOR DELETE USING (
    administratie_id IN (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );

-- === EMAIL SYNC STATE TABEL ===
CREATE TABLE IF NOT EXISTS email_sync_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  administratie_id UUID NOT NULL UNIQUE REFERENCES administraties(id) ON DELETE CASCADE,
  laatste_uid INTEGER DEFAULT 0,
  laatste_sync TIMESTAMPTZ,
  status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'syncing', 'error')),
  error_bericht TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_sync_state_select" ON email_sync_state
  FOR SELECT USING (
    administratie_id IN (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );

CREATE POLICY "email_sync_state_insert" ON email_sync_state
  FOR INSERT WITH CHECK (
    administratie_id IN (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );

CREATE POLICY "email_sync_state_update" ON email_sync_state
  FOR UPDATE USING (
    administratie_id IN (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );

-- === OMZETDOELEN TABEL ===
CREATE TABLE IF NOT EXISTS omzetdoelen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  administratie_id UUID NOT NULL REFERENCES administraties(id) ON DELETE CASCADE,
  jaar INTEGER NOT NULL,
  week_doel NUMERIC(12,2) DEFAULT 0,
  maand_doel NUMERIC(12,2) DEFAULT 0,
  jaar_doel NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(administratie_id, jaar)
);

ALTER TABLE omzetdoelen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "omzetdoelen_select" ON omzetdoelen
  FOR SELECT USING (
    administratie_id IN (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );

CREATE POLICY "omzetdoelen_insert" ON omzetdoelen
  FOR INSERT WITH CHECK (
    administratie_id IN (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );

CREATE POLICY "omzetdoelen_update" ON omzetdoelen
  FOR UPDATE USING (
    administratie_id IN (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );

CREATE POLICY "omzetdoelen_delete" ON omzetdoelen
  FOR DELETE USING (
    administratie_id IN (
      SELECT administratie_id FROM profielen WHERE id = auth.uid()
    )
  );
