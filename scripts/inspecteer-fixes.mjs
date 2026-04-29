import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) {
      const k = m[1].trim()
      const v = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  }
} catch {}

const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

console.log('=== 1. Andy verkoopkans-koppeling ===\n')
const { data: project } = await sb.from('projecten').select('*').eq('id', '16b462fc-95f9-4f5f-b655-7ad448d4397b').single()
console.log('Project:', JSON.stringify({ id: project.id, naam: project.naam, status: project.status, relatie_id: project.relatie_id }, null, 2))

const { data: huidigeRel } = await sb.from('relaties').select('id, bedrijfsnaam, contactpersoon').eq('id', project.relatie_id).single()
console.log('Huidige (foute) koppeling:', huidigeRel)

const { data: andyRels } = await sb.from('relaties')
  .select('id, bedrijfsnaam, contactpersoon, email')
  .eq('administratie_id', adminId)
  .or('bedrijfsnaam.ilike.%andy%stoutenburg%,contactpersoon.ilike.%andy%stoutenburg%')
console.log('Mogelijke Andy-relaties:', andyRels)

console.log('\n=== 2a. Mitchel en Valery duplicaten ===\n')
const { data: mvRels } = await sb.from('relaties')
  .select('id, bedrijfsnaam, contactpersoon, email, telefoon, adres, plaats, created_at')
  .eq('administratie_id', adminId)
  .ilike('bedrijfsnaam', '%mitchel%valery%')
console.log('Relaties:', JSON.stringify(mvRels, null, 2))

if (mvRels?.length === 2) {
  for (const r of mvRels) {
    const [proj, off, fac, em, tk, br] = await Promise.all([
      sb.from('projecten').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
      sb.from('offertes').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
      sb.from('facturen').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
      sb.from('emails').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
      sb.from('taken').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
      sb.from('berichten').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
    ])
    console.log(`  ${r.id}: projecten=${proj.count} offertes=${off.count} facturen=${fac.count} emails=${em.count} taken=${tk.count} berichten=${br.count}`)
  }
}

console.log('\n=== 2b. Stefan en Anna duplicaten ===\n')
const { data: saRels } = await sb.from('relaties')
  .select('id, bedrijfsnaam, contactpersoon, email, telefoon, adres, plaats, created_at')
  .eq('administratie_id', adminId)
  .ilike('bedrijfsnaam', '%stefan%anna%')
console.log('Relaties:', JSON.stringify(saRels, null, 2))

if (saRels?.length === 2) {
  for (const r of saRels) {
    const [proj, off, fac, em, tk, br] = await Promise.all([
      sb.from('projecten').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
      sb.from('offertes').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
      sb.from('facturen').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
      sb.from('emails').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
      sb.from('taken').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
      sb.from('berichten').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
    ])
    console.log(`  ${r.id}: projecten=${proj.count} offertes=${off.count} facturen=${fac.count} emails=${em.count} taken=${tk.count} berichten=${br.count}`)
  }
}

console.log('\n=== 3. Klant_relaties / portaal-toegang? ===\n')
const ids = [...(mvRels || []), ...(saRels || [])].map(r => r.id)
if (ids.length) {
  const { data: kr } = await sb.from('klant_relaties').select('*').in('relatie_id', ids)
  console.log('Klant_relaties:', kr)
}
