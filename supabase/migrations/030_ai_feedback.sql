-- AI leert van handmatige aanpassingen: sla origineel + uiteindelijke versie op
CREATE TABLE IF NOT EXISTS ai_email_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  administratie_id UUID NOT NULL REFERENCES administraties(id) ON DELETE CASCADE,
  gebruiker_id UUID REFERENCES profielen(id) ON DELETE SET NULL,
  template TEXT,
  context TEXT,                    -- 'leads_bulk' / 'email_reply'
  ai_origineel TEXT NOT NULL,      -- wat AI initieel schreef
  user_verzonden TEXT NOT NULL,    -- wat user uiteindelijk verstuurde
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_admin ON ai_email_feedback(administratie_id, created_at DESC);

ALTER TABLE ai_email_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_feedback_admin" ON ai_email_feedback
  FOR ALL USING (
    administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid())
  );
