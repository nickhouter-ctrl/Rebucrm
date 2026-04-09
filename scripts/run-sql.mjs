#!/usr/bin/env node
/**
 * Run SQL via Supabase Management API / supabase-js
 */
import { createSupabaseAdmin } from './db.mjs'

const sql = `ALTER TABLE emails ADD COLUMN IF NOT EXISTS medewerker_id UUID REFERENCES medewerkers(id) ON DELETE SET NULL;`

const supabase = await createSupabaseAdmin()

// Try via RPC first
const { error: fnError } = await supabase.rpc('exec_sql', { sql_query: sql })
if (fnError) {
  console.log('RPC not available, trying alternative...')
  // Just check if we can use the column now - maybe it was already added
  const { error: testError } = await supabase.from('emails').select('medewerker_id').limit(1)
  if (testError) {
    console.log('Column still missing. Please run this SQL in Supabase SQL Editor:')
    console.log(sql)
    console.log('\nOr add the column via the Supabase Dashboard Table Editor.')
  } else {
    console.log('Column already exists!')
  }
} else {
  console.log('Migration ran successfully!')
}
