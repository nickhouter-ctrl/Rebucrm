import pg from 'pg'

const client = new pg.Client({
  connectionString: 'postgresql://postgres.ewmjbtymbrfuuekkszwj:u5VlzLkjYsUhfUqc@aws-1-eu-west-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

await client.connect()
console.log('Connected!')

// Step 1: Backfill from "Oud nummer" in omschrijving
const res1 = await client.query(`
  UPDATE taken
  SET taaknummer = (regexp_match(omschrijving, 'Oud nummer:\\s*(\\d{4}-\\d{4,5})'))[1]
  WHERE taaknummer IS NULL
    AND omschrijving ~ 'Oud nummer:\\s*\\d{4}-\\d{4,5}'
`)
console.log('Tribe-nummers ingevuld:', res1.rowCount, 'taken')

// Step 2: Generate numbers for remaining taken (without Tribe number)
const res2 = await client.query(`
  WITH numbered AS (
    SELECT id,
      EXTRACT(YEAR FROM created_at)::INTEGER AS jaar,
      ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM created_at) ORDER BY created_at) AS rn
    FROM taken
    WHERE taaknummer IS NULL
  ),
  max_existing AS (
    SELECT
      SPLIT_PART(taaknummer, '-', 1) AS jaar,
      MAX(SPLIT_PART(taaknummer, '-', 2)::INTEGER) AS max_nr
    FROM taken
    WHERE taaknummer IS NOT NULL
    GROUP BY SPLIT_PART(taaknummer, '-', 1)
  )
  UPDATE taken
  SET taaknummer = numbered.jaar || '-' || LPAD((COALESCE(me.max_nr, 0) + numbered.rn)::TEXT, 5, '0')
  FROM numbered
  LEFT JOIN max_existing me ON me.jaar = numbered.jaar::TEXT
  WHERE taken.id = numbered.id
`)
console.log('Nieuwe nummers gegenereerd:', res2.rowCount, 'taken')

// Verify
const check = await client.query(`
  SELECT taaknummer, titel FROM taken 
  WHERE taaknummer IS NOT NULL 
  ORDER BY taaknummer DESC LIMIT 10
`)
console.log('\nLaatste 10:')
for (const r of check.rows) {
  console.log(`  ${r.taaknummer} — ${r.titel.substring(0, 60)}`)
}

const total = await client.query(`SELECT COUNT(*) as total, COUNT(taaknummer) as met_nummer FROM taken`)
console.log('\nTotaal:', total.rows[0])

await client.end()
