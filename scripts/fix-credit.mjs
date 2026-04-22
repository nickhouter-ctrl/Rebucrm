import fs from 'fs'
for (const line of fs.readFileSync('/Users/houterminiopslag/Documents/projects/Rebu/.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/); if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

// Fix F-2025-00064: totaal 705.76, openstaand SS -683.02 → betaald_bedrag = totaal - openstaand = 1388.78
const { data: f } = await sb.from('facturen').select('id, totaal').eq('administratie_id', admin.id).eq('factuurnummer', 'F-2025-00064').single()
if (f) {
  const betaald = Math.round((Number(f.totaal) - (-683.02)) * 100) / 100
  await sb.from('facturen').update({ betaald_bedrag: betaald, status: 'gecrediteerd' }).eq('id', f.id)
  console.log(`F-2025-00064: totaal ${f.totaal}, betaald_bedrag gezet op ${betaald}, status gecrediteerd`)
}

// Check totaal openstaand
const { data } = await sb.from('facturen').select('totaal, betaald_bedrag, status').eq('administratie_id', admin.id)
const open = data.filter(f => ['verzonden', 'deels_betaald', 'vervallen', 'gecrediteerd'].includes(f.status)).reduce((s, f) => s + Number(f.totaal) - Number(f.betaald_bedrag || 0), 0)
console.log(`CRM openstaand (inclusief gecrediteerd): €${open.toFixed(2)}`)
