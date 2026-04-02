import { createDbClient } from './db.mjs'

const client = await createDbClient()
console.log('Connected!')

const result = await client.query(`
  UPDATE emails e
  SET project_id = p.id
  FROM (
    SELECT DISTINCT ON (relatie_id) id, relatie_id
    FROM projecten
    WHERE status = 'actief'
    ORDER BY relatie_id, created_at DESC
  ) p
  WHERE e.relatie_id = p.relatie_id
    AND e.project_id IS NULL
    AND e.relatie_id IS NOT NULL
`)

console.log(`Backfilled ${result.rowCount} emails with project_id`)
await client.end()
