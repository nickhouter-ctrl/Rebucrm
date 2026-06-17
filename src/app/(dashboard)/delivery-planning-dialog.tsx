'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getDeliveryEmailDefaults, planLeveringIndicatief, planLeveringDefinitief } from '@/lib/actions'
import { RichTextEditor, plainTextToHtml } from '@/components/ui/rich-text-editor'
import { Send, Loader2, Mail, CalendarDays } from 'lucide-react'
import { getISOWeek, startOfISOWeek, addWeeks, addDays, format } from 'date-fns'
import { nl } from 'date-fns/locale'

export interface PlanOrder {
  id: string
  ordernummer: string
  relatie_bedrijfsnaam: string
  onderwerp: string | null
  leverweek?: string | null
  leverdatum?: string | null
}

type Mode = 'indicatief' | 'definitief'

const DAGEN = [
  { value: '1', label: 'Maandag' },
  { value: '2', label: 'Dinsdag' },
  { value: '3', label: 'Woensdag' },
  { value: '4', label: 'Donderdag' },
  { value: '5', label: 'Vrijdag' },
]

// ISO-week value 'YYYY-Www' → maandag-datum (yyyy-MM-dd).
function weekMaandag(week: string): string | null {
  if (!week) return null
  const [yearStr, weekStr] = week.split('-')
  const year = parseInt(yearStr)
  const weekNr = parseInt(weekStr)
  const jan4 = new Date(year, 0, 4)
  const weekStart = startOfISOWeek(jan4)
  const maandag = addWeeks(weekStart, weekNr - getISOWeek(jan4))
  return format(maandag, 'yyyy-MM-dd')
}

// ISO-week + dag (1-5) → exacte datum (yyyy-MM-dd).
function weekDagDatum(week: string, dag: string): string | null {
  if (!week || !dag) return null
  const [yearStr, weekStr] = week.split('-')
  const year = parseInt(yearStr)
  const weekNr = parseInt(weekStr)
  const jan4 = new Date(year, 0, 4)
  const weekStart = startOfISOWeek(jan4)
  const target = addDays(addWeeks(weekStart, weekNr - getISOWeek(jan4)), parseInt(dag) - 1)
  return format(target, 'yyyy-MM-dd')
}

// Bestaande leverweek-datum → bijbehorende select-value 'YYYY-Www'.
function dateToWeekValue(dateStr?: string | null): string {
  if (!dateStr) return ''
  const ws = startOfISOWeek(new Date(dateStr))
  return `${ws.getFullYear()}-${getISOWeek(ws)}`
}

