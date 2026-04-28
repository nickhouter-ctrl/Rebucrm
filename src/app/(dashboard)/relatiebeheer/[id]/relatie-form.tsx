'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect, useCallback } from 'react'
import { saveRelatie, deleteRelatie } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Save, Trash2, ArrowLeft, Search, Building2, Loader2, MapPin } from 'lucide-react'

interface RelatieData {
  id: string
  bedrijfsnaam: string
  type: string
  contactpersoon: string | null
  email: string | null
  telefoon: string | null
  adres: string | null
  postcode: string | null
  plaats: string | null
  kvk_nummer: string | null
  btw_nummer: string | null
  iban: string | null
  opmerkingen: string | null
  standaard_marge: number | null
}

interface KvkResult {
  kvkNummer: string
  naam: string
  adres: string
  postcode: string
  plaats: string
  type: string
}

export function RelatieForm({ relatie }: { relatie: RelatieData | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isNew = !relatie

  // KVK search state
  const [kvkQuery, setKvkQuery] = useState('')
  const [kvkResults, setKvkResults] = useState<KvkResult[]>([])
  const [kvkSearching, setKvkSearching] = useState(false)
  const [kvkError, setKvkError] = useState('')
  const [showKvkDropdown, setShowKvkDropdown] = useState(false)
  const kvkRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Form field refs for auto-fill
  const bedrijfsnaamRef = useRef<HTMLInputElement>(null)
  const adresRef = useRef<HTMLInputElement>(null)
  const postcodeRef = useRef<HTMLInputElement>(null)
  const plaatsRef = useRef<HTMLInputElement>(null)
  const kvkNummerRef = useRef<HTMLInputElement>(null)
  const typeRef = useRef<HTMLSelectElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const telefoonRef = useRef<HTMLInputElement>(null)
  const websiteRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (kvkRef.current && !kvkRef.current.contains(e.target as Node)) {
        setShowKvkDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const searchKvk = useCallback(async (q: string) => {
    if (q.length < 2) {
      setKvkResults([])
      setShowKvkDropdown(false)
      return
    }

    setKvkSearching(true)
    setKvkError('')
    try {
      const res = await fetch(`/api/kvk/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (data.error) {
        setKvkError(data.error)
        setKvkResults([])
        setShowKvkDropdown(false)
      } else {
        setKvkResults(data.results || [])
        setShowKvkDropdown((data.results || []).length > 0)
      }
    } catch {
      setKvkResults([])
    } finally {
      setKvkSearching(false)
    }
  }, [])

  function handleKvkInput(value: string) {
    setKvkQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchKvk(value), 300)
  }

  async function selectKvkResult(baseResult: KvkResult) {
    setShowKvkDropdown(false)
    // Verrijk via /api/kvk/detail voor email/telefoon/website/huisnummer
    let result = baseResult
    try {
      const res = await fetch(`/api/kvk/detail?kvkNummer=${encodeURIComponent(baseResult.kvkNummer)}`)
      if (res.ok) {
        const detail = await res.json() as Partial<KvkResult>
        result = { ...baseResult, ...detail }
      }
    } catch {}

    if (bedrijfsnaamRef.current) {
      bedrijfsnaamRef.current.value = result.naam
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(bedrijfsnaamRef.current, result.naam)
        bedrijfsnaamRef.current.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    if (adresRef.current) adresRef.current.value = result.adres
    if (postcodeRef.current) postcodeRef.current.value = result.postcode
    if (plaatsRef.current) plaatsRef.current.value = result.plaats
    if (kvkNummerRef.current) kvkNummerRef.current.value = result.kvkNummer
    if (typeRef.current) typeRef.current.value = 'zakelijk'
    if (emailRef.current && (result as { email?: string }).email) emailRef.current.value = (result as { email?: string }).email as string
    if (telefoonRef.current && (result as { telefoon?: string }).telefoon) telefoonRef.current.value = (result as { telefoon?: string }).telefoon as string
    if (websiteRef.current && (result as { website?: string }).website) websiteRef.current.value = (result as { website?: string }).website as string

    setKvkQuery(result.naam)
    setShowKvkDropdown(false)
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')

    // Client-side validatie van email + telefoon — voorkomt typo's die later
    // bouncen en bespaart een server-roundtrip.
    const fouten: string[] = []
    const emailRaw = (formData.get('email') as string || '').trim()
    const factuurEmailRaw = (formData.get('factuur_email') as string || '').trim()
    const telefoonRaw = (formData.get('telefoon') as string || '').trim()
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
    if (emailRaw && !emailRe.test(emailRaw)) fouten.push('E-mailadres lijkt ongeldig')
    if (factuurEmailRaw && !emailRe.test(factuurEmailRaw)) fouten.push('Factuur-e-mail lijkt ongeldig')
    if (telefoonRaw) {
      // NL telefoon: 06/0X gevolgd door min 8 cijfers, of +31 prefix.
      // Spaties / streepjes / haakjes negeren.
      const cijfers = telefoonRaw.replace(/[\s\-().]/g, '')
      const nlRe = /^(\+31|0031|0)[1-9]\d{8}$/
      const intRe = /^\+\d{8,15}$/
      if (!nlRe.test(cijfers) && !intRe.test(cijfers)) fouten.push('Telefoonnummer lijkt ongeldig')
    }
    if (fouten.length > 0) {
      setError(fouten.join(' • '))
      setLoading(false)
      return
    }

    if (relatie) formData.set('id', relatie.id)
    const result = await saveRelatie(formData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      router.push(`/relatiebeheer/${result.id}`)
    }
  }

  async function handleDelete() {
    if (!relatie || !confirm('Weet u zeker dat u deze relatie wilt verwijderen?')) return
    const result = await deleteRelatie(relatie.id)
    if (result.error) {
      setError(result.error)
    } else {
      router.push('/relatiebeheer')
    }
  }

  return (
    <div>
      <PageHeader
        title={isNew ? 'Nieuwe relatie' : 'Relatie bewerken'}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
              Terug
          </Button>
        }
      />

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>
      )}

      {/* KVK Zoeken - alleen bij nieuwe relatie */}
      {isNew && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">KVK Zoeken</h3>
              <span className="text-xs text-gray-400">— Zoek op bedrijfsnaam en vul gegevens automatisch in</span>
            </div>
            <div className="relative" ref={kvkRef}>
              <div className="relative">
                <input
                  type="text"
                  value={kvkQuery}
                  onChange={(e) => handleKvkInput(e.target.value)}
                  placeholder="Zoek op bedrijfsnaam of KVK-nummer..."
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-gray-50"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                {kvkSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
                )}
              </div>

              {showKvkDropdown && kvkResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
                  {kvkResults.map((r, i) => (
                    <button
                      key={`${r.kvkNummer}-${i}`}
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                      onClick={() => selectKvkResult(r)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{r.naam}</p>
                          {(r.adres || r.plaats) && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
                              <p className="text-xs text-gray-500 truncate">
                                {[r.adres, r.postcode, r.plaats].filter(Boolean).join(', ')}
                              </p>
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-mono text-gray-400 flex-shrink-0">
                          KVK {r.kvkNummer}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showKvkDropdown && kvkResults.length === 0 && !kvkSearching && kvkQuery.length >= 2 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center">
                  <p className="text-sm text-gray-500">Geen resultaten gevonden</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <form action={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input ref={bedrijfsnaamRef} id="bedrijfsnaam" name="bedrijfsnaam" label="Bedrijfsnaam *" defaultValue={relatie?.bedrijfsnaam || ''} required />
              <Select
                ref={typeRef}
                id="type"
                name="type"
                label="Type *"
                defaultValue={relatie?.type || 'particulier'}
                options={[
                  { value: 'particulier', label: 'Particulier' },
                  { value: 'zakelijk', label: 'Zakelijk' },
                ]}
              />
              <Input id="contactpersoon" name="contactpersoon" label="Contactpersoon" defaultValue={relatie?.contactpersoon || ''} />
              <Input ref={emailRef} id="email" name="email" label="E-mail" type="email" defaultValue={relatie?.email || ''} />
              <Input id="factuur_email" name="factuur_email" label="Factuur-e-mail (optioneel)" type="email" defaultValue={(relatie as Record<string, unknown> | undefined)?.factuur_email as string || ''} placeholder="Leeg = algemene e-mail gebruiken" />
              <Input ref={telefoonRef} id="telefoon" name="telefoon" label="Telefoon" defaultValue={relatie?.telefoon || ''} />
              <Input ref={adresRef} id="adres" name="adres" label="Adres" defaultValue={relatie?.adres || ''} />
              <Input ref={postcodeRef} id="postcode" name="postcode" label="Postcode" defaultValue={relatie?.postcode || ''} />
              <Input ref={plaatsRef} id="plaats" name="plaats" label="Plaats" defaultValue={relatie?.plaats || ''} />
              <Input ref={kvkNummerRef} id="kvk_nummer" name="kvk_nummer" label="KVK-nummer" defaultValue={relatie?.kvk_nummer || ''} />
              <Input id="btw_nummer" name="btw_nummer" label="BTW-nummer" defaultValue={relatie?.btw_nummer || ''} />
              <Input id="iban" name="iban" label="IBAN" defaultValue={relatie?.iban || ''} />
            </div>
            <div>
              <label htmlFor="opmerkingen" className="block text-sm font-medium text-gray-700 mb-1">Opmerkingen</label>
              <textarea
                id="opmerkingen"
                name="opmerkingen"
                rows={3}
                defaultValue={relatie?.opmerkingen || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div>
              {!isNew && (
                <Button type="button" variant="danger" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" />
                  Verwijderen
                </Button>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              <Save className="h-4 w-4" />
              {loading ? 'Opslaan...' : 'Opslaan'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
