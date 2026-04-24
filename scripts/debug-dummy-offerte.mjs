import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()

const { data: offerte } = await sb.from('offertes').select('*, relatie:relaties(bedrijfsnaam)').eq('id', '0d3dfb1d-b49f-4723-a016-46d8f68c73dd').single()
console.log('Offerte 0d3dfb1d-...:', offerte)

const { data: offerte2 } = await sb.from('offertes').select('*, relatie:relaties(bedrijfsnaam)').eq('id', 'c116582f-4459-4411-9173-7cb409b687bd').single()
console.log('\nOfferte c116582f-...:', offerte2)

// Hoeveel facturen hangen aan die ene offerte?
const { count } = await sb.from('facturen').select('*', { count: 'exact', head: true }).eq('offerte_id', '0d3dfb1d-b49f-4723-a016-46d8f68c73dd')
console.log(`\nFacturen gekoppeld aan 0d3dfb1d: ${count}`)

const { count: c2 } = await sb.from('facturen').select('*', { count: 'exact', head: true }).eq('offerte_id', 'c116582f-4459-4411-9173-7cb409b687bd')
console.log(`Facturen gekoppeld aan c116582f: ${c2}`)
