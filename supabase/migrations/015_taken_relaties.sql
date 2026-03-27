-- Add relatie_id and offerte_id columns to taken for CRM linking
ALTER TABLE taken ADD COLUMN IF NOT EXISTS relatie_id UUID REFERENCES relaties(id);
ALTER TABLE taken ADD COLUMN IF NOT EXISTS offerte_id UUID REFERENCES offertes(id);
