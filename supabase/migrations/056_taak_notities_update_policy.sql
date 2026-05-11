-- taak_notities miste een UPDATE-policy waardoor bewerkingen op
-- bestaande notities stilzwijgend door RLS werden geblokkeerd.

DROP POLICY IF EXISTS "taak_notities_update" ON taak_notities;
CREATE POLICY "taak_notities_update" ON taak_notities FOR UPDATE
  USING (administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid()))
  WITH CHECK (administratie_id IN (SELECT administratie_id FROM profielen WHERE id = auth.uid()));
