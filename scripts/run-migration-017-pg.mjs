import { createDbClient } from './db.mjs'

const client = await createDbClient()
await client.query('ALTER TABLE emails ADD COLUMN IF NOT EXISTS medewerker_id UUID REFERENCES medewerkers(id) ON DELETE SET NULL')
console.log('Column medewerker_id added to emails table')
await client.query('CREATE INDEX IF NOT EXISTS emails_medewerker_id_idx ON emails(medewerker_id)')
console.log('Index created')
await client.end()
