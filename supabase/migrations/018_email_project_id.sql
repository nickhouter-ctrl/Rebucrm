-- Add project_id column to emails table for linking emails to verkoopkansen
ALTER TABLE emails ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projecten(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS emails_project_id_idx ON emails(project_id);
