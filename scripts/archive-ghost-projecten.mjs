import { createSupabaseAdmin } from './db.mjs'

const DRY = process.argv.includes('--dry')
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

const { data: all } = await sb.from('projecten').select('id, naam, status, bron, offertes:offertes(id)').eq('administratie_id', adminId).in('status', ['actief','on_hold'])

const isRuis = (naam) => {
  const n = (naam || '').trim().toLowerCase()
  if (!n) return true
  if (/^(re:|fwd:|fw:|aw:|antw:)/i.test(n)) return true
  if (/prijsaanpas|prijsstell|prijsverh/i.test(n)) return true
  if (/^uw offerte|^uw factu|betaalbevest/i.test(n)) return true
  if (/nieuwsbrief|newsletter|belangrijke informatie/i.test(n)) return true
  if (n === 'offerte' || n === 'aanvraag' || n === 'offerte aanvraag') return true
  return false
}

const ruis = all.filter(p => !p.offertes?.length && p.bron !== 'import' && isRuis(p.naam))
console.log(`Ruis verkoopkansen (zonder offerte): ${ruis.length}`)
for (const p of ruis.slice(0, 15)) console.log(`  ${p.naam}`)

if (!DRY) {
  const ids = ruis.map(p => p.id)
  const CHUNK = 100
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { error } = await sb.from('projecten').update({ status: 'geannuleerd' }).in('id', chunk)
    if (error) console.error('error:', error)
  }
  console.log(`${ids.length} verkoopkansen op status=geannuleerd gezet`)
}
