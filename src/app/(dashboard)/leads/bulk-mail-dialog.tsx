'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, Send, Check } from 'lucide-react'
import { sendLeadsBulkEmail } from '@/lib/actions'

interface Lead {
  id: string
  bedrijfsnaam: string
  email: string | null
  contactpersoon?: string | null
}

export function BulkMailDialog({ open, onClose, leads, onSent }: { open: boolean; onClose: () => void; leads: Lead[]; onSent: (aantal: number) => void }) {
  const [template, setTemplate] = useState<'eerste_contact' | 'na_bellen'>('eerste_contact')
  const [onderwerp, setOnderwerp] = useState('Kennismaking Rebu Kozijnen')
  const [bericht, setBericht] = useState('')
  const [extraInstructie, setExtraInstructie] = useState('')
  const [genereren, setGenereren] = useState(false)
  const [versturen, setVersturen] = useState(false)
  const [error, setError] = useState('')

  const leadsMetMail = leads.filter(l => l.email)

  async function handleGenereer() {
    setGenereren(true); setError('')
    try {
      const res = await fetch('/api/leads/ai-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, extraInstructie }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else { setOnderwerp(data.onderwerp); setBericht(data.bericht) }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI genereren mislukt')
    } finally {
      setGenereren(false)
    }
  }

  async function handleVerstuur() {
    if (!onderwerp.trim() || !bericht.trim()) { setError('Onderwerp en bericht zijn verplicht'); return }
    if (leadsMetMail.length === 0) { setError('Geen leads met e-mailadres'); return }
    setVersturen(true); setError('')
    try {
      const result = await sendLeadsBulkEmail(leadsMetMail.map(l => l.id), onderwerp, bericht)
      if (result.error) { setError(result.error); return }
      onSent(result.verstuurd || 0)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versturen mislukt')
    } finally {
      setVersturen(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Mail naar ${leadsMetMail.length} geselecteerde lead${leadsMetMail.length === 1 ? '' : 's'}`} className="max-w-3xl">
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}

        {/* Template keuze */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Mail-template</label>
          <div className="flex gap-2">
            <button onClick={() => setTemplate('eerste_contact')} className={`flex-1 px-4 py-3 rounded-lg border text-left transition-colors ${template === 'eerste_contact' ? 'border-[#00a66e] bg-[#00a66e]/5' : 'border-gray-200 hover:border-gray-300'}`}>
              <p className="text-sm font-medium text-gray-900">Eerste contact</p>
              <p className="text-xs text-gray-500 mt-0.5">Kennismaking / koud contact (nog niet gebeld)</p>
            </button>
            <button onClick={() => setTemplate('na_bellen')} className={`flex-1 px-4 py-3 rounded-lg border text-left transition-colors ${template === 'na_bellen' ? 'border-[#00a66e] bg-[#00a66e]/5' : 'border-gray-200 hover:border-gray-300'}`}>
              <p className="text-sm font-medium text-gray-900">Na telefonisch contact</p>
              <p className="text-xs text-gray-500 mt-0.5">Met brochure-links (‘als besproken’)</p>
            </button>
          </div>
        </div>

        {/* AI knop */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Extra instructies voor AI (optioneel)</label>
            <Input id="ai_instr" value={extraInstructie} onChange={e => setExtraInstructie(e.target.value)} placeholder="bv. 'benadruk kort levertermijn'" />
          </div>
          <Button onClick={handleGenereer} disabled={genereren} className="bg-[#00a66e] text-white hover:bg-[#008f5f]">
            {genereren ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Genereer met AI
          </Button>
        </div>

        {/* Onderwerp */}
        <Input id="onderwerp" label="Onderwerp" value={onderwerp} onChange={e => setOnderwerp(e.target.value)} />

        {/* Bericht */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bericht</label>
          <p className="text-[11px] text-gray-500 mb-1">Placeholders: <code>{'{{naam}}'}</code> (contactpersoon of bedrijfsnaam), <code>{'{{bedrijfsnaam}}'}</code>, <code>{'{{medewerker}}'}</code></p>
          <textarea
            rows={14}
            value={bericht}
            onChange={e => setBericht(e.target.value)}
            placeholder="Klik op 'Genereer met AI' of typ hier zelf het bericht..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#00a66e]"
          />
        </div>

        <div className="text-xs text-gray-500">
          {leadsMetMail.length} lead{leadsMetMail.length === 1 ? '' : 's'} met e-mailadres {leads.length - leadsMetMail.length > 0 && `· ${leads.length - leadsMetMail.length} zonder e-mail worden overgeslagen`}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose} disabled={versturen}>Annuleren</Button>
          <Button onClick={handleVerstuur} disabled={versturen || !onderwerp.trim() || !bericht.trim() || leadsMetMail.length === 0}>
            {versturen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Verstuur naar {leadsMetMail.length}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
