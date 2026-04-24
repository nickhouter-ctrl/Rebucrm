import { createSupabaseAdmin } from './db.mjs'
import { writeFileSync, mkdirSync } from 'fs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const content = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const sb = await createSupabaseAdmin()

// Optioneel: eerst een verse backup triggeren op productie
const TRIGGER = process.argv.includes('--fresh')
if (TRIGGER) {
  console.log('Nieuwe backup triggeren op productie...')
  const res = await fetch('https://rebucrm.vercel.app/api/admin/backup-db', {
    method: 'POST',
    headers: { 'x-admin-key': process.env.SUPABASE_SERVICE_ROLE_KEY },
  })
  const j = await res.json()
  console.log('Trigger resultaat:', j)
}

// Pak meest recente backup uit Supabase Storage
const { data: folders } = await sb.storage.from('db-backups').list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } })
if (!folders || folders.length === 0) {
  console.error('Geen backups gevonden')
  process.exit(1)
}
const laatsteFolder = folders[0].name
const { data: files } = await sb.storage.from('db-backups').list(laatsteFolder, { limit: 20, sortBy: { column: 'created_at', order: 'desc' } })
if (!files || files.length === 0) {
  console.error('Geen files in', laatsteFolder)
  process.exit(1)
}
const laatsteFile = files[0].name
const volledigPad = `${laatsteFolder}/${laatsteFile}`
console.log(`Download ${volledigPad}...`)

const { data: file } = await sb.storage.from('db-backups').download(volledigPad)
if (!file) { console.error('Download mislukt'); process.exit(1) }
const buf = Buffer.from(await file.arrayBuffer())
const outputDir = resolve(__dirname, '..', 'backups')
mkdirSync(outputDir, { recursive: true })
const outPath = `${outputDir}/${laatsteFolder}-${laatsteFile}`
writeFileSync(outPath, buf)
console.log(`✓ Opgeslagen als ${outPath} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`)
