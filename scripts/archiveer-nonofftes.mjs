// Archiveer offertes die duidelijk geen offerte zijn (email-import rommel).
import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const patterns = [
  /wachtwoord/i,
  /notariss?en|notariaat/i,
  /aanmaning/i,
  /herinnering/i,
  /\bticket\b/i,
  /password\s*reset/i,
  /login/i,
  /order\s*bevestiging/i,
  /nieuwsbrief/i,
  /newsletter/i,
  /unsubscribe/i,
  /^re:\s*bedankt/i,
  /^spam/i,
  /noreply|no-reply/i,
  /ooo\s*-/i, // out-of-office
  /akugt/i,
]

const all = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes')
    .select('id, offertenummer, onderwerp, status, totaal, relatie:relaties(bedrijfsnaam, email)')
    .eq('administratie_id', admin.id)
    .or('gearchiveerd.is.null,gearchiveerd.eq.false')
    .range(from, from + 999)
  if (!data || data.length === 0) break
  all.push(...data); from += 1000
}

function isNonOfferte(o) {
  const t = (o.onderwerp || '') + ' ' + (o.relatie?.bedrijfsnaam || '') + ' ' + (o.relatie?.email || '')
  return patterns.some(p => p.test(t))
}

const nonOff = all.filter(isNonOfferte)
console.log(`Te archiveren non-offertes: ${nonOff.length}`)
for (const o of nonOff.slice(0, 10)) {
  console.log(`  ${o.offertenummer} - "${o.onderwerp || ''}" | ${o.relatie?.bedrijfsnaam || '-'}`)
}

if (process.argv.includes('--dry')) process.exit(0)

const ids = nonOff.map(o => o.id)
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100)
  await sb.from('offertes').update({ gearchiveerd: true, gearchiveerd_op: new Date().toISOString() }).in('id', chunk)
}
console.log(`Gearchiveerd: ${ids.length}`)
