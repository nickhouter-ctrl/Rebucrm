import { createSupabaseAdmin } from './db.mjs'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'

const SOURCE_DIR = '/Users/houterminiopslag/Downloads/6bf80a50-3327-407c-8a36-6876a67d2ea4'

async function main() {
  const supabase = await createSupabaseAdmin()

  // 1. Haal administratie_id op
  const { data: admin } = await supabase
    .from('administraties')
    .select('id')
    .ilike('naam', '%Rebu%')
    .limit(1)
    .single()

  if (!admin) { console.error('Geen administratie gevonden'); process.exit(1) }
  const adminId = admin.id
  console.log('Administratie:', adminId)

  // 2. Haal bestaande projecten op
  const { data: bestaandeProjecten } = await supabase
    .from('projecten')
    .select('id, naam')
    .eq('administratie_id', adminId)

  // Maak een map van genormaliseerde naam → project
  const projectMap = new Map()
  for (const p of bestaandeProjecten || []) {
    projectMap.set(normaliseer(p.naam), p)
  }
  console.log(`${projectMap.size} bestaande projecten gevonden`)

  // 3. Loop alle folders door
  const folders = readdirSync(SOURCE_DIR).filter(f => {
    const fullPath = join(SOURCE_DIR, f)
    return statSync(fullPath).isDirectory()
  })
  console.log(`${folders.length} folders te verwerken`)

  let aangemaakt = 0
  let gekoppeld = 0
  let geupload = 0
  let errors = 0

  for (const folder of folders) {
    const folderPath = join(SOURCE_DIR, folder)

    // Parse naam uit foldernaam: uuid-naam_met_underscores
    const dashIndex = folder.indexOf('-')
    const rawName = dashIndex > 0 ? folder.substring(dashIndex + 1) : folder
    const projectNaam = rawName.replace(/_/g, ' ').trim() || '(naamloos)'

    // Match met bestaand project
    const genormaliseerd = normaliseer(projectNaam)
    let project = projectMap.get(genormaliseerd)

    if (!project) {
      // Maak nieuw project aan
      const { data: newProject, error } = await supabase
        .from('projecten')
        .insert({
          administratie_id: adminId,
          naam: projectNaam,
          status: 'actief',
          bron: 'import',
        })
        .select('id, naam')
        .single()

      if (error) {
        console.error(`  FOUT project "${projectNaam}": ${error.message}`)
        errors++
        continue
      }
      project = newProject
      projectMap.set(genormaliseerd, project)
      aangemaakt++
    } else {
      gekoppeld++
    }

    // 4. Upload PDFs uit de folder
    const files = readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'))

    for (const file of files) {
      const filePath = join(folderPath, file)
      const stat = statSync(filePath)
      const buffer = readFileSync(filePath)

      // Parse echte bestandsnaam (uuid-filename.pdf)
      const fileDashIndex = file.indexOf('-')
      const echteNaam = fileDashIndex > 0 ? file.substring(fileDashIndex + 1) : file

      const storagePath = `project-docs/${project.id}/${Date.now()}_${echteNaam.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      const { error: uploadError } = await supabase.storage
        .from('documenten')
        .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })

      if (uploadError) {
        console.error(`  FOUT upload "${echteNaam}": ${uploadError.message}`)
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
        console.error(`  FOUT doc "${echteNaam}": ${docError.message}`)
        errors++
        continue
      }

      geupload++
    }
  }

  console.log('\n--- Klaar ---')
  console.log(`Projecten aangemaakt: ${aangemaakt}`)
  console.log(`Projecten gekoppeld (bestaand): ${gekoppeld}`)
  console.log(`Documenten geupload: ${geupload}`)
  console.log(`Fouten: ${errors}`)
}

function normaliseer(naam) {
  return naam.toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