export function DeliveryPlanningDialog({ open, onClose, order, mode }: {
  open: boolean
  onClose: () => void
  order: PlanOrder
  mode: Mode
}) {
  const isDef = mode === 'definitief'
  const [week, setWeek] = useState('')
  const [dag, setDag] = useState('')
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [klantNaam, setKlantNaam] = useState('')
  const [adresRegel, setAdresRegel] = useState('')
  const [medewerkerNaam, setMedewerkerNaam] = useState('')

  const weekOptions = useMemo(() => {
    const now = new Date()
    const options: { value: string; label: string; weekNum: number }[] = []
    for (let i = 0; i < 26; i++) {
      const weekStart = startOfISOWeek(addWeeks(now, i))
      const weekEnd = addDays(weekStart, 4)
      const weekNum = getISOWeek(weekStart)
      const year = weekStart.getFullYear()
      options.push({
        value: `${year}-${weekNum}`,
        weekNum,
        label: `Week ${weekNum} (${format(weekStart, 'd MMM', { locale: nl })} - ${format(weekEnd, 'd MMM', { locale: nl })})`,
      })
    }
    return options
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    // Bij definitief: prefill de week uit de eerder gekozen indicatieve leverweek.
    setWeek(isDef ? dateToWeekValue(order.leverweek) : '')
    setDag('')
    setEmailBody('')
    getDeliveryEmailDefaults(order.id).then(defaults => {
      if ('error' in defaults) {
        setError(defaults.error as string)
        setLoading(false)
        return
      }
      setEmailTo(defaults.to || '')
      setKlantNaam(defaults.klantNaam || '')
      setAdresRegel(defaults.adresRegel || '')
      setMedewerkerNaam(defaults.medewerkerNaam || '')
      setLoading(false)
    })
  }, [open, order.id, order.leverweek, isDef])

  // Genereer onderwerp + bericht zodra de benodigde velden gekozen zijn.
  useEffect(() => {
    if (!week || (isDef && !dag)) {
      setEmailBody('')
      return
    }
    const weekNum = week.split('-')[1]
    const weekLabel = weekOptions.find(o => o.value === week)?.label.replace(/^Week \d+ /, '').replace(/[()]/g, '') || ''
    const naam = klantNaam || order.relatie_bedrijfsnaam
    const groet = `Met vriendelijke groet,\n${medewerkerNaam || 'Rebu Kozijnen'}`
    const adresBlok = adresRegel ? `${adresRegel}\n\n` : ''

    if (isDef) {
      const dagLabel = DAGEN.find(d => d.value === dag)?.label || ''
      const datum = weekDagDatum(week, dag)
      const datumStr = datum ? format(new Date(datum), 'd MMMM yyyy', { locale: nl }) : ''
      setEmailSubject(`Levering ${order.ordernummer} — definitief gepland (week ${weekNum})`)
      setEmailBody(
        `Beste ${naam},\n\n` +
        `Goed nieuws: de levering van uw bestelling (${order.ordernummer}) is nu definitief ingepland.\n\n` +
        `Definitieve levering:\n` +
        `- Week ${weekNum}, ${dagLabel.toLowerCase()}\n` +
        `- Datum: ${datumStr}\n\n` +
        (adresRegel ? `Wij verzoeken u ervoor te zorgen dat de levering op onderstaand adres in ontvangst genomen kan worden:\n${adresBlok}` : '') +
        `Heeft u nog vragen over de levering? Neem dan gerust contact met ons op.\n\n` +
        groet
      )
    } else {
      setEmailSubject(`Levering ${order.ordernummer} — verwachte leverweek ${weekNum}`)
      setEmailBody(
        `Beste ${naam},\n\n` +
        `Bedankt voor uw bestelling (${order.ordernummer}). Wij hebben het transport voorlopig ingepland in week ${weekNum} (${weekLabel}).\n\n` +
        `Let op: deze leverweek is een indicatie en kan maximaal één week uitlopen. Zodra wij van de fabriek een definitieve leverdatum ontvangen, sturen wij u de definitieve week én dag.\n\n` +
        (adresRegel ? `Wilt u onderstaand leveringsadres controleren en bevestigen dat dit juist is?\n${adresBlok}` : `Wilt u uw leveringsadres controleren en bevestigen dat dit juist is?\n\n`) +
        `Graag een korte "OK" als antwoord, zodat wij weten dat u deze mail gelezen heeft.\n\n` +
        `Transportvoorwaarden ter informatie:\n` +
        `- Afleveradres: wij leveren op het adres dat u bij de bestelling heeft opgegeven. Wijkt het afleveradres hiervan af, dan zijn wij genoodzaakt extra logistieke kosten te rekenen (€50 + €1 per kilometer tussen het oude en nieuwe adres).\n` +
        `- Lengte vrachtwagen: onze vrachtwagens zijn ongeveer 20 meter lang (bakwagen + aanhanger). Laat het ons direct weten als deze lengte te lang is voor uw adres.\n` +
        `- Kooiaap: onze vrachtwagens beschikken over een kooiaap; het lossen blijft echter de verantwoordelijkheid van de klant.\n\n` +
        groet
      )
    }
  }, [week, dag, klantNaam, adresRegel, medewerkerNaam, order, isDef, weekOptions])

  const klaar = !!week && (!isDef || !!dag) && !!emailTo

  async function handleSend() {
    if (!klaar) return
    setSending(true)
    setError('')
    let result: { error?: string; success?: boolean }
    if (isDef) {
      const leverdatum = weekDagDatum(week, dag)
      if (!leverdatum) { setSending(false); return }
      result = await planLeveringDefinitief(order.id, {
        leverdatum,
        leverweek: weekMaandag(week),
        emailTo, emailSubject, emailBody,
      })
    } else {
      const leverweek = weekMaandag(week)
      if (!leverweek) { setSending(false); return }
      result = await planLeveringIndicatief(order.id, {
        leverweek,
        emailTo, emailSubject, emailBody,
      })
    }
    setSending(false)
    if (result.error) setError(result.error)
    else onClose()
  }

  const titel = isDef
    ? `Levering definitief plannen — ${order.ordernummer}`
    : `Levering plannen (indicatief) — ${order.ordernummer}`

  return (
    <Dialog open={open} onClose={onClose} title={titel} className="max-w-2xl">
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

          {/* Uitleg per fase */}
          <div className={`text-sm rounded-md p-3 ${isDef ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            {isDef
              ? 'Kies de definitieve leverweek én leverdag. De klant ontvangt een bevestigingsmail met de exacte datum.'
              : 'Kies de verwachte leverweek. De klant krijgt een mail dat dit een indicatie is (kan max. 1 week uitlopen) en dat de definitieve datum later volgt.'}
          </div>

          {/* Week (+ dag bij definitief) */}
          <div className={isDef ? 'grid grid-cols-2 gap-4' : ''}>
            <div>
              <label htmlFor="week" className="block text-sm font-medium text-gray-700 mb-1">
                <CalendarDays className="h-3.5 w-3.5 inline mr-1" />
                {isDef ? 'Definitieve leverweek' : 'Verwachte leverweek'}
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
            {isDef && (
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
            )}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Bericht</label>
            <RichTextEditor value={emailBody ? plainTextToHtml(emailBody) : ''} onChange={setEmailBody} minHeight={260} placeholder={isDef ? 'Selecteer eerst week en dag...' : 'Selecteer eerst een week...'} />
            <p className="text-xs text-gray-400 mt-1">De handtekening en bedrijfsgegevens worden automatisch onder het bericht geplaatst.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <Button variant="ghost" onClick={onClose} disabled={sending}>
              Annuleren
            </Button>
            <Button onClick={handleSend} disabled={sending || !klaar}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Verzenden...' : (isDef ? 'Definitief plannen & versturen' : 'Plannen & versturen')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
