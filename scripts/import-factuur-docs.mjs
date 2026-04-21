import { createSupabaseAdmin } from './db.mjs'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const SOURCE_DIR = '/Users/houterminiopslag/Downloads/7ecbf974-e396-4f91-a35c-6e0e7e7b173e'

function parseCSV(filePath) {
  const content = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') // strip BOM
  const lines = content.split('\n').filter(l => l.trim())
  const headers = lines[0].split(';').map(h => h.replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const values = line.split(';').map(v => v.replace(/^"|"$/g, ''))
    const obj = {}
    headers.forEach((h, i) => obj[h] = values[i] || '')
    return obj
  })
}

function normaliseer(naam) {
  return (naam || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

// Haal de project-referentie uit het factuur onderwerp
function extractProjectRef(onderwerp) {
  return onderwerp
    .replace(/^(1e|2e|3e|Credit)?\s*Factuur\s*\/?\s*(Aanbetaling|Eindafrekening|credit)?\s*/i, '')
    .trim()
}

async function main() {
  const supabase = await createSupabaseAdmin()

  // 1. Haal administratie op
  const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()
  if (!admin) { console.error('Geen administratie'); process.exit(1) }
  const adminId = admin.id

  // 2. Parse facturen CSV
  const facturen = parseCSV(join(SOURCE_DIR, 'Facturen.csv'))
  console.log(`${facturen.length} facturen in CSV`)

  // 3. Haal alle projecten op
  const { data: projecten } = await supabase
    .from('projecten')
    .select('id, naam, relatie_id')
    .eq('administratie_id', adminId)

  // Bouw project lookup: genormaliseerde naam → project
  const projectByNorm = new Map()
  for (const p of projecten) {
    const key = normaliseer(p.naam)
    if (key && !projectByNorm.has(key)) projectByNorm.set(key, p)
  }
  console.log(`${projecten.length} projecten in DB`)

  // 4. Haal alle relaties op
  const { data: relaties } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam')
    .eq('administratie_id', adminId)

  const relatieByNorm = new Map()
  for (const r of relaties) {
    const key = normaliseer(r.bedrijfsnaam)
    if (key) relatieByNorm.set(key, r)
  }

  // 5. Bouw folder UUID → folder path mapping
  const folders = readdirSync(SOURCE_DIR).filter(f => {
    try { return statSync(join(SOURCE_DIR, f)).isDirectory() } catch { return false }
  })
  const folderByUUID = new Map()
  for (const f of folders) {
    if (f.length > 37 && f[36] === '-') {
      folderByUUID.set(f.substring(0, 36), join(SOURCE_DIR, f))
    }
  }

  // 6. Verwerk elke factuur
  let matched = 0
  let uploaded = 0
  let noProject = 0
  let noPDF = 0
  let errors = 0

  for (const row of facturen) {
    const uuid = row.uuid
    const nummer = row.Nummer || ''
    const relatieNaam = row.Relatie_name || ''
    const onderwerp = row.Onderwerp || ''
    const projectRef = extractProjectRef(onderwerp)
    const fase = row.Fase_Naam_vertaald || ''
    const factuurdatum = row.Factuurdatum || ''
    const totaalStr = (row.Totaal || '').replace('.', '').replace(',', '.')
    const totaal = parseFloat(totaalStr) || 0

    // Zoek matching project via meerdere strategieën
    let project = null

    // Strategie 1: Match op project-referentie uit onderwerp
    if (projectRef) {
      const refKey = normaliseer(projectRef)
      if (refKey.length > 3) {
        // Directe match
        project = projectByNorm.get(refKey)

        // Fuzzy: deelstring
        if (!project) {
          for (const [pKey, p] of projectByNorm) {
            if (pKey.length > 5 && refKey.length > 5 && (pKey.includes(refKey) || refKey.includes(pKey))) {
              project = p; break
            }
          }
        }

        // Fuzzy: woord-overlap
        if (!project) {
          const refWords = projectRef.toLowerCase().split(/\s+/).filter(w => w.length > 2)
          if (refWords.length >= 2) {
            for (const p of projecten) {
              const pWords = p.naam.toLowerCase().split(/\s+/).filter(w => w.length > 2)
              const overlap = refWords.filter(w => pWords.some(pw => pw.includes(w) || w.includes(pw)))
              if (overlap.length >= 2 && overlap.length >= Math.min(refWords.length, pWords.length) * 0.5) {
                project = p; break
              }
            }
          }
        }
      }
    }

    // Strategie 2: Match via relatie als er maar 1 project is voor die relatie
    if (!project && relatieNaam) {
      const relatieKey = normaliseer(relatieNaam)
      const relatie = relatieByNorm.get(relatieKey)
      if (relatie) {
        const relatieProjecten = projecten.filter(p => p.relatie_id === relatie.id)
        if (relatieProjecten.length === 1) {
          project = relatieProjecten[0]
        }
      }
    }

    if (!project) {
      noProject++
      continue
    }

    matched++

    // Upload de PDF uit de folder
    const folderPath = folderByUUID.get(uuid)
    if (!folderPath) { noPDF++; continue }

    const pdfFiles = readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'))
    if (pdfFiles.length === 0) { noPDF++; continue }

    for (const pdfFile of pdfFiles) {
      const filePath = join(folderPath, pdfFile)
      const stat = statSync(filePath)
      const buffer = readFileSync(filePath)

      // Parse echte bestandsnaam (uuid-filename.pdf)
      const dashIdx = pdfFile.indexOf('-')
      const echteNaam = dashIdx > 0 ? pdfFile.substring(dashIdx + 1) : pdfFile

      const storagePath = `project-docs/${project.id}/${Date.now()}_${echteNaam.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      const { error: uploadError } = await supabase.storage
        .from('documenten')
        .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })

      if (uploadError) {
        console.error(`  Upload fout "${echteNaam}": ${uploadError.message}`)
        errors++
        continue
      }

      // Maak documenten record
      const { error: docError } = await supabase
        .from('documenten')
        .insert({
          administratie_id: adminId,
          naam: echteNaam,
          bestandsnaam: echteNaam,
          bestandstype: 'application/pdf',
          bestandsgrootte: stat.size,
          storage_path: storagePath,
          entiteit_type: 'project',
          entiteit_id: project.id,
        })

      if (docError) {
        console.error(`  Doc fout "${echteNaam}": ${docError.message}`)
        errors++
        continue
      }

      uploaded++
    }
  }

  console.log('\n--- Resultaat ---')
  console.log('Facturen gematcht aan project:', matched)
  console.log('Factuur PDFs geupload:', uploaded)
  console.log('Geen project match:', noProject)
  console.log('Geen PDF in folder:', noPDF)
  console.log('Fouten:', errors)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
