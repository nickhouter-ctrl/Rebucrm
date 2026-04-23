import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

// Merge Jurrien Steunebrink (dup) naar J. Steunebrink montage (master)
const { data: rels } = await sb.from('relaties').select('id, bedrijfsnaam, email, telefoon, contactpersoon, adres, postcode, plaats').eq('administratie_id', admin.id).ilike('bedrijfsnaam', '%steunebrink%')
const master = rels.find(r => /j\. steunebrink montage/i.test(r.bedrijfsnaam)) || rels[0]
console.log('Master:', master.bedrijfsnaam, master.id)

for (const r of rels) {
  if (r.id === master.id) continue
  console.log(`Merging "${r.bedrijfsnaam}" (${r.id}) → master`)
  const tbls = [
    { table: 'offertes', col: 'relatie_id' },
    { table: 'projecten', col: 'relatie_id' },
    { table: 'facturen', col: 'relatie_id' },
    { table: 'orders', col: 'relatie_id' },
    { table: 'taken', col: 'relatie_id' },
    { table: 'notities', col: 'relatie_id' },
    { table: 'emails', col: 'relatie_id' },
    { table: 'berichten', col: 'relatie_id' },
    { table: 'contactpersonen', col: 'relatie_id' },
  ]
  for (const { table, col } of tbls) {
    await sb.from(table).update({ [col]: master.id }).eq(col, r.id)
  }
  await sb.from('klant_relaties').delete().eq('relatie_id', r.id)
  const { error } = await sb.from('relaties').delete().eq('id', r.id)
  if (error) console.error('Delete fout:', error.message)
}
console.log('Klaar')
