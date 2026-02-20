'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getDeliveryEmailDefaults, planDelivery } from '@/lib/actions'
import { Send, Loader2, Mail, CalendarDays } from 'lucide-react'
import { getISOWeek, startOfISOWeek, addWeeks, addDays, format } from 'date-fns'
import { nl } from 'date-fns/locale'

interface TePlannenOrder {
  id: string
  ordernummer: string
  relatie_bedrijfsnaam: string
  relatie_contactpersoon: string | null
  relatie_email: string | null
  onderwerp: string | null
}

const DAGEN = [
  { value: '1', label: 'Maandag' },
  { value: '2', label: 'Dinsdag' },
  { value: '3', label: 'Woensdag' },
  { value: '4', label: 'Donderdag' },
  { value: '5', label: 'Vrijdag' },
]

export function DeliveryPlanningDialog({ open, onClose, order }: {
  open: boolean
  onClose: () => void
  order: TePlannenOrder
}) {
  const [week, setWeek] = useState('')
  const [dag, setDag] = useState('')
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [klantNaam, setKlantNaam] = useState('')

  const weekOptions = useMemo(() => {
    const now = new Date()
    const options: { value: string; label: string }[] = []
    for (let i = 0; i < 26; i++) {
      const weekStart = startOfISOWeek(addWeeks(now, i))
      const weekEnd = addDays(weekStart, 4)
      const weekNum = getISOWeek(weekStart)
      const year = weekStart.getFullYear()
      options.push({
        value: `${year}-${weekNum}`,
        label: `Week ${weekNum} (${format(weekStart, 'd MMM', { locale: nl })} - ${format(weekEnd, 'd MMM', { locale: nl })})`,
      })
    }
    return options
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    setWeek('')
    setDag('')
    setEmailBody('')
    getDeliveryEmailDefaults(order.id).then(defaults => {
      if ('error' in defaults) {
        setError(defaults.error as string)
        setLoading(false)
        return
      }
      setEmailTo(defaults.to || '')
      setEmailSubject(defaults.subject || '')
      setKlantNaam(defaults.klantNaam || '')
      setLoading(false)
    })
  }, [open, order.id])

  useEffect(() => {
    if (!week || !dag) {
      setEmailBody('')
      return
    }
    const dagLabel = DAGEN.find(d => d.value === dag)?.label || ''
    const weekNum = week.split('-')[1]
    const naam = klantNaam || order.relatie_bedrijfsnaam

    // Bereken exacte datum
    const [yearStr, weekStr] = week.split('-')
    const year = parseInt(yearStr)
    const weekNr = parseInt(weekStr)
    const jan4 = new Date(year, 0, 4)
    const weekStart = startOfISOWeek(jan4)
    const targetDate = addDays(addWeeks(weekStart, weekNr - getISOWeek(jan4)), parseInt(dag) - 1)
    const datumStr = format(targetDate, 'd MMMM yyyy', { locale: nl })

    setEmailBody(
      `Beste ${naam},\n\n` +
      `Hierbij bevestigen wij de levering van uw bestelling (${order.ordernummer}).\n\n` +
      `De levering staat gepland op:\n` +
      `- Week ${weekNum}, ${dagLabel.toLowerCase()}\n` +
      `- Datum: ${datumStr}\n\n` +
      `Indien u vragen heeft over de levering, neem dan gerust contact met ons op.\n\n` +
      `Met vriendelijke groet`
    )
  }, [week, dag, klantNaam, order])

  function computeDate(): string | null {
    if (!week || !dag) return null
    const [yearStr, weekStr] = week.split('-')
    const year = parseInt(yearStr)
    const weekNr = parseInt(weekStr)
    const jan4 = new Date(year, 0, 4)
    const weekStart = startOfISOWeek(jan4)
    const targetDate = addDays(addWeeks(weekStart, weekNr - getISOWeek(jan4)), parseInt(dag) - 1)
    return format(targetDate, 'yyyy-MM-dd')
  }

  async function handleSend() {
    const leverdatum = computeDate()
    if (!leverdatum || !emailTo) return
    setSending(true)
    setError('')
    const result = await planDelivery(order.id, {
      leverdatum,
      emailTo,
      emailSubject,
      emailBody,
    })
    setSending(false)
    if (result.error) {
      setError(result.error)
    } else {
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Levering plannen — ${order.ordernummer}`} className="max-w-2xl">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
            <strong>{order.relatie_bedrijfsnaam}</strong>
            {order.onderwerp && <span className="text-gray-500"> — {order.onderwerp}</span>}
          </div>

          {/* Week + Dag keuze */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="week" className="block text-sm font-medium text-gray-700 mb-1">
                <CalendarDays className="h-3.5 w-3.5 inline mr-1" />
                Leverweek
              </label>
              <select
                id="week"
                value={week}
                onChange={e => setWeek(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
              >
                <option value="">Selecteer week...</option>
                {weekOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dag" className="block text-sm font-medium text-gray-700 mb-1">Leverdag</label>
              <select
                id="dag"
                value={dag}
                onChange={e => setDag(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
              >
                <option value="">Selecteer dag...</option>
                {DAGEN.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Email velden */}
          <div>
            <label htmlFor="delivery_email_to" className="block text-sm font-medium text-gray-700 mb-1">
              <Mail className="h-3.5 w-3.5 inline mr-1" />
              Aan
            </label>
            <input
              id="delivery_email_to"
              type="email"
              value={emailTo}
              onChange={e => setEmailTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="E-mailadres klant"
            />
          </div>

          <div>
            <label htmlFor="delivery_email_subject" className="block text-sm font-medium text-gray-700 mb-1">Onderwerp</label>
            <input
              id="delivery_email_subject"
              type="text"
              value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="delivery_email_body" className="block text-sm font-medium text-gray-700 mb-1">Bericht</label>
            <textarea
              id="delivery_email_body"
              value={emailBody}
              onChange={e => setEmailBody(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono leading-relaxed"
              placeholder="Selecteer eerst een week en dag..."
            />
            <p className="text-xs text-gray-400 mt-1">De handtekening wordt automatisch onder het bericht geplaatst.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <Button variant="ghost" onClick={onClose} disabled={sending}>
              Annuleren
            </Button>
            <Button onClick={handleSend} disabled={sending || !week || !dag || !emailTo}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? 'Verzenden...' : 'Plannen & versturen'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
