import pg from 'pg'
const { Client } = pg

const client = new Client({
  connectionString: 'postgresql://postgres.ewmjbtymbrfuuekkszwj:u5VlzLkjYsUhfUqc@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
})

await client.connect()
await client.query('ALTER TABLE emails ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projecten(id) ON DELETE SET NULL')
console.log('Column project_id added to emails table')
await client.query('CREATE INDEX IF NOT EXISTS emails_project_id_idx ON emails(project_id)')
console.log('Index created')
await client.end()
