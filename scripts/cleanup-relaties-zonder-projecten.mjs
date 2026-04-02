#!/usr/bin/env node
/**
 * Verwijder relaties die geen gekoppeld project, offerte, factuur of taak hebben.
 * DRY RUN: voer eerst uit zonder --execute om te zien wat er verwijderd zou worden.
 *
 * Usage:
 *   node scripts/cleanup-relaties-zonder-projecten.mjs           # dry run
 *   node scripts/cleanup-relaties-zonder-projecten.mjs --execute  # echt verwijderen
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ewmjbtymbrfuuekkszwj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3bWpidHltYnJmdXVla2tzendqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIzNTk0MCwiZXhwIjoyMDg2ODExOTQwfQ.wxDilBNdpHugVdSBGgwfu1sN9ZSztiyUAK7cVNwGaA4'
)

const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'
const execute = process.argv.includes('--execute')

// Haal alle relaties op (met paginering)
let allRelaties = []
let from = 0
while (true) {
  const { data } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam')
    .eq('administratie_id', adminId)
    .range(from, from + 999)
  if (!data || data.length === 0) break
  allRelaties.push(...data)
  from += 1000
}
console.log(`Totaal relaties: ${allRelaties.length}`)

// Haal alle relatie_ids op die ergens gekoppeld zijn
const gekoppeldSets = new Set()

// Projecten
let pFrom = 0
while (true) {
  const { data } = await supabase
    .from('projecten')
    .select('relatie_id')
    .eq('administratie_id', adminId)
    .not('relatie_id', 'is', null)
    .range(pFrom, pFrom + 999)
  if (!data || data.length === 0) break
  data.forEach(r => gekoppeldSets.add(r.relatie_id))
  pFrom += 1000
}

// Offertes
pFrom = 0
while (true) {
  const { data } = await supabase
    .from('offertes')
    .select('relatie_id')
    .eq('administratie_id', adminId)
    .not('relatie_id', 'is', null)
    .range(pFrom, pFrom + 999)
  if (!data || data.length === 0) break
  data.forEach(r => gekoppeldSets.add(r.relatie_id))
  pFrom += 1000
}

// Facturen
pFrom = 0
while (true) {
  const { data } = await supabase
    .from('facturen')
    .select('relatie_id')
    .eq('administratie_id', adminId)
    .not('relatie_id', 'is', null)
    .range(pFrom, pFrom + 999)
  if (!data || data.length === 0) break
  data.forEach(r => gekoppeldSets.add(r.relatie_id))
  pFrom += 1000
}

// Taken
pFrom = 0
while (true) {
  const { data } = await supabase
    .from('taken')
    .select('relatie_id')
    .eq('administratie_id', adminId)
    .not('relatie_id', 'is', null)
    .range(pFrom, pFrom + 999)
  if (!data || data.length === 0) break
  data.forEach(r => gekoppeldSets.add(r.relatie_id))
  pFrom += 1000
}

// Orders
pFrom = 0
while (true) {
  const { data } = await supabase
    .from('orders')
    .select('relatie_id')
    .eq('administratie_id', adminId)
    .not('relatie_id', 'is', null)
    .range(pFrom, pFrom + 999)
  if (!data || data.length === 0) break
  data.forEach(r => gekoppeldSets.add(r.relatie_id))
  pFrom += 1000
}

console.log(`Relaties met koppelingen: ${gekoppeldSets.size}`)

const teVerwijderen = allRelaties.filter(r => !gekoppeldSets.has(r.id))
console.log(`\nTe verwijderen: ${teVerwijderen.length} relaties zonder koppelingen`)

if (teVerwijderen.length > 0) {
  console.log('\nVoorbeeld (eerste 20):')
  teVerwijderen.slice(0, 20).forEach(r => console.log(`  - ${r.bedrijfsnaam}`))
}

if (execute && teVerwijderen.length > 0) {
  console.log('\nVerwijderen...')
  const ids = teVerwijderen.map(r => r.id)
  // Batch delete in chunks of 100
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const { error } = await supabase.from('relaties').delete().in('id', chunk)
    if (error) {
      console.error(`Fout bij batch ${i}:`, error.message)
    } else {
      console.log(`Verwijderd: ${Math.min(i + 100, ids.length)}/${ids.length}`)
    }
  }
  console.log('Klaar!')
} else if (!execute && teVerwijderen.length > 0) {
  console.log('\n⚠️  Dit was een DRY RUN. Voer uit met --execute om daadwerkelijk te verwijderen.')
}
