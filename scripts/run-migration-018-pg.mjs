import pg from 'pg'
const { Client } = pg

// Try session mode pooler (port 5432) with SSL
const client = new Client({
  host: 'aws-0-eu-central-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.ewmjbtymbrfuuekkszwj',
  password: 'u5VlzLkjYsUhfUqc',
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  console.log('Connected!')
  await client.query('ALTER TABLE emails ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projecten(id) ON DELETE SET NULL')
  console.log('Column project_id added to emails table')
  await client.query('CREATE INDEX IF NOT EXISTS emails_project_id_idx ON emails(project_id)')
  console.log('Index created')
  await client.end()
  console.log('Done!')
} catch (err) {
  console.error('Error:', err.message)
  // Try direct connection as fallback
  console.log('Trying direct connection...')
  const client2 = new Client({
    host: 'db.ewmjbtymbrfuuekkszwj.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'u5VlzLkjYsUhfUqc',
    ssl: { rejectUnauthorized: false },
  })
  try {
    await client2.connect()
    console.log('Connected via direct!')
    await client2.query('ALTER TABLE emails ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projecten(id) ON DELETE SET NULL')
    console.log('Column project_id added')
    await client2.query('CREATE INDEX IF NOT EXISTS emails_project_id_idx ON emails(project_id)')
    console.log('Index created')
    await client2.end()
    console.log('Done!')
  } catch (err2) {
    console.error('Direct also failed:', err2.message)
  }
}
