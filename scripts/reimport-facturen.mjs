import { createSupabaseAdmin } from './db.mjs'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const SOURCE_DIR = '/Users/houterminiopslag/Downloads/7ecbf974-e396-4f91-a35c-6e0e7e7b173e'

function parseCSV(filePath) {
  const content = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
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

function extractProjectRef(onderwerp) {
  return onderwerp
    .replace(/^(1e|2e|3e|Credit)?\s*Factuur\s*\/?\s*(Aanbetaling|Eindafrekening|credit)?\s*/i, '')
    .trim()
}

function parseDatum(datumStr) {
  const parts = datumStr.split('-')
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return new Date().toISOString().split('T')[0]
}

function parseTimestamp(datumStr) {
  const parts = datumStr.split('-')
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).toISOString()
  }
  return new Date().toISOString()
}

function parseBedrag(str) {
  // Nederlands: 1.524,677 → verwijder punt (duizendscheider), vervang komma (decimaal)
  if (!str) return 0
  const cleaned = str.replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

function mapStatus(fase) {
  switch (fase.toLowerCase()) {
    case 'betaald': return 'betaald'
    case 'verstuurd': return 'verzonden'
    case 'gecrediteerd': return 'gecrediteerd'
    default: return 'verzonden'
  }
}

function mapFactuurType(onderwerp) {
  const lower = (onderwerp || '').toLowerCase()
  if (lower.includes('aanbetaling') || lower.includes('1e factuur')) return 'aanbetaling'
  if (lower.includes('eindafrekening') || lower.includes('3e factuur') || lower.includes('2e factuur')) return 'restbetaling'
  return 'volledig'
}

async function main() {
  const supabase = await createSupabaseAdmin()

  const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()
  if (!admin) { console.error('Geen administratie'); process.exit(1) }
  const adminId = admin.id

  // STAP 1: Verwijder alle fout-geïmporteerde facturen
  console.log('Verwijder oude geïmporteerde facturen...')
  const { data: oudeFact, error: delErr } = await supabase
    .from('facturen')
    .delete()
    .eq('administratie_id', adminId)
    .is('offerte_id', null) // alleen facturen zonder offerte-link (= geïmporteerd)
    .select('id')

  console.log(`${(oudeFact || []).length} oude facturen verwijderd`, delErr?.message || '')

  // STAP 2: Parse CSV
  const facturen = parseCSV(join(SOURCE_DIR, 'Facturen.csv'))
  console.log(`${facturen.length} facturen in CSV`)

  // Test bedrag parsing
  console.log('\nBedrag parse test:')
  console.log('  145,2 =>', parseBedrag('145,2'))
  console.log('  1.524,677 =>', parseBedrag('1.524,677'))
  console.log('  975,31203 =>', parseBedrag('975,31203'))

  // Haal projecten op
  const { data: projecten } = await supabase
    .from('projecten')
    .select('id, naam, relatie_id')
    .eq('administratie_id', adminId)

  const projectByNorm = new Map()
  for (const p of projecten) {
    const key = normaliseer(p.naam)
    if (key && !projectByNorm.has(key)) projectByNorm.set(key, p)
  }

  // Haal relaties op
  const { data: relaties } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam')
    .eq('administratie_id', adminId)

  const relatieByNorm = new Map()
  for (const r of relaties) {
    const key = normaliseer(r.bedrijfsnaam)
    if (key) relatieByNorm.set(key, r)
  }

  // Projecten per relatie
  const projectenPerRelatie = new Map()
  for (const p of projecten) {
    if (p.relatie_id) {
      if (!projectenPerRelatie.has(p.relatie_id)) projectenPerRelatie.set(p.relatie_id, [])
      projectenPerRelatie.get(p.relatie_id).push(p)
    }
  }

  // Folder UUID map
  const allFolders = readdirSync(SOURCE_DIR).filter(f => {
    try { return statSync(join(SOURCE_DIR, f)).isDirectory() } catch { return false }
  })
  const folderByUUID = new Map()
  for (const f of allFolders) {
    if (f.length > 37 && f[36] === '-') {
      folderByUUID.set(f.substring(0, 36), join(SOURCE_DIR, f))
    }
  }

  // Bestaande document paths (voor duplicaat check)
  const { data: bestaandeDocs } = await supabase
    .from('documenten')
    .select('storage_path')
    .eq('administratie_id', adminId)
    .eq('entiteit_type', 'project')

  const bestaandePaths = new Set((bestaandeDocs || []).map(d => d.storage_path))

  let factuurAangemaakt = 0
  let projectGematcht = 0
  let projectAangemaakt = 0
  let pdfUploaded = 0
  let pdfSkipped = 0
  let errors = 0
  let totaalBetaald = 0

  for (const row of facturen) {
    const uuid = row.uuid
    const factuurnummer = row.Nummer || ''
    const relatieNaam = (row.Relatie_name || '').trim()
    const onderwerp = row.Onderwerp || ''
    const projectRef = extractProjectRef(onderwerp)
    const fase = row.Fase_Naam_vertaald || ''
    const factuurdatum = row.Factuurdatum || ''
    const vervaldatum = row.Vervaldatum || ''
    const totaalExcl = parseBedrag(row['Totaal_excl._BTW'])
    const totaalIncl = parseBedrag(row.Totaal)
    const btwTotaal = Math.max(0, totaalIncl - totaalExcl)

    // Zoek relatie
    let relatie = null
    if (relatieNaam) {
      const relatieKey = normaliseer(relatieNaam)
      relatie = relatieByNorm.get(relatieKey)
    }

    // Zoek project
    let project = null

    // Strategie 1: Op project-referentie
    if (projectRef && projectRef.length > 3) {
      const refKey = normaliseer(projectRef)
      project = projectByNorm.get(refKey)

      if (!project && refKey.length > 5) {
        for (const [pKey, p] of projectByNorm) {
          if (pKey.length > 5 && (pKey.includes(refKey) || refKey.includes(pKey))) {
            project = p; break
          }
        }
      }

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

    // Strategie 2: Via relatie
    if (!project && relatie) {
      const rProjecten = projectenPerRelatie.get(relatie.id) || []
      if (rProjecten.length === 1) {
        project = rProjecten[0]
      } else if (rProjecten.length > 1) {
        if (projectRef) {
          const refKey = normaliseer(projectRef)
          project = rProjecten.find(p => {
            const pKey = normaliseer(p.naam)
            return pKey === refKey || (pKey.length > 4 && refKey.length > 4 && (pKey.includes(refKey) || refKey.includes(pKey)))
          })
        }
        if (!project) project = rProjecten[0]
      }
    }

    // Strategie 3: Nieuw project
    if (!project) {
      const projectNaam = projectRef || onderwerp || relatieNaam || `Factuur ${factuurnummer}`
      const nieuwKey = normaliseer(projectNaam)
      project = projectByNorm.get(nieuwKey)

      if (!project) {
        const { data: newProject, error } = await supabase
          .from('projecten')
          .insert({
            administratie_id: adminId,
            naam: projectNaam,
            status: 'afgerond',
            bron: 'import',
            relatie_id: relatie?.id || null,
            created_at: factuurdatum ? parseTimestamp(factuurdatum) : new Date().toISOString(),
          })
          .select('id, naam, relatie_id')
          .single()

        if (error) {
          console.error(`  Project fout "${projectNaam}": ${error.message}`)
          errors++
          continue
        }

        project = newProject
        projectByNorm.set(nieuwKey, project)
        projecten.push(project)
        if (project.relatie_id) {
          if (!projectenPerRelatie.has(project.relatie_id)) projectenPerRelatie.set(project.relatie_id, [])
          projectenPerRelatie.get(project.relatie_id).push(project)
        }
        projectAangemaakt++
      }
    } else {
      projectGematcht++
    }

    // Maak factuurrecord
    const status = mapStatus(fase)
    const factuurType = mapFactuurType(onderwerp)

    const { error: factError } = await supabase
      .from('facturen')
      .insert({
        administratie_id: adminId,
        relatie_id: relatie?.id || project.relatie_id || null,
        factuurnummer: factuurnummer,
        datum: factuurdatum ? parseDatum(factuurdatum) : new Date().toISOString().split('T')[0],
        vervaldatum: vervaldatum ? parseDatum(vervaldatum) : null,
        status: status,
        onderwerp: onderwerp || null,
        subtotaal: Math.round(totaalExcl * 100) / 100,
        btw_totaal: Math.round(btwTotaal * 100) / 100,
        totaal: Math.round(totaalIncl * 100) / 100,
        betaald_bedrag: status === 'betaald' ? Math.round(totaalIncl * 100) / 100 : 0,
        factuur_type: factuurType,
      })

    if (factError) {
      console.error(`  Factuur fout "${factuurnummer}": ${factError.message}`)
      errors++
    } else {
      factuurAangemaakt++
      if (status === 'betaald') totaalBetaald += Math.round(totaalIncl * 100) / 100
    }

    // Upload PDF (met gefixte bestandsnaam - geen brackets)
    const folderPath = folderByUUID.get(uuid)
    if (!folderPath) continue

    let pdfFiles
    try {
      pdfFiles = readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'))
    } catch { continue }
    if (pdfFiles.length === 0) continue

    for (const pdfFile of pdfFiles) {
      const filePath = join(folderPath, pdfFile)
      const stat = statSync(filePath)
      const buffer = readFileSync(filePath)

      const dashIdx = pdfFile.indexOf('-')
      const echteNaam = dashIdx > 0 ? pdfFile.substring(dashIdx + 1) : pdfFile
      // Verwijder ALLE speciale tekens inclusief [ en ]
      const safeName = echteNaam.replace(/[^a-zA-Z0-9._-]/g, '_')

      // Check duplicaat
      const isDuplicaat = [...bestaandePaths].some(p =>
        p.startsWith(`project-docs/${project.id}/`) && p.includes(safeName)
      )
      if (isDuplicaat) { pdfSkipped++; continue }

      const storagePath = `project-docs/${project.id}/${Date.now()}_${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('documenten')
        .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })

      if (uploadError) {
        console.error(`  Upload fout "${safeName}": ${uploadError.message}`)
        errors++
        continue
      }

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
        console.error(`  Doc fout: ${docError.message}`)
        errors++
        continue
      }

      bestaandePaths.add(storagePath)
      pdfUploaded++
    }
  }

  console.log('\n--- Resultaat ---')
  console.log('Factuurrecords aangemaakt:', factuurAangemaakt)
  console.log('Projecten gematcht:', projectGematcht)
  console.log('Projecten nieuw:', projectAangemaakt)
  console.log('PDFs geupload:', pdfUploaded)
  console.log('PDFs overgeslagen:', pdfSkipped)
  console.log('Fouten:', errors)
  console.log('\nTotaal betaald bedrag:', totaalBetaald.toFixed(2))

  // Controleer april 2026 omzet
  const { data: aprilFact } = await supabase
    .from('facturen')
    .select('totaal')
    .eq('administratie_id', adminId)
    .eq('status', 'betaald')
    .gte('datum', '2026-04-01')
    .lte('datum', '2026-04-30')

  const aprilOmzet = (aprilFact || []).reduce((s, f) => s + (f.totaal || 0), 0)
  console.log('April 2026 omzet (betaald):', aprilOmzet.toFixed(2))
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
