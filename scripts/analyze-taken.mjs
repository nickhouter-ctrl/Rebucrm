#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ewmjbtymbrfuuekkszwj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3bWpidHltYnJmdXVla2tzendqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIzNTk0MCwiZXhwIjoyMDg2ODExOTQwfQ.wxDilBNdpHugVdSBGgwfu1sN9ZSztiyUAK7cVNwGaA4'
)
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'

// Haal alle taken op
let allTaken = []
let from = 0
while (true) {
  const { data } = await supabase.from('taken').select('id, titel, omschrijving, project_id, relatie_id').eq('administratie_id', adminId).range(from, from + 999)
  if (!data || data.length === 0) break
  allTaken.push(...data)
  from += 1000
}

const metProject = allTaken.filter(t => t.project_id)
const zonderProject = allTaken.filter(t => !t.project_id)
const metProjectInOmschr = zonderProject.filter(t => t.omschrijving && t.omschrijving.includes('Project:'))

console.log('Totaal taken:', allTaken.length)
console.log('Met project_id:', metProject.length)
console.log('Zonder project_id:', zonderProject.length)
console.log('Zonder project_id maar MET "Project:" in omschrijving:', metProjectInOmschr.length)

console.log('\nVoorbeelden "Project:" in omschrijving:')
metProjectInOmschr.slice(0, 15).forEach(t => {
  const match = t.omschrijving.match(/Project:\s*(.+?)(?:\n|$)/)
  console.log('  Titel:', JSON.stringify(t.titel), '-> Project naam:', JSON.stringify(match?.[1]?.trim()))
})

// Unieke titels
const titels = {}
allTaken.forEach(t => { titels[t.titel] = (titels[t.titel] || 0) + 1 })
const sorted = Object.entries(titels).sort((a, b) => b[1] - a[1])
console.log('\nMeest voorkomende titels:')
sorted.slice(0, 15).forEach(([titel, count]) => console.log('  ' + count + 'x ' + titel))
