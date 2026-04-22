'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveBoeking } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Save, ArrowLeft, Plus, X } from 'lucide-react'

interface Regel {
  grootboekrekening_id: string
  debet: number
  credit: number
  omschrijving?: string
}

interface Rekening {
  id: string
  nummer: string
  naam: string
}

export function BoekingForm({ boeking, rekeningen }: {
  boeking: Record<string, unknown> | null
  rekeningen: Rekening[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isNew = !boeking

  const [regels, setRegels] = useState<Regel[]>(
    (boeking?.regels as Regel[]) || [
      { grootboekrekening_id: '', debet: 0, credit: 0 },
      { grootboekrekening_id: '', debet: 0, credit: 0 },
    ]
  )

  function addRegel() { setRegels([...regels, { grootboekrekening_id: '', debet: 0, credit: 0 }]) }
  function removeRegel(i: number) { setRegels(regels.filter((_, idx) => idx !== i)) }
  function updateRegel(i: number, field: keyof Regel, value: string | number) {
    const updated = [...regels]; updated[i] = { ...updated[i], [field]: value }; setRegels(updated)
  }

  const totaalDebet = regels.reduce((sum, r) => sum + (r.debet || 0), 0)
  const totaalCredit = regels.reduce((sum, r) => sum + (r.credit || 0), 0)
  const inBalans = Math.abs(totaalDebet - totaalCredit) < 0.01

  async function handleSubmit(formData: FormData) {
    if (!inBalans) { setError('Debet en credit moeten in balans zijn.'); return }
    setLoading(true); setError('')
    if (boeking) formData.set('id', boeking.id as string)
    formData.set('regels', JSON.stringify(regels))
    const result = await saveBoeking(formData)
    if (result.error) { setError(result.error); setLoading(false) }
    else router.push('/boekhouding')
  }

  return (
    <div>
      <PageHeader title={isNew ? 'Nieuwe boeking' : `Boeking ${boeking?.boekingsnummer}`} actions={<Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" />Terug</Button>} />
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}
      <form action={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input id="boekingsnummer" name="boekingsnummer" label="Boekingsnummer *" defaultValue={(boeking?.boekingsnummer as string) || ''} required />
              <Input id="datum" name="datum" label="Datum *" type="date" defaultValue={(boeking?.datum as string) || new Date().toISOString().split('T')[0]} required />
              <Input id="omschrijving" name="omschrijving" label="Omschrijving *" defaultValue={(boeking?.omschrijving as string) || ''} required />
            </div>
          </CardContent>
        </Card>
        <Card>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Boekingsregels</h3>
            <Button type="button" variant="secondary" size="sm" onClick={addRegel}><Plus className="h-3 w-3" />Regel toevoegen</Button>
          </div>
          <CardContent>
            <div className="space-y-3">
              {regels.map((regel, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <select className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.grootboekrekening_id} onChange={(e) => updateRegel(i, 'grootboekrekening_id', e.target.value)} required>
                      <option value="">Selecteer rekening...</option>
                      {rekeningen.map(r => <option key={r.id} value={r.id}>{r.nummer} - {r.naam}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3"><input type="number" step="0.01" placeholder="Debet" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.debet || ''} onChange={(e) => updateRegel(i, 'debet', parseFloat(e.target.value) || 0)} /></div>
                  <div className="col-span-3"><input type="number" step="0.01" placeholder="Credit" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.credit || ''} onChange={(e) => updateRegel(i, 'credit', parseFloat(e.target.value) || 0)} /></div>
                  <div className="col-span-1"><button type="button" onClick={() => removeRegel(i)} className="p-1 text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button></div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between"><span>Totaal debet:</span><span>{formatCurrency(totaalDebet)}</span></div>
                <div className="flex justify-between"><span>Totaal credit:</span><span>{formatCurrency(totaalCredit)}</span></div>
                <div className={`flex justify-between font-bold border-t pt-1 ${inBalans ? 'text-green-600' : 'text-red-600'}`}>
                  <span>Verschil:</span><span>{formatCurrency(totaalDebet - totaalCredit)}</span>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button type="submit" disabled={loading || !inBalans}><Save className="h-4 w-4" />{loading ? 'Opslaan...' : 'Opslaan'}</Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
