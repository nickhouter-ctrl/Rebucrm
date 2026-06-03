// Afwijkende factuurgegevens per verkoopkans (project).
//
// Een factuur hangt via offerte_id (en/of order_id → order.offerte) aan een
// verkoopkans. Heeft die verkoopkans `factuur_afwijkend = true`, dan gebruiken
// we het ingevulde factuuradres/e-mail i.p.v. de relatie. Per veld vallen lege
// waarden terug op de relatie. Zo werkt het overal (PDF + mail) automatisch.

const OVERRIDE_FIELDS =
  'factuur_afwijkend, factuur_bedrijfsnaam, factuur_contactpersoon, factuur_adres, factuur_postcode, factuur_plaats, factuur_email, factuur_btw_nummer, factuur_kvk_nummer'

// Embed-fragment voor de Supabase-select op `facturen`. Haalt de override op
// via de offerte (factuur.offerte_id) én via de order (factuur.order_id →
// order.offerte) zodat zowel offerte- als handmatige order-facturen werken.
// LET OP: dit fragment definieert de `offerte:`-alias zelf (incl. offertenummer),
// dus vervang een bestaande `offerte:offertes(...)` in de select hierdoor i.p.v.
// te dupliceren.
export const FACTUUR_OVERRIDE_EMBED =
  `offerte:offertes(offertenummer, project:projecten(${OVERRIDE_FIELDS})), order:orders(offerte:offertes(project:projecten(${OVERRIDE_FIELDS})))`

type Override = {
  factuur_afwijkend?: boolean | null
  factuur_bedrijfsnaam?: string | null
  factuur_contactpersoon?: string | null
  factuur_adres?: string | null
  factuur_postcode?: string | null
  factuur_plaats?: string | null
  factuur_email?: string | null
  factuur_btw_nummer?: string | null
  factuur_kvk_nummer?: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function pakOverride(factuur: any): Override | null {
  const p = factuur?.offerte?.project ?? factuur?.order?.offerte?.project ?? null
  if (p && p.factuur_afwijkend) return p as Override
  return null
}

const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s || null
}

// Geeft de effectieve relatie-achtige factuurgegevens terug: de override van de
// verkoopkans waar ingevuld, anders de relatie. Behoudt overige relatievelden.
export function effectieveFactuurRelatie(factuur: any): any {
  const relatie = factuur?.relatie ?? null
  const o = pakOverride(factuur)
  if (!o) return relatie
  return {
    ...(relatie || {}),
    bedrijfsnaam: clean(o.factuur_bedrijfsnaam) || relatie?.bedrijfsnaam || '',
    contactpersoon: clean(o.factuur_contactpersoon) ?? relatie?.contactpersoon ?? null,
    adres: clean(o.factuur_adres) ?? relatie?.adres ?? null,
    postcode: clean(o.factuur_postcode) ?? relatie?.postcode ?? null,
    plaats: clean(o.factuur_plaats) ?? relatie?.plaats ?? null,
    btw_nummer: clean(o.factuur_btw_nummer) ?? relatie?.btw_nummer ?? null,
    kvk_nummer: clean(o.factuur_kvk_nummer) ?? relatie?.kvk_nummer ?? null,
    email: clean(o.factuur_email) || relatie?.email || null,
    factuur_email: clean(o.factuur_email) || relatie?.factuur_email || null,
  }
}

// Muteert een opgehaalde factuur: vervangt `relatie` door de effectieve
// (override-)relatie. Retourneert hetzelfde object voor gemak. No-op zonder
// override of zonder factuur.
export function pasFactuurAdresToe<T extends Record<string, any> | null | undefined>(factuur: T): T {
  if (!factuur) return factuur
  ;(factuur as any).relatie = effectieveFactuurRelatie(factuur)
  return factuur
}
