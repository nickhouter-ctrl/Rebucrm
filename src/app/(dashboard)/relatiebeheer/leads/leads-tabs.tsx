'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Search, Sparkles } from 'lucide-react'
import { LeadsSearch } from './leads-search'
import { AiScout } from './ai-scout/ai-scout'

interface BestaandeLead {
  id: string
  bedrijfsnaam: string
  contactpersoon: string | null
  email: string | null
  telefoon: string | null
  plaats: string | null
  status: string
  notities: string | null
  created_at: string
  relatie_id: string | null
}

type Tab = 'zoek' | 'ai-scout'

export function LeadsTabs({ aiScoutLeads }: { aiScoutLeads: BestaandeLead[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('zoek')

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Zoek potentiële klanten via Google of laat de AI nieuwe leads extraheren uit gepaste tekst"
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Terug
          </Button>
        }
      />

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('zoek')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
            tab === 'zoek' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Search className="h-3.5 w-3.5" />
          Zoeken
        </button>
        <button
          onClick={() => setTab('ai-scout')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
            tab === 'ai-scout' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI Lead-Scout
          {aiScoutLeads.length > 0 && (
            <span className={`ml-1 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              tab === 'ai-scout' ? 'bg-gray-200 text-gray-700' : 'bg-gray-200 text-gray-500'
            }`}>{aiScoutLeads.length}</span>
          )}
        </button>
      </div>

      {tab === 'zoek' && <LeadsSearch />}
      {tab === 'ai-scout' && <AiScout bestaande={aiScoutLeads} embedded />}
    </div>
  )
}
