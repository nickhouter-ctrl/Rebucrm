import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const SOURCE = '/Users/houterminiopslag/Downloads/7ecbf974-e396-4f91-a35c-6e0e7e7b173e'
const csv = readFileSync(join(SOURCE, 'Facturen.csv'), 'utf8').replace(/^\uFEFF/, '')
const lines = csv.split('\n').filter(l => l.trim()).slice(1)
const csvUUIDs = new Set()
for (const line of lines) {
  const uuid = line.split(';')[0].replace(/^"|"$/g, '')
  if (uuid) csvUUIDs.add(uuid)
}

const folders = readdirSync(SOURCE).filter(f => {
  try { return statSync(join(SOURCE, f)).isDirectory() } catch { return false }
})

let folderWithPDF = 0, folderNoPDF = 0, folderNoCSV = 0
for (const f of folders) {
  const uuid = f.substring(0, 36)
  const pdfs = readdirSync(join(SOURCE, f)).filter(x => x.toLowerCase().endsWith('.pdf'))
  if (pdfs.length > 0) folderWithPDF++
  else folderNoPDF++
  if (!csvUUIDs.has(uuid)) folderNoCSV++
}

console.log('Folders met PDF:', folderWithPDF)
console.log('Folders zonder PDF:', folderNoPDF)
console.log('Folders niet in CSV:', folderNoCSV)
console.log('CSV rijen:', csvUUIDs.size)
console.log('Totaal folders:', folders.length)
