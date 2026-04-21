-- Tijdstip toevoegen aan taken (optioneel naast deadline date)
ALTER TABLE taken ADD COLUMN IF NOT EXISTS deadline_tijd TIME;
