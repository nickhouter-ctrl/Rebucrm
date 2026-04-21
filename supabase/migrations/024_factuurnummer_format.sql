-- Factuurnummer-format wijzigen naar F-2026-00167 (jaar-prefix, 5-cijferig)
ALTER TABLE nummering ADD COLUMN IF NOT EXISTS padding INTEGER NOT NULL DEFAULT 4;

-- Update volgende_nummer functie om padding kolom te gebruiken
CREATE OR REPLACE FUNCTION volgende_nummer(p_administratie_id uuid, p_type text)
RETURNS text AS $$
DECLARE
  v_prefix text;
  v_nummer integer;
  v_padding integer;
  v_result text;
BEGIN
  UPDATE nummering
  SET volgend_nummer = volgend_nummer + 1
  WHERE administratie_id = p_administratie_id AND type = p_type
  RETURNING prefix, volgend_nummer - 1, padding INTO v_prefix, v_nummer, v_padding;

  IF NOT FOUND THEN
    INSERT INTO nummering (administratie_id, type, prefix, volgend_nummer, padding)
    VALUES (p_administratie_id, p_type,
      CASE p_type
        WHEN 'offerte' THEN 'OFF-'
        WHEN 'order' THEN 'ORD-'
        WHEN 'factuur' THEN 'F-' || EXTRACT(YEAR FROM now())::text || '-'
        WHEN 'inkoopfactuur' THEN 'INK-'
        WHEN 'boeking' THEN 'BOE-'
      END,
      2,
      CASE p_type WHEN 'factuur' THEN 5 ELSE 4 END
    )
    RETURNING prefix, padding INTO v_prefix, v_padding;
    v_nummer := 1;
  END IF;

  v_result := v_prefix || LPAD(v_nummer::text, v_padding, '0');
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
