import { getArchiefOffertes, getArchiefFacturen, getArchiefVerkoopkansen, autoArchiveerAfgerondeVerkoopkansen } from '@/lib/actions'
import { ArchiefView } from './archief-view'

export const revalidate = 30

export default async function ArchiefPage() {
  // Probeer nog niet-gearchiveerde afgeronde verkoopkansen alsnog op te ruimen
  // voor we de lijst tonen.
  try { await autoArchiveerAfgerondeVerkoopkansen() } catch { /* ignore */ }
  const [offertes, facturen, verkoopkansen] = await Promise.all([
    getArchiefOffertes(),
    getArchiefFacturen(),
    getArchiefVerkoopkansen(),
  ])
  return <ArchiefView
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    offertes={offertes as any}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    facturen={facturen as any}
    verkoopkansen={verkoopkansen}
  />
}
