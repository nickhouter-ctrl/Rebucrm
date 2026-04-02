import { createDbClient } from './db.mjs'

const client = await createDbClient()
await client.query('ALTER TABLE emails ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projecten(id) ON DELETE SET NULL')
console.log('Column project_id added to emails table')
await client.query('CREATE INDEX IF NOT EXISTS emails_project_id_idx ON emails(project_id)')
console.log('Index created')
await client.end()
