-- Bucket voor handmatig geüploade e-mail bijlagen (extra PDFs bij offerte/factuur versturen)
-- Private bucket — toegang alleen via signed URL server-side
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-bijlagen', 'email-bijlagen', false)
ON CONFLICT (id) DO NOTHING;
