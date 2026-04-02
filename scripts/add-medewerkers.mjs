#!/usr/bin/env node
/**
 * Voeg medewerkers toe: Nick Burgers, Jordy, Jimmy, Nick Houter
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ewmjbtymbrfuuekkszwj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3bWpidHltYnJmdXVla2tzendqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIzNTk0MCwiZXhwIjoyMDg2ODExOTQwfQ.wxDilBNdpHugVdSBGgwfu1sN9ZSztiyUAK7cVNwGaA4'
)

const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'

const medewerkers = [
  { naam: 'Nick Burgers', email: 'N.burgers@rebukozijnen.nl', type: 'werknemer' },
  { naam: 'Jordy', email: null, type: 'werknemer' },
  { naam: 'Jimmy', email: null, type: 'werknemer' },
  { naam: 'Nick Houter', email: null, type: 'werknemer' },
]

for (const m of medewerkers) {
  // Check of al bestaat
  const { data: existing } = await supabase
    .from('medewerkers')
    .select('id')
    .eq('administratie_id', adminId)
    .ilike('naam', m.naam)
    .maybeSingle()

  if (existing) {
    console.log(`Bestaat al: ${m.naam}`)
    continue
  }

  const { error } = await supabase.from('medewerkers').insert({
    administratie_id: adminId,
    naam: m.naam,
    email: m.email,
    type: m.type,
    actief: true,
  })

  if (error) {
    console.error(`Fout bij ${m.naam}:`, error.message)
  } else {
    console.log(`Toegevoegd: ${m.naam}`)
  }
}

console.log('Klaar!')
