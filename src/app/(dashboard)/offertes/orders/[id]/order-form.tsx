'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveOrder, deleteOrder, saveOrderMedewerker, deleteOrderMedewerker } from '@/lib/actions'
import { useBackNav } from '@/lib/hooks/use-back-nav'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDateShort, handleNumberPaste } from '@/lib/utils'
import { Save, Trash2, ArrowLeft, Plus, X, UserPlus, Receipt, AlertTriangle, CheckCircle, Clock, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Regel {
  omschrijving: string
  aantal: number
  prijs: number
  btw_percentage: number
  product_id?: string
}

interface OrderMedewerkerRow {
  id: string
  rol: string | null
  gepland_van: string | null
  gepland_tot: string | null
  geschatte_uren: number | null
  medewerker: { id: string; naam: string; type: string; functie: string | null; kleur: string | null } | null
}

interface OrderFactuurRow {
  id: string
  factuurnummer: string
  datum: string
  status: string
  totaal: number
  betaald_bedrag: number
  factuur_type: string | null
  onderwerp: string | null
  gerelateerde_factuur_id: string | null
}

export function OrderForm({ order, relaties, producten, medewerkers, orderMedewerkers: initialOrderMedewerkers, orderFacturen }: {
  order: Record<string, unknown> | null
  relaties: { id: string; bedrijfsnaam: string }[]
  producten: { id: string; naam: string; prijs: number; btw_percentage: number }[]
  medewerkers: { id: string; naam: string; type: string; functie: string | null; actief: boolean }[]
  orderMedewerkers: OrderMedewerkerRow[]
  orderFacturen: OrderFactuurRow[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isNew = !order
  const [orderMedewerkers, setOrderMedewerkers] = useState(initialOrderMedewerkers)
  const [medDialogOpen, setMedDialogOpen] = useState(false)
  const [medSaving, setMedSaving] = useState(false)
  const { navigateBack } = useBackNav(`order-${(order?.id as string) || 'nieuw'}`)

  const [regels, setRegels] = useState<Regel[]>(
    (order?.regels as Regel[]) || [{ omschrijving: '', aantal: 1, prijs: 0, btw_percentage: 21 }]
  )

  function addRegel() {
    setRegels([...regels, { omschrijving: '', aantal: 1, prijs: 0, btw_percentage: 21 }])
  }
  function removeRegel(index: number) {
    setRegels(regels.filter((_, i) => i !== index))
  }
  function updateRegel(index: number, field: keyof Regel, value: string | number) {
    const updated = [...regels]
    updated[index] = { ...updated[index], [field]: value }
    setRegels(updated)
  }
  function selectProduct(index: number, productId: string) {
    const product = producten.find(p => p.id === productId)
    if (product) {
      const updated = [...regels]
      updated[index] = { ...updated[index], product_id: productId, omschrijving: product.naam, prijs: product.prijs, btw_percentage: product.btw_percentage }
      setRegels(updated)
    }
  }

  const subtotaal = regels.reduce((sum, r) => sum + r.aantal * r.prijs, 0)
  const btwTotaal = regels.reduce((sum, r) => sum + (r.aantal * r.prijs * r.btw_percentage) / 100, 0)
  const totaal = subtotaal + btwTotaal

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')
    if (order) formData.set('id', order.id as string)
    formData.set('regels', JSON.stringify(regels))
    const result = await saveOrder(formData)
    if (result.error) { setError(result.error); setLoading(false) }
    else navigateBack('/offertes/orders')
  }

  async function handleDelete() {
    if (!order || !confirm('Weet u zeker dat u deze order wilt verwijderen?')) return
    const result = await deleteOrder(order.id as string)
    if (result.error) setError(result.error)
    else navigateBack('/offertes/orders')
  }

  async function handleAddMedewerker(formData: FormData) {
    if (!order) return
    setMedSaving(true)
    formData.set('order_id', order.id as string)
    const result = await saveOrderMedewerker(formData)
    if (result.error) { setError(result.error); setMedSaving(false); return }
    setMedDialogOpen(false)
    setMedSaving(false)
    router.refresh()
  }

  async function handleRemoveMedewerker(id: string) {
    if (!confirm('Toewijzing verwijderen?')) return
    const result = await deleteOrderMedewerker(id)
    if (result.error) setError(result.error)
    else router.refresh()
  }

  return (
    <div>
      <PageHeader
        title={isNew ? 'Nieuwe order' : `Order ${order?.ordernummer}`}
        actions={<Button variant="ghost" onClick={() => router.push('/offertes/orders')}><ArrowLeft className="h-4 w-4" />Terug</Button>}
      />
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}
      <form action={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input id="ordernummer" name="ordernummer" label="Ordernummer *" defaultValue={(order?.ordernummer as string) || ''} required />
              <Input id="datum" name="datum" label="Datum *" type="date" defaultValue={(order?.datum as string) || new Date().toISOString().split('T')[0]} required />
              <Input id="leverdatum" name="leverdatum" label="Leverdatum" type="date" defaultValue={(order?.leverdatum as string) || ''} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select id="relatie_id" name="relatie_id" label="Relatie" defaultValue={(order?.relatie_id as string) || ''} placeholder="Selecteer relatie..." options={relaties.map(r => ({ value: r.id, label: r.bedrijfsnaam }))} />
              <Select id="status" name="status" label="Status" defaultValue={(order?.status as string) || 'nieuw'} options={[
                { value: 'nieuw', label: 'Nieuw' }, { value: 'in_behandeling', label: 'In behandeling' },
                { value: 'geleverd', label: 'Geleverd' }, { value: 'gefactureerd', label: 'Gefactureerd' }, { value: 'geannuleerd', label: 'Geannuleerd' },
              ]} />
            </div>
            <Input id="onderwerp" name="onderwerp" label="Onderwerp" defaultValue={(order?.onderwerp as string) || ''} />
          </CardContent>
        </Card>

        <Card>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Regelitems</h3>
            <Button type="button" variant="secondary" size="sm" onClick={addRegel}><Plus className="h-3 w-3" />Regel toevoegen</Button>
          </div>
          <CardContent>
            <div className="space-y-3">
              {regels.map((regel, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-1">
                    <select className="w-full px-2 py-2 border border-gray-300 rounded-md text-xs" value={regel.product_id || ''} onChange={(e) => selectProduct(i, e.target.value)}>
                      <option value="">--</option>
                      {producten.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4"><input placeholder="Omschrijving" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.omschrijving} onChange={(e) => updateRegel(i, 'omschrijving', e.target.value)} required /></div>
                  <div className="col-span-2"><input type="number" step="0.01" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.aantal} onChange={(e) => updateRegel(i, 'aantal', parseFloat(e.target.value) || 0)} onPaste={(e) => handleNumberPaste(e, (v) => updateRegel(i, 'aantal', parseFloat(v) || 0))} /></div>
                  <div className="col-span-2"><input type="number" step="0.01" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.prijs} onChange={(e) => updateRegel(i, 'prijs', parseFloat(e.target.value) || 0)} onPaste={(e) => handleNumberPaste(e, (v) => updateRegel(i, 'prijs', parseFloat(v) || 0))} /></div>
                  <div className="col-span-1"><select className="w-full px-2 py-2 border border-gray-300 rounded-md text-xs" value={regel.btw_percentage} onChange={(e) => updateRegel(i, 'btw_percentage', parseInt(e.target.value))}><option value={0}>0%</option><option value={9}>9%</option><option value={21}>21%</option></select></div>
                  <div className="col-span-1 text-right text-sm font-medium">{formatCurrency(regel.aantal * regel.prijs)}</div>
                  <div className="col-span-1"><button type="button" onClick={() => removeRegel(i)} className="p-1 text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button></div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotaal:</span><span>{formatCurrency(subtotaal)}</span></div>
                <div className="flex justify-between"><span>BTW:</span><span>{formatCurrency(btwTotaal)}</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-1"><span>Totaal:</span><span>{formatCurrency(totaal)}</span></div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div>{!isNew && <Button type="button" variant="danger" onClick={handleDelete}><Trash2 className="h-4 w-4" />Verwijderen</Button>}</div>
            <Button type="submit" disabled={loading}><Save className="h-4 w-4" />{loading ? 'Opslaan...' : 'Opslaan'}</Button>
          </CardFooter>
        </Card>
      </form>

      {/* Medewerkers toewijzing - buiten form zodat het eigen form actions heeft */}
      {!isNew && (
        <Card className="mt-4">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Medewerkers</h3>
            <Button type="button" variant="secondary" size="sm" onClick={() => setMedDialogOpen(true)}>
              <UserPlus className="h-3 w-3" />
              Medewerker toewijzen
            </Button>
          </div>
          <CardContent>
            {orderMedewerkers.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nog geen medewerkers toegewezen</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {orderMedewerkers.map(om => (
                  <div key={om.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: om.medewerker?.kleur || '#3b82f6' }} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{om.medewerker?.naam}</span>
                          <Badge status={om.medewerker?.type || ''} />
                          {om.rol && <span className="text-xs text-gray-500">({om.rol})</span>}
                        </div>
                        {(om.gepland_van || om.gepland_tot) && (
                          <p className="text-xs text-gray-400">
                            {om.gepland_van || '?'} — {om.gepland_tot || '?'}
                            {om.geschatte_uren && ` · ${om.geschatte_uren}u`}
                          </p>
                        )}
                      </div>
                    </div>
                    <button type="button" onClick={() => handleRemoveMedewerker(om.id)} className="p-1 text-gray-400 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Facturatie overzicht */}
      {!isNew && orderFacturen.length > 0 && (
        <Card className="mt-4">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Facturatie
            </h3>
          </div>
          <CardContent>
            <div className="divide-y divide-gray-100">
              {orderFacturen.map(factuur => {
                const isRestbetaling = factuur.factuur_type === 'restbetaling'
                const isVerstuurd = factuur.status !== 'concept'
                const isBetaald = factuur.status === 'betaald'
                const orderGeleverd = (order?.status as string) === 'geleverd' || (order?.status as string) === 'gefactureerd'

                return (
                  <div key={factuur.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{factuur.factuurnummer}</span>
                            {factuur.factuur_type === 'aanbetaling' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                                Aanbetaling
                              </span>
                            )}
                            {factuur.factuur_type === 'restbetaling' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">
                                Restbetaling
                              </span>
                            )}
                            <Badge status={factuur.status} />
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatCurrency(factuur.totaal)}
                            {factuur.betaald_bedrag > 0 && ` · ${formatCurrency(factuur.betaald_bedrag)} betaald`}
                          </p>
                          {/* Waarschuwing: restbetaling nog niet verstuurd maar order wel geleverd */}
                          {isRestbetaling && !isVerstuurd && orderGeleverd && (
                            <p className="text-xs text-orange-600 flex items-center gap-1 mt-1">
                              <AlertTriangle className="h-3 w-3" />
                              Order geleverd — restbetaling kan verstuurd worden
                            </p>
                          )}
                          {/* Info: restbetaling wacht op levering */}
                          {isRestbetaling && !isVerstuurd && !orderGeleverd && (
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                              <Clock className="h-3 w-3" />
                              Versturen na aflevering
                            </p>
                          )}
                          {isBetaald && (
                            <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                              <CheckCircle className="h-3 w-3" />
                              Betaald
                            </p>
                          )}
                        </div>
                      </div>
                      <Link href={`/facturatie/${factuur.id}`}>
                        <Button variant="secondary" size="sm">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Medewerker toewijzen dialog */}
      <Dialog open={medDialogOpen} onClose={() => setMedDialogOpen(false)} title="Medewerker toewijzen">
        <form action={handleAddMedewerker}>
          <div className="space-y-4">
            <Select
              id="med_medewerker_id"
              name="medewerker_id"
              label="Medewerker *"
              placeholder="Selecteer..."
              options={medewerkers.filter(m => m.actief).map(m => ({ value: m.id, label: `${m.naam} (${m.type})` }))}
              required
            />
            <Input id="med_rol" name="rol" label="Rol" placeholder="bijv. Hoofdmonteur" />
            <div className="grid grid-cols-2 gap-4">
              <Input id="med_gepland_van" name="gepland_van" label="Gepland van" type="date" />
              <Input id="med_gepland_tot" name="gepland_tot" label="Gepland tot" type="date" />
            </div>
            <Input id="med_geschatte_uren" name="geschatte_uren" label="Geschatte uren" type="number" step="0.5" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setMedDialogOpen(false)}>Annuleren</Button>
              <Button type="submit" disabled={medSaving}>{medSaving ? 'Opslaan...' : 'Toewijzen'}</Button>
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
