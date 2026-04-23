-- Sla per leverancier de regio's op die we WIT moeten maken (prijzen + geen garantie),
-- als percentages van pagina-afmetingen voor schaal-onafhankelijk hergebruik.
ALTER TABLE ai_tekening_template ADD COLUMN IF NOT EXISTS remove_regions_pct jsonb;
