import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) { const k = m[1].trim(); const v = m[2].trim().replace(/^["']|["']$/g, ''); if (!process.env[k]) process.env[k] = v }
  }
} catch {}

const sb = await createSupabaseAdmin()

const { data: rels } = await sb.from('relaties')
  .select('id, bedrijfsnaam, contactpersoon, email, telefoon, adres, plaats, created_at')
  .ilike('bedrijfsnaam', '%freco%')
console.log('=== Alle Freco-relaties ===')
for (const r of rels) {
  console.log(`  ${r.id}`)
  console.log(`    bedrijfsnaam: ${r.bedrijfsnaam}`)
  console.log(`    contact:      ${r.contactpersoon || '-'}`)
  console.log(`    email:        ${r.email || '-'}`)
  console.log(`    plaats:       ${r.plaats || '-'}`)
  console.log(`    created:      ${r.created_at?.slice(0, 10)}`)
  // Tellen
  const [{ count: pr }, { count: of }, { count: fa }] = await Promise.all([
    sb.from('projecten').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
    sb.from('offertes').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
    sb.from('facturen').select('id', { count: 'exact', head: true }).eq('relatie_id', r.id),
  ])
  console.log(`    projecten=${pr} offertes=${of} facturen=${fa}`)
  console.log()
}
