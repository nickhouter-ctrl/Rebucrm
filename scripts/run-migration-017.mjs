import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()

// Test if column already exists
const { error } = await supabase.from('emails').select('medewerker_id').limit(1)
if (error && error.message.includes('medewerker_id')) {
  console.log('Column does not exist yet, needs manual SQL migration via Supabase dashboard.')
  console.log('Run this SQL in the Supabase SQL Editor:')
  console.log('ALTER TABLE emails ADD COLUMN IF NOT EXISTS medewerker_id UUID REFERENCES medewerkers(id) ON DELETE SET NULL;')
} else {
  console.log('Column medewerker_id already exists or was created. Result:', error ? error.message : 'OK')
}
